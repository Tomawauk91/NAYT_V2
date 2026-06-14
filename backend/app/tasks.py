import subprocess
import shutil
from pathlib import Path
from .celery_app import celery_app
import logging
import redis
import json
import os
import re
import requests
import time
import ipaddress
import shlex
import tempfile
from urllib.parse import quote_plus

logger = logging.getLogger(__name__)

redis_client = redis.Redis.from_url(os.getenv('REDIS_URL', 'redis://redis:6379/0'))
_exploitdb_cve_cache: dict[str, list[str]] = {}


def is_private_ip_target(target: str) -> bool:
    try:
        return ipaddress.ip_address((target or "").strip()).is_private
    except Exception:
        return False


def pick_existing_wordlist(candidates: list[str]) -> str:
    for candidate in candidates:
        if candidate and os.path.exists(candidate):
            return candidate
    return candidates[-1]


def build_hydra_wordlist_command(protocol: str, target: str, port: str | None = None) -> list[str]:
    usernames = pick_existing_wordlist([
        "/usr/share/seclists/Usernames/xato-net-10-million-usernames.txt",
        "/usr/share/seclists/Usernames/top-usernames-shortlist.txt",
        "/usr/share/wordlists/metasploit/unix_users.txt",
    ])
    passwords = "/usr/share/wordlists/rockyou.txt"
    command = ["hydra", "-L", usernames, "-P", passwords]
    if port:
        command.extend(["-s", str(port)])
    command.append(f"{protocol}://{target}")
    return command


def get_system_config_value(key: str) -> str:
    """Read a system config value from DB with a safe fallback."""
    try:
        from .database import SessionLocal
        from .models import SystemConfig

        db = SessionLocal()
        conf = db.query(SystemConfig).filter(SystemConfig.key == key).first()
        return (conf.value or "").strip() if conf else ""
    except Exception as e:
        logger.warning(f"Unable to read system config '{key}': {e}")
        return ""
    finally:
        try:
            db.close()
        except Exception:
            pass


def vt_scan_file_via_api(file_path: str, api_key: str) -> tuple[bool, str, str]:
    """Upload a file to VirusTotal API and return (success, output, analysis_id)."""
    if not os.path.exists(file_path):
        return False, f"[!] File not found: {file_path}", ""
    if not api_key:
        return False, "[!] VirusTotal API key is missing.", ""

    url = "https://www.virustotal.com/api/v3/files"
    headers = {"x-apikey": api_key}

    try:
        with open(file_path, "rb") as f:
            files = {"file": (os.path.basename(file_path), f)}
            resp = requests.post(url, headers=headers, files=files, timeout=120)

        if resp.status_code not in (200, 201):
            body = (resp.text or "")[:1200]
            return False, (
                f"[!] VirusTotal API error: HTTP {resp.status_code}\n"
                f"{body}"
            ), ""

        data = resp.json() if resp.content else {}
        analysis_id = data.get("data", {}).get("id")
        if analysis_id:
            return True, (
                "[+] VirusTotal file upload accepted.\n"
                f"Analysis ID: {analysis_id}\n"
                "[i] Waiting for final VirusTotal verdict..."
            ), analysis_id

        return True, "[+] VirusTotal file upload accepted.", ""
    except Exception as e:
        return False, f"[!] VirusTotal request failed: {e}", ""


def vt_get_analysis(analysis_id: str, api_key: str) -> tuple[bool, dict]:
    if not analysis_id:
        return False, {}
    url = f"https://www.virustotal.com/api/v3/analyses/{analysis_id}"
    headers = {"x-apikey": api_key}
    try:
        resp = requests.get(url, headers=headers, timeout=60)
        if resp.status_code != 200:
            return False, {}
        return True, resp.json() if resp.content else {}
    except Exception:
        return False, {}


def vt_poll_final_verdict(analysis_id: str, api_key: str, max_wait_seconds: int = 120, interval_seconds: int = 5) -> str:
    """Poll VirusTotal analysis and return a human-readable final summary."""
    elapsed = 0
    last_payload = {}
    while elapsed <= max_wait_seconds:
        ok, payload = vt_get_analysis(analysis_id, api_key)
        if ok and payload:
            last_payload = payload
            status = payload.get("data", {}).get("attributes", {}).get("status", "")
            if status == "completed":
                break
        time.sleep(interval_seconds)
        elapsed += interval_seconds

    attrs = last_payload.get("data", {}).get("attributes", {}) if last_payload else {}
    stats = attrs.get("stats", {}) if isinstance(attrs.get("stats", {}), dict) else {}
    results = attrs.get("results", {}) if isinstance(attrs.get("results", {}), dict) else {}

    malicious = int(stats.get("malicious", 0) or 0)
    suspicious = int(stats.get("suspicious", 0) or 0)
    harmless = int(stats.get("harmless", 0) or 0)
    undetected = int(stats.get("undetected", 0) or 0)

    if malicious >= 10:
        risk = "Critical"
    elif malicious >= 1 or suspicious >= 5:
        risk = "High"
    elif suspicious >= 1:
        risk = "Medium"
    else:
        risk = "Low"

    detected = []
    for engine, result_obj in results.items():
        if not isinstance(result_obj, dict):
            continue
        cat = (result_obj.get("category") or "").lower()
        sig = result_obj.get("result") or ""
        if cat in ["malicious", "suspicious"] and sig:
            detected.append(f"- {engine}: {sig}")
    detected = detected[:10]

    signatures_blob = "\n".join(detected)
    cves = sorted(set(re.findall(r"CVE-\d{4}-\d{4,8}", signatures_blob, re.IGNORECASE)))
    cves = [c.upper() for c in cves]

    mitre = ["T1204"]
    if malicious > 0:
        mitre.append("T1105")

    low_blob = signatures_blob.lower()
    if "ransom" in low_blob or "locker" in low_blob:
        mitre.append("T1486")
    if "phish" in low_blob:
        mitre.append("T1566")

    mitre = sorted(set(mitre))

    lines = [
        "[+] VirusTotal analysis completed.",
        f"Risk Level: {risk}",
        f"Detections: malicious={malicious}, suspicious={suspicious}, harmless={harmless}, undetected={undetected}",
        f"MITRE ATT&CK Mapping: {', '.join(mitre)}",
        f"CVEs: {', '.join(cves) if cves else 'None detected in VT signatures'}",
    ]
    if detected:
        lines.append("Top engine detections:")
        lines.extend(detected)

    return "\n".join(lines)


