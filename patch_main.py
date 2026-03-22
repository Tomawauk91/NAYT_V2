with open("backend/app/main.py", "r") as f:
    content = f.read()

new_content = content.replace(
    '''out_filename = f"Report_{mission.name.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d%H%M%S')}.docx"''',
    '''out_filename = f"{mission.name}_{client_name}_{datetime.now().strftime('%Y-%m-%d')}.docx".replace(' ', '_')'''
)

with open("backend/app/main.py", "w") as f:
    f.write(new_content)
