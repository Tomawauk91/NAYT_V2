with open('types.ts', 'r') as f:
    content = f.read()

content = content.replace(
    'criticality: Criticality;',
    'criticality?: Criticality;\n  severity?: string;'
)
content = content.replace(
    'status: Status;',
    'status?: Status;'
)
content = content.replace(
    'dateFound: string;',
    'dateFound?: string;'
)

with open('types.ts', 'w') as f:
    f.write(content)
