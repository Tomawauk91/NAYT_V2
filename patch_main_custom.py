import re

with open('backend/app/main.py', 'r') as f:
    orig = f.read()

route = """
@app.post("/scan/custom")
def trigger_custom_scan(scan: schemas.CustomCommandRequest, current_user: models.User = Depends(auth.get_current_user)):
    task = tasks.run_custom_command_task.delay(scan.command)
    return {"task_id": task.id, "status": "submitted"}
"""

if "@app.post(\"/scan/custom\")" not in orig:
    # insert before @app.post("/scan/{task_id}/stop")
    new_content = orig.replace('@app.post("/scan/{task_id}/stop")', route + '\n@app.post("/scan/{task_id}/stop")')
    with open('backend/app/main.py', 'w') as f:
        f.write(new_content)
    print("Patched main.py")
else:
    print("Already patched")
