with open('app/tasks.py', 'r') as f:
    text = f.read()

target = """                if process.returncode != 0:
                    overall_output += f"\\n[!] Tool exited with code {process.returncode}\\n"

                # Parse Nmap output to adapt future tools"""

replacement = """                if process.returncode != 0:
                    overall_output += f"\\n[!] Tool exited with code {process.returncode}\\n"

                if mission_id is not None:
                    try:
                        from .database import SessionLocal
                        db_sess = SessionLocal()
                        # call parser for the tool
                        parse_and_save_vulnerabilities(tool_key, tool_output, mission_id, "Autopilot", db_sess)
                        db_sess.commit()
                        db_sess.close()
                    except Exception as e:
                        logger.error(f"Error saving auto scan chunk: {e}")

                # Parse Nmap output to adapt future tools"""

text = text.replace(target, replacement)
with open('app/tasks.py', 'w') as f:
    f.write(text)
