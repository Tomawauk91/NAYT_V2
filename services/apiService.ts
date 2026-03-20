const API_BASE_URL = '/api'; // Uses Nginx proxy

export interface ScanResult {
    task_id: string;
    status: string;
    result?: {
        status: string;
        command: string;
        output: string;
    };
}

export const toolsService = {
  // Auth
  async login(username: string, password: string): Promise<{access_token: string}> {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);
      
      const response = await fetch(`${API_BASE_URL}/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData
      });
      
      if (!response.ok) throw new Error('Login failed');
      return await response.json();
  },
  
  // Missions
  async getMissions() {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/missions`, {
          headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch missions');
      return await response.json();
  },

  async createMission(mission: any) {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/missions`, {
          method: 'POST',
          headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(mission)
      });
      
      if (!response.ok) {
          const text = await response.text();
          console.error('Create Mission Failed:', text);
          try {
             const errorData = JSON.parse(text);
             throw new Error(errorData.detail || 'Failed to create mission');
          } catch (e) {
             throw new Error(`Failed to create mission: ${response.status} ${response.statusText}`);
          }
      }
      return await response.json();
  },
  
  async deleteMission(id: number) {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/missions/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to delete mission');
      return await response.json();
  },
  
  // Users
  async getUsers() {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/users`, {
          headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch users');
      return await response.json();
  },

  async createUser(user: any) {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/users`, {
          method: 'POST',
          headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(user)
      });
      if (!response.ok) throw new Error('Failed to create user');
      return await response.json();
  },

  async deleteUser(id: number) {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/users/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to delete user');
      return await response.json();
  },
  
  async resetPassword(id: number, password: string) {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/users/${id}/reset-password`, {
          method: 'PUT',
          headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ password })
      });
      if (!response.ok) throw new Error('Failed to reset password');
      return await response.json();
  },

  // Config
  async saveConfig(key: string, value: string) {
       const token = localStorage.getItem('token');
       const response = await fetch(`${API_BASE_URL}/admin/config`, {
           method: 'POST',
           headers: { 
               'Content-Type': 'application/json', 
               'Authorization': `Bearer ${token}` 
           },
           body: JSON.stringify({ key, value })
       });
       if (!response.ok) throw new Error('Failed to save config');
       return await response.json();
  },

  async getConfig(key: string) {
       const token = localStorage.getItem('token');
       const response = await fetch(`${API_BASE_URL}/admin/config/${key}`, {
           headers: { 'Authorization': `Bearer ${token}` }
       });
       if (!response.ok) return { value: "" };
       return await response.json();
  },
  
  async generateReport(missionId: number) {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/missions/${missionId}/report`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to generate report');
      return await response.json();
  },

  async runAutoScan(target: string, tools: string[], port: string = "") {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/scan/auto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ target, tools, port }),
    });

    if (!response.ok) {
        throw new Error('Auto scan request failed');
    }

    return await response.json();
  },

  // Tools
  async runScan(tool: string, target: string, options: string = "") {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ tool, target, options }),
    });

    if (!response.ok) {
        throw new Error('Scan request failed');
    }

    return await response.json(); // Returns { task_id, status }
  },

  async stopScan(taskId: string) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/scan/${taskId}/stop`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    if (!response.ok) {
        throw new Error('Failed to stop scan');
    }
    return await response.json();
  },

  async getScanStatus(taskId: string): Promise<ScanResult> {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/scan/${taskId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) {
        throw new Error('Failed to check scan status');
    }
    return await response.json();
  }
};

