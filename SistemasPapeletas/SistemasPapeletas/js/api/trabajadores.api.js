class TrabajadoresAPI {
  static _normalizarListado(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.rows)) return data.rows;
    if (Array.isArray(data?.data?.data)) return data.data.data;
    if (Array.isArray(data?.data?.rows)) return data.data.rows;
    return null;
  }

  static async listar() {
    return this.vigentes();
  }

  static async listarTodos() {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/trabajadores/listar`, {
        method: 'GET',
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers),
        cache: 'no-store'
      });
      if (response.status === 403) return [];
      const data = await handleResponse(response);
      const arr = this._normalizarListado(data);
      if (arr) return arr;
      console.warn('⚠️ /listar devolvió formato inesperado, intentando /mostrar');
      return this.mostrar();
    } catch (error) {
      if (String(error?.message || '').toLowerCase().includes('acceso denegado')) return [];
      console.warn('⚠️ Endpoint /listar no disponible, intentando /mostrar');
      return this.mostrar();
    }
  }

  static async vigentes() {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/trabajadores/vigentes`, {
        method: 'GET',
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers),
        cache: 'no-store'
      });
      const data = await handleResponse(response);
      const arr = this._normalizarListado(data);
      if (arr) return arr;
      return [];
    } catch (error) {
      console.warn('⚠️ Endpoint /vigentes no disponible, intentando /mostrar');
      return this.mostrar();
    }
  }

  static async mostrar() {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/trabajadores/mostrar`, {
        method: 'GET',
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers),
        cache: 'no-store'
      });
      const data = await handleResponse(response);
      return this._normalizarListado(data) || [];
    } catch (error) {
      console.error('❌ Error al obtener trabajadores:', error);
      return [];
    }
  }

  static async porArea() {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/trabajadores/por-area`, {
        method: 'GET',
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers)
      });
      return handleResponse(response);
    } catch (error) {
      console.error('❌ Error al obtener trabajadores por área:', error);
      return [];
    }
  }

  static async obtenerPorId(id) {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/trabajadores/${id}`, {
        method: 'GET',
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers)
      });
      return handleResponse(response);
    } catch (error) {
      console.error('❌ Error al obtener trabajador:', error);
      throw error;
    }
  }

  static async buscarPorDNI(dni) {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/trabajadores/dni/${dni}`, {
        method: 'GET',
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers)
      });
      return handleResponse(response);
    } catch (error) {
      console.error('❌ Error al buscar por DNI:', error);
      return null;
    }
  }

  static async insertar(trabajador) {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/trabajadores/insertar`, {
        method: 'POST',
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers),
        body: JSON.stringify(trabajador)
      });
      return handleResponse(response);
    } catch (error) {
      console.error('❌ Error al insertar trabajador:', error);
      throw error;
    }
  }

  static async crear(trabajador) {
    return this.insertar(trabajador);
  }

  static async editar(id, trabajador) {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/trabajadores/editar/${id}`, {
        method: 'PUT',
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers),
        body: JSON.stringify(trabajador)
      });
      return handleResponse(response);
    } catch (error) {
      console.error('❌ Error al editar trabajador:', error);
      throw error;
    }
  }

  static async eliminar(id) {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/trabajadores/eliminar/${id}`, {
        method: 'DELETE',
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers)
      });
      return handleResponse(response);
    } catch (error) {
      console.error('❌ Error al eliminar trabajador:', error);
      throw error;
    }
  }

  static async sincronizarCache() {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/trabajadores/sync`, {
        method: 'POST',
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers)
      });
      return handleResponse(response);
    } catch (error) {
      console.error('❌ Error al sincronizar cache de trabajadores:', error);
      throw error;
    }
  }
}

window.TrabajadoresAPI = TrabajadoresAPI;
console.log('TRABAJADORES CARGADO EXITOSO...');
