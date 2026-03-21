import re

def parse_nmap_to_vulns(output: str, mission_id: int):
    # This is dummy logic to see if we can extract useful stuff
    # Nmap format: 80/tcp open http Apache httpd 2.4.41 ((Ubuntu))
    vulns = []
    lines = output.split('\n')
    for line in lines:
        match = re.search(r'^(\d+)/(tcp|udp)\s+open\s+([^\s]+)(?:\s+(.*))?', line)
        if match:
            port = match.group(1)
            protocol = match.group(2)
            service = match.group(3)
            version = match.group(4) or ""
            
            title = f"Open Port: {port}/{protocol} ({service})"
            desc = f"An open port was found running {service}.\nVersion info: {version}"
            vulns.append({
                "mission_id": mission_id,
                "title": title,
                "severity": "Low",
                "description": desc
            })
    return vulns

def parse_nikto_to_vulns(output: str, mission_id: int):
    vulns = []
    lines = output.split('\n')
    for line in lines:
        if "+ OSVDB" in line or (line.startswith("+") and "OSVDB" in line):
            # Example: + OSVDB-3092: /admin/: This might be interesting.
            parts = line.split(":", 1)
            title = parts[0].strip() if len(parts) > 0 else "Nikto Finding"
            desc = parts[1].strip() if len(parts) > 1 else line
            vulns.append({
                "mission_id": mission_id,
                "title": title,
                "severity": "Medium",
                "description": desc
            })
    return vulns
