
class CatalogosAPI {
  static async tiposPermiso() {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/tipos-permiso/listar`, {
        method: 'GET',
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers)
      });
      return handleResponse(response);
    } catch (error) {
      console.error('Error al obtener tipos de permiso:', error);
      return [];
    }
  }

  static async areas() {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/areas/listar`, {
        method: 'GET',
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers)
      });
      return handleResponse(response);
    } catch (error) {
      console.error('Error al obtener areas:', error);
      return [];
    }
  }

  static async estados() {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/estados/listar`, {
        method: 'GET',
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers)
      });
      return handleResponse(response);
    } catch (error) {
      console.error('Error al obtener estados:', error);
      return [];
    }
  }

  static async feriados() {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/feriados/listar`, {
        method: 'GET',
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers)
      });
      return handleResponse(response);
    } catch (error) {
      console.error('Error al obtener feriados:', error);
      return [];
    }
  }

  
}


