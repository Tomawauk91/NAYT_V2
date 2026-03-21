with open('backend/app/main.py', 'r') as f:
    content = f.read()

content = content.replace("task = tasks.run_custom_command_task.delay(scan.command)", 
                          "task = tasks.run_custom_command_task.delay(scan.command, scan.mission_id)")

with open('backend/app/main.py', 'w') as f:
    f.write(content)
