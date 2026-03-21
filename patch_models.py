import re

with open('backend/app/models.py', 'r') as f:
    content = f.read()

# Add status to Vulnerability model
content = content.replace(
    'description = Column(Text)',
    'description = Column(Text)\n    status = Column(String, default="Open")'
)

with open('backend/app/models.py', 'w') as f:
    f.write(content)
