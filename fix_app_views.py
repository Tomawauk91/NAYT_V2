import re

with open('App.tsx', 'r') as f:
    content = f.read()

# Pass fetchMissions to functional views
content = content.replace(
    '<ReconView missions={missions} lang={lang} />',
    '<ReconView missions={missions} lang={lang} refresh={fetchMissions} />'
)
content = content.replace(
    '<VulnerabilitiesView missions={missions} lang={lang} />',
    '<VulnerabilitiesView missions={missions} lang={lang} refresh={fetchMissions} />'
)
content = content.replace(
    '<ReportsView missions={missions} lang={lang} />',
    '<ReportsView missions={missions} lang={lang} refresh={fetchMissions} />'
)

with open('App.tsx', 'w') as f:
    f.write(content)
