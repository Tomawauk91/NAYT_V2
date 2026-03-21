with open('services/apiService.ts', 'r') as f:
    content = f.read()

content = content.replace(
    'async runScan(tool: string, target: string, options: string = "") {',
    'async runScan(tool: string, target: string, options: string = "", mission_id: number = 1) {'
)
content = content.replace(
    'body: JSON.stringify({ tool, target, options })',
    'body: JSON.stringify({ tool, target, options, mission_id })'
)

content = content.replace(
    'async runAutoScan(target: string, tools: string[], port: string = "") {',
    'async runAutoScan(target: string, tools: string[], port: string = "", mission_id: number = 1) {'
)
content = content.replace(
    'body: JSON.stringify({ target, tools, port })',
    'body: JSON.stringify({ target, tools, port, mission_id })'
)

content = content.replace(
    'async runCustomScan(command: string) {',
    'async runCustomScan(command: string, mission_id: number = 1) {'
)
content = content.replace(
    'body: JSON.stringify({ command })',
    'body: JSON.stringify({ command, mission_id })'
)

with open('services/apiService.ts', 'w') as f:
    f.write(content)
