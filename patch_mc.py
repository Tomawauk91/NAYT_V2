with open('components/MissionControl.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    'await toolsService.runScan(tool, mission.target, options);',
    'await toolsService.runScan(tool, mission.target, options, mission.id);'
)
content = content.replace(
    'await toolsService.runCustomScan(command);',
    'await toolsService.runCustomScan(command, mission.id);'
)
content = content.replace(
    'await toolsService.runAutoScan(mission.target, selectedAutoTools, targetPort);',
    'await toolsService.runAutoScan(mission.target, selectedAutoTools, targetPort, mission.id);'
)

with open('components/MissionControl.tsx', 'w') as f:
    f.write(content)