def default_mitre_for_tool(tool_name: str) -> str:
    t = (tool_name or "").lower()
    if "nmap" in t or "dns" in t or "whois" in t or "amass" in t or "whatweb" in t:
        return "T1046"
    if "nikto" in t or "sqlmap" in t or "zap" in t or "nuclei" in t:
        return "T1190"
    if "clam" in t or "virus" in t or "vt" in t:
        return "T1204"
    if "dependency" in t:
        return "T1195"
    return "T1595"


def extract_exploitdb_queries(tool_name: str, output: str) -> list[str]:
    """Build a short list of high-signal queries for ExploitDB correlation."""
    queries: list[str] = []
    lower_out = (output or "").lower()

    # Tool-guided service extraction (especially useful for nmap output)
    for line in (output or "").splitlines():
        match = re.search(r'^(\d+)/(tcp|udp)\s+open\s+([^\s]+)(?:\s+(.*))?$', line.strip(), re.IGNORECASE)
        if match:
            service = (match.group(3) or "").strip()
            version = (match.group(4) or "").strip()
            query = f"{service} {version}".strip()
            if query:
                queries.append(query)

    # Generic product markers commonly present in scan logs
    products = [
        "apache", "nginx", "openssl", "wordpress", "drupal", "joomla", "tomcat", "jetty",
        "jenkins", "kibana", "elasticsearch", "grafana", "phpmyadmin", "samba", "openssh",
        "mysql", "postgresql", "redis", "mongodb", "vsftpd", "proftpd", "iis", "docker",
        "kubernetes", "confluence", "jira", "gitlab", "roundcube"
    ]
    for product in products:
        if product in lower_out:
            queries.append(product)

    # Add tool name as a weak fallback signal
    if tool_name:
        queries.append(tool_name)

    # Deduplicate while preserving order and keep calls bounded
    unique_queries: list[str] = []
    seen = set()
    for q in queries:
        nq = re.sub(r'\s+', ' ', q).strip()
        if not nq:
            continue
        key = nq.lower()
        if key in seen:
            continue
        seen.add(key)
        unique_queries.append(nq)

    return unique_queries[:5]


