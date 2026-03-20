import re
output = """
Starting Nmap 7.98 ( https://nmap.org ) at 2026-03-20 13:26 +0000
Nmap scan report for 192.168.1.240
Host is up (0.00018s latency).
Not shown: 65532 filtered tcp ports (no-response)
PORT     STATE SERVICE
22/tcp   open  ssh
111/tcp  open  rpcbind
3128/tcp open  http
"""
open_ports = []
for line in output.split("\n"):
    match = re.search(r'^(\d+)/(tcp|udp)\s+open', line)
    if match:
        open_ports.append(match.group(1))
print(open_ports)
