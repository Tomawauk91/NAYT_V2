import subprocess
import shutil
from .celery_app import celery_app
import logging
import redis
import json
import os

logger = logging.getLogger(__name__)

redis_client = redis.Redis.from_url(os.getenv('REDIS_URL', 'redis://redis:6379/0'))

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
        "responder", "bloodhound-python", "hashcat", "john"
    ]
    
    if tool not in AUTHORIZED_TOOLS:
        return {"status": "error", "output": f"Tool '{tool}' is not authorized or supported."}

    if not check_tool_availability(tool):
        return {"status": "error", "output": f"Tool '{tool}' is not installed in the container backend."}

    # Construct command
    # The frontend usually sends the full command line arguments in 'options' (including the target)
    cmd = [tool] + options.split()

    # Just in case options is empty (shouldn't happen with current frontend logic, but for safety)
    if len(cmd) == 1:
        cmd.append(target)

    logger.info(f"Executing command: {' '.join(cmd)}")
    self.update_state(state='PROGRESS', meta={'cmd': cmd, 'output': 'Starting scan...'})

    try:
        # Run command with Popen to stream output
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, # Merge stderr into stdout
            text=True,
            bufsize=1 # Line buffered
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


        # --- PARSE & SAVE FINDINGS ---
        if mission_id is not None:
            try:
                from .database import SessionLocal
                from .models import Vulnerability
                import re
                
                db = SessionLocal()
                vulns_added = 0
                
                if tool == "nmap":
                    # Parse Nmap Output
                    for line in accumulated_output.split('\n'):
                        match = re.search(r'^(\d+)/(tcp|udp)\s+open\s+([^\s]+)(?:\s+(.*))?', line)
                        if match:
                            port = match.group(1)
                            protocol = match.group(2)
                            service = match.group(3)
                            version = match.group(4) or ""
                            title = f"Open Port: {port}/{protocol} ({service})"
                            desc = f"An open port was found running {service}.\nVersion info: {version}"
                            
                            # Check if exists
                            exists = db.query(Vulnerability).filter_by(mission_id=mission_id, title=title).first()
                            if not exists:
                                v = Vulnerability(title=title, severity="Low", description=desc, mission_id=mission_id)
                                db.add(v)
                                vulns_added += 1
                                
                elif tool == "nikto":
                    # Parse Nikto Output
                    for line in accumulated_output.split('\n'):
                        if "+ OSVDB" in line or (line.startswith("+") and "OSVDB" in line):
                            parts = line.split(":", 1)
                            title = parts[0].strip() if len(parts) > 0 else "Nikto Finding"
                            desc = parts[1].strip() if len(parts) > 1 else line
                            
                            exists = db.query(Vulnerability).filter_by(mission_id=mission_id, title=title).first()
                            if not exists:
                                v = Vulnerability(title=title, severity="Medium", description=desc, mission_id=mission_id)
                                db.add(v)
                                vulns_added += 1
                                
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
def run_auto_scan_task(self, target: str, selected_tool_names: list = None, port: str = "", mission_id: int = None):
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
        elif tool_key == "dnsrecon":
            cmds_to_run.append(("DNS Recon", ["dnsrecon", "-d", target]))
        elif tool_key == "dig":
            cmds_to_run.append(("Dig Trace", ["dig", target, "+trace"]))
        elif tool_key == "traceroute":
            cmds_to_run.append(("Traceroute", ["traceroute", "-n", target]))
        elif tool_key == "amass":
            cmds_to_run.append(("Amass Enum", ["amass", "enum", "-d", target]))
        elif tool_key == "theharvester":
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
                         cmds_to_run.append((f"ZAP ({srv_port})", ["zaproxy", "-cmd", "-quickurl", base_url]))
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
                    cmds_to_run.append((f"Hydra SSH ({srv_port})", ["hydra", "-l", "root", "-P", "/usr/share/wordlists/rockyou.txt", f"ssh://{target}:{srv_port}"]))
                    
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
                     cmds_to_run.append((f"FTP Anonymous ({srv_port})", ["ftp", "-n", target, srv_port]))

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
                v = Vulnerability(title=title, severity="Info", description=desc, evidence=overall_output, mission_id=mission_id, executed_by="Autopilot")
                db.add(v)
            else:
                exists.description = desc
                exists.evidence = overall_output
                exists.executed_by = "Autopilot"
            
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
def run_custom_command_task(self, command: str, mission_id: int = None):
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