def fetch_cves_from_exploitdb_query(query: str) -> list[str]:
    """Search ExploitDB and extract CVE IDs from returned HTML/JS content."""
    cache_key = (query or "").strip().lower()
    if not cache_key:
        return []
    if cache_key in _exploitdb_cve_cache:
        return _exploitdb_cve_cache[cache_key]

    url = f"https://www.exploit-db.com/search?text={quote_plus(query)}"
    headers = {
        "User-Agent": "Mozilla/5.0 (NAYT-V2 security scanner)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    try:
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code != 200:
            _exploitdb_cve_cache[cache_key] = []
            return []

        html = resp.text or ""
        cves = sorted(set([c.upper() for c in re.findall(r'CVE-\d{4}-\d{4,8}', html, re.IGNORECASE)]))
        _exploitdb_cve_cache[cache_key] = cves
        return cves
    except Exception:
        _exploitdb_cve_cache[cache_key] = []
        return []


def enrich_cves_from_exploitdb(tool_name: str, output: str, existing_cves: list[str] | None = None) -> tuple[list[str], bool]:
    """Best-effort CVE enrichment from ExploitDB based on scan logs/signatures."""
    existing = sorted(set([c.upper() for c in (existing_cves or [])]))
    if existing:
        return existing, False

    enabled = os.getenv("ENABLE_EXPLOITDB_ENRICHMENT", "1").strip().lower() not in ["0", "false", "no", "off"]
    if not enabled:
        return existing, False

    all_found = set(existing)
    enriched = False

    for query in extract_exploitdb_queries(tool_name, output):
        cves = fetch_cves_from_exploitdb_query(query)
        if cves:
            all_found.update(cves)
            enriched = True

    return sorted(all_found), enriched


def summarize_cve_mitre_for_logs(tool_name: str, output: str) -> str:
    cves = sorted(set([c.upper() for c in re.findall(r'CVE-\d{4}-\d{4,8}', output or "", re.IGNORECASE)]))
    cves, enriched_from_exploitdb = enrich_cves_from_exploitdb(tool_name, output, cves)
    mitre = sorted(set([m.upper() for m in re.findall(r'T\d{4}(?:\.\d{3})?', output or "", re.IGNORECASE)]))

    cve_line = ", ".join(cves) if cves else "CVE-Unknown"
    mitre_line = ", ".join(mitre) if mitre else default_mitre_for_tool(tool_name)
    source_line = "exploitdb-correlation" if enriched_from_exploitdb else "scan-output"
    return (
        "[NAYT] Threat Intel Summary\n"
        f"CVE: {cve_line}\n"
        f"MITRE ATT&CK: {mitre_line}\n"
        f"CVE Source: {source_line}"
    )

def parse_and_save_vulnerabilities(tool: str, output: str, mission_id: int, executed_by: str, db) -> int:
    """
    Parses output from various security tools, extracts CVE and Mitre Attack mappings,
    adapts CVSS score, and saves new findings in database.
    """
    from .models import Vulnerability

    # Accumulate findings
    vulns = []
    
    # Generic extraction of CVEs (like CVE-YYYY-NNNNNN)
    cve_matches = re.findall(r'CVE-\d{4}-\d{4,8}', output, re.IGNORECASE)
    unique_cves = list(set([c.upper() for c in cve_matches]))
    unique_cves, _ = enrich_cves_from_exploitdb(tool, output, unique_cves)
    cve_str = ", ".join(unique_cves) if unique_cves else None
    mitre_matches = re.findall(r'T\d{4}(?:\.\d{3})?', output, re.IGNORECASE)
    unique_mitre = list(set([m.upper() for m in mitre_matches]))
    mitre_str = ", ".join(unique_mitre) if unique_mitre else None

    # Tool specific parsing
    if tool == "nmap":
        for line in output.split('\n'):
            match = re.search(r'^(\d+)/(tcp|udp)\s+open\s+([^\s]+)(?:\s+(.*))?', line)
            if match:
                port = match.group(1)
                protocol = match.group(2)
                service = match.group(3)
                version = match.group(4) or ""
                title = f"Open Port: {port}/{protocol} ({service})"
                desc = f"An open port was found running {service}.\nVersion info: {version}"
                
                vulns.append({
                    "title": title,
                    "severity": "Low",
                    "description": desc,
                    "mitre_attack": "T1046",  # Network Service Discovery (Mitre technique)
                    "cve": cve_str or "CVE-Unknown",
                    "initial_cvss": 2.5
                })

    elif tool == "nikto":
        for line in output.split('\n'):
            if "+ OSVDB" in line or (line.startswith("+") and "OSVDB" in line) or "OSVDB-" in line:
                parts = line.split(":", 1)
                title = parts[0].strip() if len(parts) > 0 else "Nikto Finding"
                desc = parts[1].strip() if len(parts) > 1 else line
                
                # Check for line specific CVEs
                line_cves = re.findall(r'CVE-\d{4}-\d{4,8}', line, re.IGNORECASE)
                line_cve_str = ", ".join(list(set([c.upper() for c in line_cves]))) if line_cves else cve_str

                vulns.append({
                    "title": title,
                    "severity": "Medium",
                    "description": desc,
                    "mitre_attack": "T1190",  # Exploit Public-Facing Application
                    "cve": line_cve_str or "CVE-Unknown",
                    "initial_cvss": 5.5
                })

    elif tool == "sqlmap" or "sqlmap" in tool:
        lower_out = output.lower()
        if "sql injection" in lower_out or "payload:" in lower_out or "vulnerable" in lower_out:
            title = "SQL Injection Vulnerability Detected"
            desc = "SQLmap successfully identified a SQL Injection vulnerability on the target. This vulnerability allows an attacker to control the backend database and potentially gain Command Execution."
            vulns.append({
                "title": title,
                "severity": "Critical",
                "description": desc + f"\n\nRaw SQLmap log sample:\n{output[:1000]}",
                "mitre_attack": "T1190",  # Exploit Public-Facing Application
                "cve": cve_str or "CVE-Unknown",
                "initial_cvss": 9.0
            })

    elif "dependency-check" in tool or "dependency" in tool:
        title = "Vulnerable Third-Party Library / Dependency"
        desc = "Software dependency analysis identified libraries containing publicly disclosed security vulnerabilities (CVEs)."
        vulns.append({
            "title": title,
            "severity": "High",
            "description": desc + f"\n\nIdentified CVEs:\n{cve_str or 'Various dependencies vulnerabilities'}",
            "mitre_attack": "T1195",  # Supply Chain Compromise
            "cve": cve_str or "CVE-Unknown",
            "initial_cvss": 7.5
        })

    elif "clam" in tool or "clamav" in tool:
        title = "Malware File / Web Shell Signatures Detected (ClamAV)"
        desc = "Antivirus/antimalware scans detected malicious payloads or suspicious shell scripts residing on the file system."
        vulns.append({
            "title": title,
            "severity": "Critical",
            "description": desc + f"\n\nScanner details:\n{output[:1000]}",
            "mitre_attack": "T1204",  # User Execution (Malicious File / Payload)
            "cve": cve_str,
            "initial_cvss": 9.5
        })

    elif "virustotal" in tool:
        title = "Malicious Asset Flagged by VirusTotal API"
        desc = "Known malware file hashes or suspicious communication indicators were analyzed and confirmed malicious by VirusTotal scanners."
        vulns.append({
            "title": title,
            "severity": "Critical",
            "description": desc + f"\n\nVirusTotal Analysis output details:\n{output[:1200]}",
            "mitre_attack": mitre_str or "T1105",  # Ingress Tool Transfer (C2 / Malicious payload retrieval)
            "cve": cve_str or "CVE-Unknown",
            "initial_cvss": 9.0
        })

    else:
        # Fallback generic parsing for custom tool commands or unknown tools
        lower_out = output.lower()
        if "critical" in lower_out or "high" in lower_out or "vulnerability" in lower_out or "exploit" in lower_out or "vulnerable" in lower_out:
            title = f"{tool.capitalize()} Security Finding"
            desc = f"Security scan tool '{tool}' identified a significant finding on the target system.\n\nRaw Finding details snippet:\n{output[:1000]}"
            severity = "High" if "critical" in lower_out or "high" in lower_out else "Medium"
            initial_cvss = 8.0 if severity == "High" else 5.5
            vulns.append({
                "title": title,
                "severity": severity,
                "description": desc,
                "mitre_attack": "T1210",  # Exploitation of Remote Service
                "cve": cve_str,
                "initial_cvss": initial_cvss
            })

    # Save to Database with CVSS adaptations
    v_added = 0
    for item in vulns:
        # Check if already exists
        exists = db.query(Vulnerability).filter_by(mission_id=mission_id, title=item["title"]).first()
        if not exists:
            cvss = item["initial_cvss"]
            
            # --- ADAPT SCORE CVSS ---
            # Increase rating if specific CVE or Mitre Techniques are mapping
            normalized_cve = (item.get("cve") or "").strip() if isinstance(item.get("cve"), str) else (item.get("cve") or "")
            if not normalized_cve:
                normalized_cve = "CVE-Unknown"

            normalized_mitre = (item.get("mitre_attack") or "").strip() if isinstance(item.get("mitre_attack"), str) else (item.get("mitre_attack") or "")
            if not normalized_mitre:
                normalized_mitre = default_mitre_for_tool(tool)

            if normalized_cve != "CVE-Unknown":
                cvss += 1.0  # +1.0 for specific verified CVEs
            mitre_codes = [m.strip().upper() for m in normalized_mitre.split(",") if m.strip()]
            if any(m in ["T1190", "T1210", "T1195"] for m in mitre_codes):
                cvss += 0.5  # +0.5 for direct public-facing exploit technique risks
            if item["severity"] == "Critical":
                cvss += 0.5  # Add factor for severity-verified tags
                
            # Limit score to [0.0 - 10.0]
            cvss = min(max(cvss, 0.0), 10.0)
            
            # Recompute severity label based on updated/adapted CVSS
            severity = item["severity"]
            if cvss >= 9.0:
                severity = "Critical"
            elif cvss >= 7.0:
                severity = "High"
            elif cvss >= 4.0:
                severity = "Medium"
            elif cvss > 0.0:
                severity = "Low"
            else:
                severity = "Info"

            v = Vulnerability(
                title=item["title"],
                severity=severity,
                description=item["description"],
                evidence=output[:3000] if len(output) > 3000 else output,
                cvss=round(cvss, 1),
                mission_id=mission_id,
                executed_by=executed_by,
                cve=normalized_cve,
                mitre_attack=normalized_mitre
            )
            db.add(v)
            v_added += 1

    return v_added


def check_tool_availability(tool_name: str) -> bool:
    """Check if a tool is installed and available in the PATH."""
    return shutil.which(tool_name) is not None

@celery_app.task(bind=True)
def run_scan_task(self, tool: str, target: str, options: str = "", mission_id: int = None, executed_by: str = "Automated Scan"):
    """
    Executes a security tool against a target.
    
    Args:
        tool: The name of the tool (nmap, nikto, etc.)
        target: The target URL or IP
        options: Additional command line flags
    """
    
    # Authorized tools list to prevent arbitrary command execution (basic security)
    AUTHORIZED_TOOLS = [
        "nmap", "nikto", "sqlmap", "dirb", "gobuster", 
        "curl", "wget", "netcat", "nc", "dnsrecon", 
        "whatweb", "whois", "dig", "hydra",
        "sslscan", "traceroute", "enum4linux", "smbclient", "ftp", "testssl.sh",
        "amass", "theharvester", "msfconsole", "tshark", "suricata", "zaproxy", 
        "ffuf", "nuclei", "aircrack-ng", "netexec", "nxc", "sslyze", 
        "responder", "bloodhound-python", "hashcat", "john",
        "clamscan", "freshclam", "dependency-check",
        # Commercial tools (stub handling below)
        "acunetix", "nessus-cli", "vt", "cuckoo"
    ]

    # Commercial/external tools that require a license or external API — return a clear stub message
    COMMERCIAL_TOOLS = {
        "acunetix": (
            "[NAYT] Acunetix requires a commercial license and a running Acunetix server.\n"
            "Please configure your Acunetix server URL and API key in the Admin Panel.\n"
            "Manual usage: Run scans directly from your Acunetix dashboard and import results."
        ),
        "nessus-cli": (
            "[NAYT] Nessus requires a Tenable license and a running Nessus server.\n"
            "Please configure your Nessus server in the Admin Panel.\n"
            "Manual usage: Run `nessuscli scan new --targets target --name scan_name` on the Nessus host."
        ),
        "cuckoo": (
            "[NAYT] Cuckoo Sandbox requires a full Cuckoo installation with VMs.\n"
            "See: https://docs.cuckoosandbox.org/\n"
            "Manual submission: cuckoo submit /path/to/malware"
        ),
    }

    if tool in COMMERCIAL_TOOLS:
        stub_msg = COMMERCIAL_TOOLS[tool]
        self.update_state(state='PROGRESS', meta={'output': stub_msg})
        return {"status": "completed", "output": stub_msg, "command": tool}

    vt_api_key = ""
    if tool == "vt":
        vt_api_key = os.getenv("VT_API_KEY", "").strip() or get_system_config_value("virustotal_api_key")
        if not vt_api_key:
            stub_msg = (
                "[NAYT] VirusTotal requires an API key.\n"
                "Configure it in Admin Panel -> System Config -> VirusTotal API Key,\n"
                "or set VT_API_KEY as environment variable.\n"
                "Usage: vt file scan /path/to/file"
            )
            self.update_state(state='PROGRESS', meta={'output': stub_msg})
            return {"status": "completed", "output": stub_msg, "command": tool}

    if tool not in AUTHORIZED_TOOLS:
        return {"status": "error", "output": f"Tool '{tool}' is not authorized or supported."}

    if tool == "vt":
        tokens = options.split()
        if len(tokens) < 3 or tokens[0] != "file" or tokens[1] != "scan":
            msg = (
                "[NAYT] Supported VT syntax: vt file scan /path/to/file\n"
                "Example: vt file scan /app/backend/requirements.txt"
            )
            return {"status": "error", "output": msg}

        file_path = tokens[2]
        ok, vt_output, analysis_id = vt_scan_file_via_api(file_path, vt_api_key)
        if ok and analysis_id:
            final_verdict = vt_poll_final_verdict(analysis_id, vt_api_key)
            vt_output = f"{vt_output}\n{final_verdict}"
        self.update_state(state='PROGRESS', meta={'output': vt_output})

        if mission_id is not None and vt_output:
            try:
                from .database import SessionLocal

                db = SessionLocal()
                parse_and_save_vulnerabilities("virustotal-manual", vt_output, mission_id, executed_by, db)
                db.commit()
            except Exception as e:
                logger.error(f"Error saving VT manual finding: {e}")
            finally:
                db.close()

        return {
            "status": "completed" if ok else "error",
            "command": f"vt file scan {file_path}",
            "output": vt_output,
        }

    if not check_tool_availability(tool):
        install_hint = ""
        if tool == "clamscan":
            install_hint = "\nHint: Install with: apt-get install -y clamav clamav-daemon && freshclam"
        elif tool == "dependency-check":
            install_hint = "\nHint: Download from https://github.com/jeremylong/DependencyCheck/releases"
        return {"status": "error", "output": f"Tool '{tool}' is not installed in the container backend.{install_hint}"}

    # Construct command
    # The frontend usually sends the full command line arguments in 'options' (including the target)
    try:
        cmd = [tool] + shlex.split(options)
    except ValueError:
        cmd = [tool] + options.split()

    if tool == "clamscan":
        clam_db_dir = Path("/var/lib/clamav")
        has_signatures = any(clam_db_dir.glob("*.cvd")) or any(clam_db_dir.glob("*.cld"))
        if not has_signatures and check_tool_availability("freshclam"):
            try:
                fresh_proc = subprocess.run(
                    ["freshclam"],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    timeout=180,
                )
                bootstrap_output = (fresh_proc.stdout or "").strip()
                if bootstrap_output:
                    self.update_state(
                        state='PROGRESS',
                        meta={
                            'output': f"[NAYT] Initializing ClamAV signatures...\n{bootstrap_output}\n",
                            'cmd': ["freshclam"],
                        },
                    )
            except Exception as e:
                logger.warning(f"Unable to bootstrap ClamAV signatures: {e}")

    # Nikto expects a host argument via -h / -host; a bare positional URL is rejected.
    if tool == "nikto" and len(cmd) == 1:
        cmd = ["nikto", "-h", target, "-ask", "no", "-nointeractive"]
    # Just in case options is empty (shouldn't happen with current frontend logic, but for safety)
    elif len(cmd) == 1:
        cmd.append(target)

    # dnsrecon on some distributions still expects a domain with -r.
    if tool == "dnsrecon" and is_private_ip_target(target):
        if "-r" in cmd and "-d" not in cmd:
            cmd.extend(["-d", "local"])
        if "-r" in cmd and "-n" not in cmd:
            cmd.extend(["-n", "127.0.0.11"])

    # Avoid ZAP proxy port conflicts between concurrent runs.
    if tool == "zaproxy":
        if "-dir" in cmd:
            try:
                dir_index = cmd.index("-dir")
                if dir_index + 1 < len(cmd):
                    cmd[dir_index + 1] = f"/tmp/.ZAP_{self.request.id}"
            except ValueError:
                pass
        else:
            cmd.extend(["-dir", f"/tmp/.ZAP_{self.request.id}"])

        if "-port" not in cmd:
            dynamic_port = str(20000 + (int(self.request.id.replace("-", ""), 16) % 20000))
            cmd.extend(["-port", dynamic_port])

    # Execute responder with python3 script entrypoint when available.
    if tool == "responder" and os.path.exists("/usr/share/responder/Responder.py"):
        cmd = ["python3", "/usr/share/responder/Responder.py"] + cmd[1:]

    msf_rc_path: str | None = None
    if tool == "msfconsole" and "-x" in cmd:
        try:
            x_index = cmd.index("-x")
            msf_commands = cmd[x_index + 1] if x_index + 1 < len(cmd) else ""
            parsed_commands = [part.strip() for part in msf_commands.split(";") if part.strip()]
            with tempfile.NamedTemporaryFile("w", delete=False, suffix=".rc") as rc_file:
                for line in parsed_commands:
                    rc_file.write(line + "\n")
                msf_rc_path = rc_file.name
            cmd = [value for value in cmd if value not in ["-x", msf_commands]]
            cmd.extend(["-r", msf_rc_path])
        except Exception as e:
            logger.warning(f"Unable to translate msfconsole -x command to rc file: {e}")

    logger.info(f"Executing command: {' '.join(cmd)}")
    self.update_state(state='PROGRESS', meta={'cmd': cmd, 'output': 'Starting scan...'})

    try:
        process_env = os.environ.copy()
        if tool == "vt" and vt_api_key:
            process_env["VT_API_KEY"] = vt_api_key

        # Run command with Popen to stream output
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, # Merge stderr into stdout
            text=True,
            bufsize=1, # Line buffered
            env=process_env
        )

        accumulated_output = ""
        # Read line by line
        for line in process.stdout:
            accumulated_output += line
            redis_client.publish(f"scan_logs_{self.request.id}", json.dumps({"type": "log", "content": line}))
            # Update task state with current accumulated output
            # Note: For very large outputs, this might become heavy for Redis/Celery.
            # Ideally we would only send the "new" chunk, but the frontend replaces the full log.
            self.update_state(state='PROGRESS', meta={
                'output': accumulated_output,
                'cmd': cmd
            })
            
        process.wait()

        if msf_rc_path:
            try:
                os.remove(msf_rc_path)
            except Exception:
                pass

        intel_summary = summarize_cve_mitre_for_logs(tool, accumulated_output)
        accumulated_output = f"{accumulated_output}\n{intel_summary}\n"
        self.update_state(state='PROGRESS', meta={'output': accumulated_output, 'cmd': cmd})
        

        # --- PARSE & SAVE FINDINGS ---
        if mission_id is not None:
            try:
                from .database import SessionLocal
                from .models import Vulnerability
                import re
                
                db = SessionLocal()
                vulns_added = 0
                
                
                # Call generic parser
                vulns_added = parse_and_save_vulnerabilities(tool, accumulated_output, mission_id, executed_by, db)
                if vulns_added > 0:
                    db.commit()
            except Exception as e:
                logger.error(f"Error parsing vulnerabilities: {e}")
            finally:
                db.close()
        # -----------------------------


        if process.returncode != 0 and tool != "nikto": # Nikto often returns non-zero even on success/warnings
            redis_client.publish(f"scan_logs_{self.request.id}", json.dumps({"type": "status", "content": "FAILURE"}))
            return {
                "status": "failed", 
                "return_code": process.returncode,
                "command": " ".join(cmd),
                "output": accumulated_output,
                "error": "Check output for details"
            }
            
        redis_client.publish(f"scan_logs_{self.request.id}", json.dumps({"type": "status", "content": "SUCCESS"}))
        return {
            "status": "completed",
            "command": " ".join(cmd),
            "output": accumulated_output
        }

    except Exception as e:
        return {"status": "error", "output": str(e)}


