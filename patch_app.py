with open('App.tsx', 'r') as f:
    content = f.read()

# Patch onBack
content = content.replace(
    'onBack={() => setSelectedMission(null)}',
    'onBack={() => { fetchMissions(); setSelectedMission(null); }}'
)

# Patch sidebar click
content = content.replace(
    'setActiveView(item.id);\n                        setSelectedMission(null);\n                        setSidebarOpen(false);',
    'setActiveView(item.id);\n                        fetchMissions();\n                        setSelectedMission(null);\n                        setSidebarOpen(false);'
)

with open('App.tsx', 'w') as f:
    f.write(content)
