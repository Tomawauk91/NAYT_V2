import re

with open("components/MissionControl.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# Replace block of buttons with a map of tools
tools_def = """
                    <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                        {[
                            { name: 'Nmap Port Scan', label: t.nmapBtn, desc: t.nmapDesc, cmd: `nmap -sT -sV -T4 -v ${targetPort ? '-p ' + targetPort : '-p-'} ${mission.target}`, color: 'group-hover:text-blue-500' },
                            { name: 'Nikto Web Scan', label: t.niktoBtn, desc: t.niktoDesc, cmd: `nikto -h ${mission.target} ${targetPort ? '-p ' + targetPort : ''} -ask no -nointeractive -maxtime 5m`, color: 'group-hover:text-orange-500' },
                            { name: 'Hydra Brute Force', label: t.hydraBtn, desc: t.hydraDesc, cmd: `hydra -l admin -P /usr/share/wordlists/rockyou.txt ssh://${mission.target}${targetPort ? ':' + targetPort : ''}`, color: 'group-hover:text-red-500' },
                            { name: 'SQLMap', label: t.sqlmapBtn, desc: t.sqlmapDesc, cmd: `sqlmap -u http://${mission.target}${targetPort ? ':' + targetPort : ''} --batch`, color: 'group-hover:text-blue-500' },
                            { name: 'Dirb', label: t.dirbBtn, desc: t.dirbDesc, cmd: `dirb http://${mission.target}${targetPort ? ':' + targetPort : ''}`, color: 'group-hover:text-blue-500' },
                            { name: 'Gobuster', label: t.gobusterBtn, desc: t.gobusterDesc, cmd: `gobuster dir -u http://${mission.target}${targetPort ? ':' + targetPort : ''} -w /usr/share/wordlists/dirb/common.txt -k -b 404,301,302,500,501`, color: 'group-hover:text-blue-500' },
                            { name: 'Curl', label: t.curlBtn, desc: t.curlDesc, cmd: `curl -k -I ${mission.target}${targetPort ? ':' + targetPort : ''}`, color: 'group-hover:text-blue-500' },
                            { name: 'Wget', label: t.wgetBtn, desc: t.wgetDesc, cmd: `wget ${mission.target}${targetPort ? ':' + targetPort : ''}`, color: 'group-hover:text-blue-500' },
                            { name: 'Netcat', label: t.netcatBtn, desc: t.netcatDesc, cmd: `nc -zv ${mission.target} 80`, color: 'group-hover:text-blue-500' },
                            { name: 'DNSRecon', label: t.dnsreconBtn, desc: t.dnsreconDesc, cmd: `dnsrecon -d ${mission.target}`, color: 'group-hover:text-blue-500' },
                            { name: 'WhatWeb', label: t.whatwebBtn, desc: t.whatwebDesc, cmd: `whatweb ${mission.target}`, color: 'group-hover:text-blue-500' },
                            { name: 'Whois', label: t.whoisBtn, desc: t.whoisDesc, cmd: `whois ${mission.target}`, color: 'group-hover:text-blue-500' },
                            { name: 'Dig', label: t.digBtn, desc: t.digDesc, cmd: `dig ${mission.target}`, color: 'group-hover:text-blue-500' },
                            { name: 'SSLScan', label: t.sslscanBtn, desc: t.sslscanDesc, cmd: `sslscan ${mission.target}`, color: 'group-hover:text-blue-500' },
                            { name: 'TestSSL', label: t.testsslBtn, desc: t.testsslDesc, cmd: `testssl.sh ${mission.target}${targetPort ? ':' + targetPort : ''}`, color: 'group-hover:text-blue-500' },
                            { name: 'Traceroute', label: t.tracerouteBtn, desc: t.tracerouteDesc, cmd: `traceroute ${mission.target}`, color: 'group-hover:text-blue-500' },
                            { name: 'Enum4Linux', label: t.enum4linuxBtn, desc: t.enum4linuxDesc, cmd: `enum4linux -a ${mission.target}`, color: 'group-hover:text-blue-500' },
                            { name: 'SMBClient', label: t.smbclientBtn, desc: t.smbclientDesc, cmd: `smbclient -L ${mission.target} -N`, color: 'group-hover:text-blue-500' },
                            { name: 'FTP', label: t.ftpBtn, desc: t.ftpDesc, cmd: `ftp -n ${mission.target}`, color: 'group-hover:text-blue-500' },
                            { name: 'Amass', label: "Amass", desc: "Subdomain Enum", cmd: `amass enum -d ${mission.target}`, color: 'group-hover:text-blue-500' },
                            { name: 'TheHarvester', label: "TheHarvester", desc: "OSINT Gathering", cmd: `theHarvester -d ${mission.target} -b all`, color: 'group-hover:text-blue-500' },
                            { name: 'Metasploit PortScan', label: "Metasploit", desc: "Auxiliary TCP Scan", cmd: `msfconsole -q -x "use auxiliary/scanner/portscan/tcp; set RHOSTS ${mission.target}; run; exit"`, color: 'group-hover:text-red-500' },
                            { name: 'TShark', label: "Wireshark (CLI)", desc: "Capture 10s Traffic", cmd: `tshark -i eth0 -a duration:10 -f "host ${mission.target}"`, color: 'group-hover:text-blue-500' },
                            { name: 'Suricata', label: "Suricata", desc: "IDS Network Monitor", cmd: `suricata -i eth0 --init-errors-fatal`, color: 'group-hover:text-blue-500' },
                            { name: 'ZAP', label: "OWASP ZAP", desc: "Web Scanner", cmd: `zaproxy -cmd -quickurl http://${mission.target}${targetPort ? ':' + targetPort : ''}`, color: 'group-hover:text-blue-500' },
                            { name: 'Nuclei', label: "Nuclei", desc: "Vuln Scanner", cmd: `nuclei -u http://${mission.target}`, color: 'group-hover:text-orange-500' },
                            { name: 'Ffuf', label: "Ffuf", desc: "Fast Fuzzer", cmd: `ffuf -u http://${mission.target}/FUZZ -w /usr/share/wordlists/dirb/common.txt`, color: 'group-hover:text-blue-500' },
                            { name: 'NetExec', label: "NetExec", desc: "Network Execution", cmd: `nxc smb ${mission.target} ${targetPort ? '--port ' + targetPort : ''}`, color: 'group-hover:text-red-500' },
                            { name: 'Aircrack-ng', label: "Aircrack", desc: "Speed Benchmark", cmd: `aircrack-ng --test`, color: 'group-hover:text-blue-500' },
                            { name: 'John', label: "John the Ripper", desc: "Speed Test", cmd: `john --test`, color: 'group-hover:text-red-500' },
                            { name: 'Hashcat', label: "Hashcat", desc: "GPU Benchmark", cmd: `hashcat -b`, color: 'group-hover:text-red-500' },
                            { name: 'Responder', label: "Responder", desc: "Analyze Mode", cmd: `responder -I eth0 -A`, color: 'group-hover:text-red-500' },
                            { name: 'BloodHound', label: "BloodHound", desc: "AD Collection", cmd: `bloodhound-python -u 'User' -p 'P@ssword!' -d ${mission.target} -c All`, color: 'group-hover:text-blue-500' },
                        ].map((tool, idx) => (
                            <div key={idx} className="w-full bg-slate-50 dark:bg-slate-700 p-4 rounded-lg flex items-center justify-between group transition-all">
                                <div className="flex-1 cursor-pointer" onClick={() => !isCommandRunning && runCommand(tool.name, tool.cmd)}>
                                    <span className="block text-slate-900 dark:text-white font-medium">{tool.label}</span>
                                    <span className="text-xs text-slate-500 dark:text-slate-400">{tool.desc}</span>
                                </div>
                                <div className="flex gap-2 items-center">
                                    <button 
                                        onClick={() => { setCustomCLIInput(tool.cmd); setActiveTab('custom'); }}
                                        title="Modifier la commande avant exécution"
                                        className="text-slate-400 hover:text-blue-500 p-1.5 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button 
                                        onClick={() => runCommand(tool.name, tool.cmd)}
                                        disabled={isCommandRunning}
                                        className={`text-slate-400 dark:text-slate-500 ${tool.color} transition-colors disabled:opacity-50`}
                                    >
                                        <PlayCircle size={20} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
"""

# Extract the part between <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar"> ... </div></div>
# It is between line 414 and 538

start_str = r'<div className="space-y-3 max-h-\[600px\] overflow-y-auto pr-2 custom-scrollbar">'
end_str = r'</button>\s*</div>\s*</div>'

content = re.sub(start_str + '.*?' + end_str, tools_def + '</div>', content, flags=re.DOTALL)

with open("components/MissionControl.tsx", "w", encoding="utf-8") as f:
    f.write(content)
