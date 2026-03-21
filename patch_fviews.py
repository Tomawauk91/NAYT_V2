with open('components/FunctionalViews.tsx', 'r') as f:
    content = f.read()

# Replace v.criticality with v.severity or status
content = content.replace('v.criticality', '(v.severity || v.criticality)')
content = content.replace('v.status', '(v.status || "Open")')
content = content.replace('v.dateFound', '(v.dateFound || new Date().toLocaleDateString())')

with open('components/FunctionalViews.tsx', 'w') as f:
    f.write(content)
