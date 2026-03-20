import re

tool_output = """
PORT     STATE SERVICE        VERSION
22/tcp   open  ssh            OpenSSH 10.0p2 Debian 7 (protocol 2.0)
111/tcp  open  rpcbind        2-4 (RPC #100000)
3128/tcp open  http           Proxmox Virtual Environment REST API 3.0
8006/tcp open  wpl-analytics?
1 service unrecognized despite returning data. If you know the service/version, please submit the following fingerprint at https://nmap.org/cgi-bin/submit.cgi?new-service :
SF-Port8006-TCP:V=7.98%I=7%D=3/20%Time=69BD3D31%P=x86_64-pc-linux-gnu%r(HT
SF:TPOptions,D7,"HTTP/1\.0\x20501\x20method\x20'OPTIONS'\x20not\x20availab
SF:le\r\nCache-Control:\x20max-age=0\r\nConnection:\x20close\r\nDate:\x20F
SF:ri,\x2020\x20Mar\x202026\x2012:27:29\x20GMT\r\nPragma:\x20no-cache\r\nS
"""

http_ports = set()
for match in re.finditer(r'SF-Port(\d+)-(?:TCP|UDP):.*?HTTP', tool_output.replace('\n', ''), re.IGNORECASE):
    http_ports.add(match.group(1))

print("HTTP Ports from SF:", http_ports)

discovered_services = []
for line in tool_output.split('\n'):
    match = re.search(r'^(\d+)/(tcp|udp)\s+open\s+([^\s]+)(?:\s+(.*))?', line)
    if match:
        p = match.group(1)
        srv = match.group(3).lower()
        version = (match.group(4) or "").lower()
        
        if p in http_ports or "http" in version or "ssl" in version or "tls" in version:
            if "http" not in srv and "ssl" not in srv:
                srv = f"http ({srv})" 
                
        discovered_services.append((p, srv))

print(discovered_services)
