with open('backend/app/schemas.py', 'r') as f:
    content = f.read()

content = content.replace(
    'description: str',
    'description: str\n    status: Optional[str] = "Open"'
)

with open('backend/app/schemas.py', 'w') as f:
    f.write(content)
