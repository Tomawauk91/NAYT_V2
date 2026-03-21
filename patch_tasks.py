import re

with open('backend/app/tasks.py', 'r') as f:
    content = f.read()

# Replace run_scan_task signature
content = content.replace(
    'def run_scan_task(self, tool: str, target: str, options: str = ""):',
    'def run_scan_task(self, tool: str, target: str, options: str = "", mission_id: int = None):'
)

# Add the parse and save logic before returning
parse_logic = """
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
                    for line in accumulated_output.split('\\n'):
                        match = re.search(r'^(\d+)/(tcp|udp)\s+open\s+([^\s]+)(?:\s+(.*))?', line)
                        if match:
                            port = match.group(1)
                            protocol = match.group(2)
                            service = match.group(3)
                            version = match.group(4) or ""
                            title = f"Open Port: {port}/{protocol} ({service})"
                            desc = f"An open port was found running {service}.\\nVersion info: {version}"
                            
                            # Check if exists
                            exists = db.query(Vulnerability).filter_by(mission_id=mission_id, title=title).first()
                            if not exists:
                                v = Vulnerability(title=title, severity="Low", description=desc, mission_id=mission_id)
                                db.add(v)
                                vulns_added += 1
                                
                elif tool == "nikto":
                    # Parse Nikto Output
                    for line in accumulated_output.split('\\n'):
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
"""

content = content.replace('        if process.returncode != 0 and tool != "nikto":', parse_logic + '\n        if process.returncode != 0 and tool != "nikto":')


# Auto scan task signature
content = content.replace(
    'def run_auto_scan_task(self, target: str, selected_tool_names: list = None, port: str = ""):',
    'def run_auto_scan_task(self, target: str, selected_tool_names: list = None, port: str = "", mission_id: int = None):'
)

# Auto scan parse logic - let's skip for auto scan now or just adapt it later
# Actually we can just do custom command task

content = content.replace(
    'def run_custom_command_task(self, command: str):',
    'def run_custom_command_task(self, command: str, mission_id: int = None):'
)

with open('backend/app/tasks.py', 'w') as f:
    f.write(content)

