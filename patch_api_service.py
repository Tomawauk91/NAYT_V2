import re

with open('services/apiService.ts', 'r') as f:
    orig = f.read()

custom_func = """
  async runCustomScan(command: string) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/scan/custom`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ command }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Custom scan request failed: ${errText}`);
    }

    return await response.json(); // Returns { task_id, status }
  },
"""

if "runCustomScan(" not in orig:
    # insert before runAutoScan
    new_content = orig.replace('async runAutoScan(', custom_func + '\n  async runAutoScan(')
    with open('services/apiService.ts', 'w') as f:
        f.write(new_content)
    print("Patched apiService.ts")
else:
    print("Already patched")
