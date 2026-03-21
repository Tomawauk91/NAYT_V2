with open('components/Dashboard.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    'acc[v.criticality] = (acc[v.criticality] || 0) + 1;',
    'const sev = v.severity || v.criticality || Criticality.INFO;\n    acc[sev] = (acc[sev] || 0) + 1;'
)
content = content.replace(
    "v.criticality === Criticality.CRITICAL",
    "(v.severity || v.criticality) === Criticality.CRITICAL"
)

with open('components/Dashboard.tsx', 'w') as f:
    f.write(content)
