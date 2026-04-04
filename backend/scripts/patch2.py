import re

with open('app/tasks.py', 'r') as f:
    text = f.read()

# Replace massive parsing block in run_scan_task with helper call
# We find where it says IF tool == "nmap":
start_idx = text.find('if tool == "nmap":')
end_idx = text.find('if vulns_added > 0:', start_idx)

if start_idx != -1 and end_idx != -1:
    new_text = """
                # Call generic parser
                vulns_added = parse_and_save_vulnerabilities(tool, accumulated_output, mission_id, executed_by, db)
                """
    text = text[:start_idx] + new_text + text[end_idx:]

with open('app/tasks.py', 'w') as f:
    f.write(text)