@celery_app.task(bind=True)
def run_file_scan_task(self, file_path: str, original_name: str, mission_id: int = None, executed_by: str = "Automated Scan"):
    """Scan an uploaded file with VirusTotal API."""
    safe_name = original_name or os.path.basename(file_path)
    output_lines = [
        f"[NAYT] VirusTotal scan started for: {safe_name}",
        f"[NAYT] Stored path: {file_path}",
    ]

    def _emit_progress() -> None:
        joined = "\n".join(output_lines) + "\n"
        self.update_state(state='PROGRESS', meta={'output': joined})

    _emit_progress()

    if not os.path.exists(file_path):
        err = f"Uploaded file not found: {file_path}"
        return {"status": "error", "output": err}

    try:
        vt_output_for_parser = ""
        vt_api_key = os.getenv("VT_API_KEY", "").strip() or get_system_config_value("virustotal_api_key")
        if vt_api_key:
            output_lines.append(f"$ vt file scan {file_path}")
            _emit_progress()
            ok, vt_output, analysis_id = vt_scan_file_via_api(file_path, vt_api_key)
            if ok and analysis_id:
                vt_final = vt_poll_final_verdict(analysis_id, vt_api_key)
                vt_output = f"{vt_output}\n{vt_final}"
            output_lines.extend(vt_output.split("\n"))
            vt_output_for_parser = vt_output
            _emit_progress()
            if not ok:
                output_lines.append("[!] VirusTotal scan step failed.")
        else:
            output_lines.append("[i] VirusTotal skipped (virustotal_api_key not configured).")

        output_lines.extend(summarize_cve_mitre_for_logs("virustotal-file", "\n".join(output_lines)).split("\n"))
        final_output = "\n".join(output_lines)

        if mission_id is not None:
            try:
                from .database import SessionLocal

                db = SessionLocal()
                if vt_output_for_parser:
                    parse_and_save_vulnerabilities("virustotal-file", vt_output_for_parser, mission_id, executed_by, db)
                db.commit()
            except Exception as e:
                logger.error(f"Error saving file scan finding: {e}")
            finally:
                db.close()

        return {
            "status": "completed",
            "command": f"file_scan:{safe_name}",
            "output": final_output,
        }
    except Exception as e:
        return {"status": "error", "output": str(e)}
    finally:
        try:
            os.remove(file_path)
        except Exception:
            pass

