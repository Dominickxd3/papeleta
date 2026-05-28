class HealthAPI {
  static async check() {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/health`, {
        method: 'GET',
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers)
      });
      return handleResponse(response);
    } catch (error) {
      console.error('Error en health check:', error);
      return { status: 'ERROR', connected: false };
    }
  }

  static async checkDatabase() {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/health/database`, {
        method: 'GET',
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers)
      });
      return handleResponse(response);
    } catch (error) {
      console.error('Error en database check:', error);
      return { status: 'ERROR', connected: false };
    }
  }
}

window.HealthAPI = HealthAPI;

console.log('HealthAPI loaded + exposed:', window.HealthAPI);

