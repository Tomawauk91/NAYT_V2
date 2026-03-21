import re

with open('backend/app/main.py', 'r') as f:
    content = f.read()

content = content.replace("task = tasks.run_scan_task.delay(scan.tool, scan.target, scan.options)", 
                          "task = tasks.run_scan_task.delay(scan.tool, scan.target, scan.options, scan.mission_id)")
content = content.replace("task = tasks.run_auto_scan_task.delay(scan.target, scan.tools, scan.port)", 
                          "task = tasks.run_auto_scan_task.delay(scan.target, scan.tools, scan.port, scan.mission_id)")
content = content.replace("task = tasks.run_custom_command_task.delay(req.command)", 
                          "task = tasks.run_custom_command_task.delay(req.command, req.mission_id)")

with open('backend/app/main.py', 'w') as f:
    f.write(content)
