with open('backend/app/tasks.py', 'r') as f:
    content = f.read()

nuclei_logic = """
                elif tool == "nuclei":
                    # Parse Nuclei Output
                    # Example: [CVE-2020-14883] [http] [critical] http://example.com
                    for line in accumulated_output.split('\\n'):
                        match = re.search(r'^\[(.*?)\]\s+\[(.*?)\]\s+\[(.*?)\]\s+(.*)', line)
                        if match:
                            vuln_id = match.group(1)
                            proto = match.group(2)
                            severity = match.group(3).capitalize()
                            target_url = match.group(4)
                            title = f"Nuclei Finding: {vuln_id}"
                            desc = f"Nuclei found a vulnerability ({vuln_id}) via {proto} at {target_url}"
                            
                            exists = db.query(Vulnerability).filter_by(mission_id=mission_id, title=title).first()
                            if not exists:
                                v = Vulnerability(title=title, severity=severity, description=desc, mission_id=mission_id)
                                db.add(v)
                                vulns_added += 1
                                
"""

content = content.replace('if vulns_added > 0:', nuclei_logic + '\n                if vulns_added > 0:')

with open('backend/app/tasks.py', 'w') as f:
    f.write(content)
