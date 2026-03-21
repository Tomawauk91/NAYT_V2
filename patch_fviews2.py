with open('components/FunctionalViews.tsx', 'r') as f:
    content = f.read()

content = content.replace('const getSeverityColor = (severity: Criticality) => {', 'const getSeverityColor = (severity: any) => {')

with open('components/FunctionalViews.tsx', 'w') as f:
    f.write(content)
