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
  async getMe(): Promise<any> {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/users/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to get user');
      return await response.json();
  },

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

  // Clients
  async getClients() {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/clients`, {
          headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch clients');
      return await response.json();
  },

  async createClient(client: any) {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/clients`, {
          method: 'POST',
          headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(client)
      });
      if (!response.ok) throw new Error('Failed to create client');
      return await response.json();
  },

  async updateClient(id: number, clientData: any) {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/clients/${id}`, {
          method: 'PUT',
          headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(clientData)
      });
      if (!response.ok) throw new Error('Failed to update client');
      return await response.json();
  },

  async deleteClient(id: number) {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/clients/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to delete client');
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

  async downloadMissionReport(id: number) {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/missions/${id}/report`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to generate report');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      let filename = `Report_Mission_${id}.docx`;
      const contentDisposition = response.headers.get('content-disposition');
      if (contentDisposition) {
          const match = contentDisposition.match(/filename="?([^"]+)"?/);
          if (match && match[1]) {
              filename = match[1];
          }
      }
      a.download = filename;

      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
  },

  async generateExecutiveSummary(id: number) {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/missions/${id}/report`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to generate AI report');
      return await response.json();
  },
  
  async updateMission(id: number | string, data: any) {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/missions/${id}`, {
          method: 'PUT',
          headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}` 
          },
          body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to update mission');
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

  
  async runCustomScan(command: string, mission_id: number = 1) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/scan/custom`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ command, mission_id }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Custom scan request failed: ${errText}`);
    }

    return await response.json(); // Returns { task_id, status }
  },

  async runAutoScan(target: string, tools: string[], port: string = "", mission_id: number = 1) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/scan/auto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ target, tools, port, mission_id }),
    });

    if (!response.ok) {
        throw new Error('Auto scan request failed');
    }

    return await response.json();
  },

  // Tools
  async runScan(tool: string, target: string, options: string = "", mission_id: number = 1) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ tool, target, options, mission_id }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Scan request failed: ${errText}`);
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
  },
  async getActiveTasks(missionId: number): Promise<any> {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/missions/${missionId}/active-tasks`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) {
      if (response.status === 401) window.location.reload();
      return null;
    }
    return response.json();
  },

  async getAllTasks(missionId: number): Promise<any> {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/missions/${missionId}/tasks`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) {
      if (response.status === 401) window.location.reload();
      return null;
    }
    return response.json();
  },

  async clearTasks(missionId: number, taskType?: string): Promise<any> {
    const token = localStorage.getItem('token');
    const typeQuery = taskType ? `?task_type=${taskType}` : '';
    const response = await fetch(`${API_BASE_URL}/missions/${missionId}/tasks${typeQuery}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) {
      if (response.status === 401) window.location.reload();
      return null;
    }
    return response.json();
  },

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
