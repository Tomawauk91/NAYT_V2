with open('app/tasks.py', 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    new_lines.append(line)
    if "if process.returncode != 0:" in line:
        pass
    if "overall_output += f\"\\n[!] Tool exited with code" in line:
        code_inject = """
                if mission_id is not None:
                    try:
                        from .database import SessionLocal
                        db_sess = SessionLocal()
                        parse_and_save_vulnerabilities(tool_key, tool_output, mission_id, "Autopilot", db_sess)
                        db_sess.commit()
                        db_sess.close()
                    except Exception as e:
                        logger.error(f"Error saving auto scan chunk: {e}")
"""
        new_lines.append(code_inject)

with open('app/tasks.py', 'w') as f:
    f.writelines(new_lines)
