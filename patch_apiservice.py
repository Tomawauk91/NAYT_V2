with open('services/apiService.ts', 'r') as f:
    content = f.read()

# Find the last "};" and replace it
content = content[:content.rfind('};')] + """
  async updateVulnerability(vulnId: number | string, data: any) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/vulnerabilities/${vulnId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update vulnerability');
    return await response.json();
  },

  async deleteVulnerability(vulnId: number | string) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/vulnerabilities/${vulnId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      },
    });
    if (!response.ok) throw new Error('Failed to delete vulnerability');
    return await response.json();
  }
};
"""

# remove the wrongly appended stuff
content = content.split('\\n\\n  async updateVulnerability')[0]

with open('services/apiService.ts', 'w') as f:
    f.write(content)
