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
      a.download = `Report_Mission_${id}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
