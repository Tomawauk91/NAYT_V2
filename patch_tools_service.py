import re

with open("services/apiService.ts", "r", encoding="utf-8") as f:
    orig = f.read()

content = orig.replace("""    if (!response.ok) {
        throw new Error('Scan request failed');
    }""", """    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Scan request failed: ${errText}`);
    }""")

with open("services/apiService.ts", "w", encoding="utf-8") as f:
    f.write(content)
