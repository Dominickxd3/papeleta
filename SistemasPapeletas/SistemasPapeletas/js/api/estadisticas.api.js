// ==========================================
// API ESTAD?STICAS
// ==========================================
class EstadisticasAPI {
  static async general() {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/estadisticas/general`, {
        method: 'GET',
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers)
      });
      return handleResponse(response);
    } catch (error) {
      console.error('Error al obtener estadisticas:', error);
      return {
        usuarios: 0,
        trabajadores: 0,
        papeletas: 0,
        areas: 0,
        tiposPermiso: 0
      };
    }
  }

  static async porArea() {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/estadisticas/por-area`, {
        method: 'GET',
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers)
      });
      return handleResponse(response);
    } catch (error) {
      console.error('Error al obtener estad?sticas por área:', error);
      return [];
    }
  }

  static async porMes(year) {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/estadisticas/por-mes/${year}`, {
        method: 'GET',
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers)
      });
      return handleResponse(response);
    } catch (error) {
      console.error('Error al obtener estadisticas por mes:', error);
      return [];
    }
  }
}

console.log('EstadisticasAPI loaded');