@celery_app.task(bind=True)
def run_auto_scan_task(self, target: str, selected_tool_names: list = None, port: str = "", mission_id: int = None, executed_by: str = "Automated Scan"):
    """
    Runs a defined sequence of tools against a target automatically.
    Adapts based on Nmap output.
    """
    import re
    
    # If no tools selected, default to a safe subset
    if not selected_tool_names:
        selected_tool_names = ["nmap", "whois", "dnsrecon", "whatweb"]

    overall_output = f"=== AUTO SCAN REPORT FOR {target} ===\n"
    if port:
        overall_output += f"Target Port: {port}\n"
    overall_output += f"Tools Requested: {', '.join(selected_tool_names)}\n\n"
    
    # Send initial state
    self.update_state(state='PROGRESS', meta={
        'output': overall_output,
        'current_step': 'Initializing...'
    })

    # 1. Run Nmap First (if requested, or implicitly to adapt)
    nmap_output = ""
    discovered_services = [] # List of tuples: (port, service)
    
    if "nmap" in selected_tool_names:
        # Move Nmap to the front to ensure it runs first
        selected_tool_names.remove("nmap")
        selected_tool_names.insert(0, "nmap")

    # Dynamic execution loops
    for tool_key in selected_tool_names:
        
        # Adaptation logic
        # If it's not nmap, and we have discovered services, we might need to run the tool multiple times, or not at all.
        cmds_to_run = [] # list of (name, cmd_list)
        
        if tool_key == "nmap":
            if port:
                nmap_cmd = ["nmap", "-sV", "-T4", "-v", "-p", port, target]
                cmds_to_run.append(("Nmap Targeted Service Scan", nmap_cmd))
            else:
                # STEP 1: Fast Port Discovery Scan
                # Replacing -sS with -sT (Connect Scan) and lowering rate. 
                # Docker NAT networking often drops SYN packets or rate-limits them inconsistently, hiding ports like 8006.
                fast_cmd = ["nmap", "-sT", "-p-", "-T4", "--min-rate", "500", "--max-retries", "3", "-n", target]
                overall_output += f"--- Nmap Fast Port Discovery ---\n> {' '.join(fast_cmd)}\n"
                self.update_state(state='PROGRESS', meta={'output': overall_output, 'current_step': 'Nmap Discovery Scan'})
                
                open_ports = []
                try:
                    disc_proc = subprocess.Popen(fast_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
                    for line in disc_proc.stdout:
                        overall_output += line
                        redis_client.publish(f"scan_logs_{self.request.id}", json.dumps({"type": "log", "content": line}))
                        self.update_state(state='PROGRESS', meta={'output': overall_output, 'current_step': 'Nmap Discovery Scan'})
                        
                        match_table = re.search(r'^(\d+)/(tcp|udp)\s+open', line)
                        match_verb = re.search(r'Discovered open port (\d+)/(tcp|udp)', line)
                        port_num = match_table.group(1) if match_table else match_verb.group(1) if match_verb else None
                        
                        if port_num and port_num not in open_ports:
                            open_ports.append(port_num)
                            
                    disc_proc.wait()
                except Exception as e:
                    overall_output += f"[ERROR] Nmap Discovery Failed: {str(e)}\n"
                
                overall_output += "\n" + "="*30 + "\n\n"
                
                # STEP 2: Targeted Service Scan
                if not open_ports:
                    overall_output += "[!] No open ports found in fast discovery phase. Falling back to HTTP/HTTPS.\n"
                    open_ports = ["80", "443"]
                    
                ports_str = ",".join(open_ports)
                # Removing version-light to ensure full fingerprinting is done,
                # but adding max-retries for the version probes to prevent hanging
                nmap_cmd = ["nmap", "-p", ports_str, "-sV", "-T4", "--max-retries", "2", "-v", target]
                cmds_to_run.append(("Nmap Targeted Service Scan", nmap_cmd))
            
        elif tool_key == "whois":
            cmds_to_run.append(("Whois", ["whois", target]))
        elif tool_key == "hydra":
            if is_private_ip_target(target):
                cmds_to_run.append(("Hydra FTP Wordlist", build_hydra_wordlist_command("ftp", target, port or "21")))
            else:
                cmds_to_run.append(("Hydra SSH Wordlist", build_hydra_wordlist_command("ssh", target, port or "22")))
        elif tool_key == "dnsrecon":
            if is_private_ip_target(target):
                cmds_to_run.append(("DNS Recon (Reverse)", ["dnsrecon", "-r", f"{target}-{target}", "-d", "local", "-n", "127.0.0.11"]))
            else:
                cmds_to_run.append(("DNS Recon", ["dnsrecon", "-d", target]))
        elif tool_key == "dig":
            if is_private_ip_target(target):
                cmds_to_run.append(("Dig Reverse", ["dig", "-x", target]))
            else:
                cmds_to_run.append(("Dig Trace", ["dig", target, "+trace"]))
        elif tool_key == "traceroute":
            cmds_to_run.append(("Traceroute", ["traceroute", "-n", target]))
        elif tool_key == "amass":
            if is_private_ip_target(target):
                overall_output += "--- AMASS ---\n[i] Skipped: Amass is not suitable for private IP targets. Use DNS reverse lookup tools instead.\n\n"
                self.update_state(state='PROGRESS', meta={'output': overall_output, 'current_step': 'Skipping amass'})
            else:
                cmds_to_run.append(("Amass Enum", ["amass", "enum", "-d", target]))
        elif tool_key == "theharvester":
            if is_private_ip_target(target):
                overall_output += "--- THEHARVESTER ---\n[i] Skipped: theHarvester is domain-oriented and not suitable for private IP targets.\n\n"
                self.update_state(state='PROGRESS', meta={'output': overall_output, 'current_step': 'Skipping theharvester'})
            else:
                cmds_to_run.append(("theHarvester", ["theHarvester", "-d", target, "-b", "all"]))
            
        else:
            # Service-dependent tools
            if not discovered_services:
                # If no services found (e.g. nmap failed or found nothing), we still might try fallback
                discovered_services = [(port if port else "80", "http"), (port if port else "443", "https")]
                overall_output += f"[!] No specific services parsed from Nmap, defaulting to http ports: {discovered_services}\n"

            for srv_port, service in discovered_services:
                service = service.lower()
                
                # HTTP/HTTPS tools
                if "http" in service or "ssl" in service or "tls" in service:
                    protocol = "https" if "https" in service or "ssl" in service or "tls" in service or srv_port == "443" else "http"
                    base_url = f"{protocol}://{target}:{srv_port}"
                    if srv_port in ["80", "443"]:
                        base_url = f"{protocol}://{target}"
                        
                    if tool_key == "whatweb":
                        cmds_to_run.append((f"WhatWeb ({srv_port})", ["whatweb", base_url]))
                    elif tool_key == "nikto":
                        cmds_to_run.append((f"Nikto ({srv_port})", ["nikto", "-h", base_url, "-ask", "no", "-nointeractive", "-maxtime", "5m"]))
                    elif tool_key == "sqlmap":
                         cmds_to_run.append((f"SQLMap Batch ({srv_port})", ["sqlmap", "-u", base_url, "--batch"]))
                    elif tool_key == "dirb":
                         cmds_to_run.append((f"Dirb ({srv_port})", ["dirb", base_url]))
                    elif tool_key == "gobuster":
                         cmds_to_run.append((f"Gobuster ({srv_port})", ["gobuster", "dir", "-u", base_url, "-w", "/usr/share/wordlists/dirb/common.txt", "-k", "-b", "404,301,302,500,501"]))
                    elif tool_key == "curl":
                         cmds_to_run.append((f"Curl Headers ({srv_port})", ["curl", "-k", "-I", base_url]))
                    elif tool_key == "nuclei":
                         cmds_to_run.append((f"Nuclei ({srv_port})", ["nuclei", "-u", base_url]))
                    elif tool_key == "zap":
                         cmds_to_run.append((f"ZAP ({srv_port})", ["zaproxy", "-cmd", "-dir", f"/tmp/.ZAP_{self.request.id}", "-quickurl", base_url]))
                    elif tool_key == "ffuf":
                         cmds_to_run.append((f"Ffuf ({srv_port})", ["ffuf", "-u", f"{base_url}/FUZZ", "-w", "/usr/share/wordlists/dirb/common.txt", "-mc", "all", "-fc", "404,301,302,500,501"]))
                    
                    if ("ssl" in service or "tls" in service or protocol == "https"):
                        if tool_key == "sslscan":
                            cmds_to_run.append((f"SSLScan ({srv_port})", ["sslscan", f"{target}:{srv_port}"]))
                        elif tool_key == "testssl":
                            cmds_to_run.append((f"TestSSL ({srv_port})", ["testssl.sh", "--fast", f"{target}:{srv_port}"]))
                        elif tool_key == "sslyze":
                            cmds_to_run.append((f"SSLyze ({srv_port})", ["sslyze", f"{target}:{srv_port}"]))

                # SSH tools
                elif "ssh" in service and tool_key == "hydra":
                    cmds_to_run.append((f"Hydra SSH ({srv_port})", build_hydra_wordlist_command("ssh", target, srv_port)))
                    
                # SMB tools
                elif ("netbios" in service or "smb" in service or "microsoft-ds" in service) and srv_port in ["139", "445"]:
                     if tool_key == "enum4linux":
                         cmds_to_run.append(("Enum4Linux", ["enum4linux", "-a", target]))
                     elif tool_key == "smbclient":
                         cmds_to_run.append(("SMB Shares", ["smbclient", "-L", f"//{target}", "-N"]))
                     elif tool_key == "netexec":
                         cmds_to_run.append(("NetExec SMB", ["nxc", "smb", target]))
                
                # FTP tools
                elif "ftp" in service and tool_key == "ftp":
                     cmds_to_run.append((f"FTP Anonymous ({srv_port})", ["nmap", "--script", "ftp-anon", "-p", srv_port, "-Pn", target]))
                 elif "ftp" in service and tool_key == "hydra":
                     cmds_to_run.append((f"Hydra FTP ({srv_port})", build_hydra_wordlist_command("ftp", target, srv_port)))

        if not cmds_to_run and tool_key != "nmap" and tool_key not in ["whois", "dnsrecon", "dig", "traceroute", "amass", "theharvester"]:
            overall_output += f"--- {tool_key.upper()} ---\n[i] Skipped: No matching services detected for this tool.\n\n"
            self.update_state(state='PROGRESS', meta={'output': overall_output, 'current_step': f'Skipping {tool_key}'})
            continue

        for name, cmd in cmds_to_run:
            if not shutil.which(cmd[0]):
                overall_output += f"--- {name} ---\n[!] Tool '{cmd[0]}' not found.\n\n"
                continue
                 
            # Update state so frontend knows what's running
            overall_output += f"--- {name} ---\n> {' '.join(cmd)}\n"
            self.update_state(state='PROGRESS', meta={
                'output': overall_output,
                'current_step': name
            })
            
            try:
                # Stream tool output
                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT, # Merge stderr
                    text=True,
                    bufsize=1
                )
                
                tool_output = ""
                for line in process.stdout:
                    overall_output += line
                    tool_output += line
                    redis_client.publish(f"scan_logs_{self.request.id}", json.dumps({"type": "log", "content": line}))
                    # Update task state frequently
                    self.update_state(state='PROGRESS', meta={
                        'output': overall_output,
                        'current_step': name
                    })
                
                process.wait()
                
                if process.returncode != 0:
                    overall_output += f"\n[!] Tool exited with code {process.returncode}\n"

                if mission_id is not None:
                    try:
                        from .database import SessionLocal
                        db_sess = SessionLocal()
                        parse_and_save_vulnerabilities(tool_key, tool_output, mission_id, "Autopilot", db_sess)
                        db_sess.commit()
                        db_sess.close()
                    except Exception as e:
                        logger.error(f"Error saving auto scan chunk: {e}")
                    
                # Parse Nmap output to adapt future tools
                if tool_key == "nmap":
                    # Look for hidden HTTP signatures in Nmap's raw service fingerprints
                    http_ports = set()
                    for match_fp in re.finditer(r'SF-Port(\d+)-(?:TCP|UDP):.*?HTTP', tool_output.replace('\n', ''), re.IGNORECASE):
                        http_ports.add(match_fp.group(1))

                    # Looks for lines like: 80/tcp  open  http
                    # or: 22/tcp  open  ssh     OpenSSH 8.2p1
                    for line in tool_output.split('\n'):
                        match = re.search(r'^(\d+)/(tcp|udp)\s+open\s+([^\s]+)(?:\s+(.*))?', line)
                        if match:
                            p = match.group(1)
                            srv = match.group(3)
                            version = (match.group(4) or "").lower()
                            
                            # If Nmap's fingerprint had HTTP, or the version contains HTTP/SSL keywords, 
                            # force it to be treated as a web service for subsequent tools
                            if p in http_ports or "http" in version or "ssl" in version or "tls" in version:
                                if "http" not in srv.lower() and "ssl" not in srv.lower() and "tls" not in srv.lower():
                                    srv = f"http ({srv})"

                            discovered_services.append((p, srv))
                    
                    if discovered_services:
                        srv_list_str = ', '.join([f"{p} ({s})" for p, s in discovered_services])
                        overall_output += f"\n[*] Discovered active services: {srv_list_str}\n"

            except Exception as e:
                overall_output += f"[ERROR] {str(e)}\n"
                
            overall_output += "\n" + "="*30 + "\n\n"
            
    if mission_id is not None:
        try:
            from .database import SessionLocal
            from .models import Vulnerability
            
            db = SessionLocal()
            title = "Autonomous Scan Summary"
            desc = f"Complete execution log of the autonomous scan sequence against {target}."
            
            exists = db.query(Vulnerability).filter_by(mission_id=mission_id, title=title).first()
            if not exists:
                v = Vulnerability(
                    title=title,
                    severity="Info",
                    description=desc,
                    evidence=overall_output,
                    mission_id=mission_id,
                    executed_by=executed_by,
                    cve="CVE-Unknown",
                    mitre_attack="T1595",
                )
                db.add(v)
            else:
                exists.description = desc
                exists.evidence = overall_output
                exists.executed_by = executed_by
                if not exists.cve:
                    exists.cve = "CVE-Unknown"
                if not exists.mitre_attack:
                    exists.mitre_attack = "T1595"
            
            db.commit()
            db.close()
        except Exception as e:
            logger.error(f"Error saving autonomous scan log: {e}")

    redis_client.publish(f"scan_logs_{self.request.id}", json.dumps({"type": "status", "content": "SUCCESS"}))
    return {
        "status": "completed",
        "command": "auto_scan_adaptive",
        "output": overall_output
    }

@celery_app.task(bind=True)
def run_custom_command_task(self, command: str, mission_id: int = None, executed_by: str = "Automated Scan"):
    logger.info(f"Executing custom command: {command}")
    self.update_state(state='PROGRESS', meta={'cmd': command, 'output': 'Starting custom command...'})
    try:
        process = subprocess.Popen(
            command,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        accumulated_output = ""
        for line in process.stdout:
            accumulated_output += line
            redis_client.publish(f"scan_logs_{self.request.id}", json.dumps({"type": "log", "content": line}))
            self.update_state(state='PROGRESS', meta={
                'output': accumulated_output,
                'cmd': command
            })
        process.wait()
        
        status_msg = "completed" if process.returncode == 0 else "failed"
        redis_client.publish(f"scan_logs_{self.request.id}", json.dumps({"type": "status", "content": "SUCCESS" if process.returncode == 0 else "FAILURE"}))
        return {
            "status": status_msg, 
            "return_code": process.returncode,
            "command": command,
            "output": accumulated_output
        }
    except Exception as e:
        return {"status": "error", "output": str(e)}
