// ==========================================
// API USUARIOS
// ==========================================
class UsuariosAPI {
  static async listar() {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/usuarios/listar`, {
        method: 'GET',
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers)
      });
      return handleResponse(response);
    } catch (error) {
      console.error('❌ Error al obtener usuarios:', error);
      return [];
    }
  }

  static async obtenerPerfil() {
    const response = await fetch(`${API_CONFIG.baseURL}/usuarios/perfil`, {
      method: 'GET',
      headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers)
    });
    return handleResponse(response);
  }

  static async actualizarPerfil(payload) {
    const response = await fetch(`${API_CONFIG.baseURL}/usuarios/perfil`, {
      method: 'PUT',
      headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers),
      body: JSON.stringify(payload)
    });
    return handleResponse(response);
  }

  static async actualizarFoto(imageBase64) {
    const response = await fetch(`${API_CONFIG.baseURL}/usuarios/perfil/foto`, {
      method: 'POST',
      headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers),
      body: JSON.stringify({ imageBase64 })
    });
    return handleResponse(response);
  }

  static async cambiarContrasena(payload) {
    const response = await fetch(`${API_CONFIG.baseURL}/usuarios/cambiar-password`, {
      method: 'PUT',
      headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers),
      body: JSON.stringify(payload)
    });
    return handleResponse(response);
  }

  static async listarRolesERP() {
    const response = await fetch(`${API_CONFIG.baseURL}/usuarios-erp/roles`, {
      method: 'GET',
      headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers)
    });
    return handleResponse(response);
  }

  static async guardarRolERP(userLogon, payload) {
    const response = await fetch(`${API_CONFIG.baseURL}/usuarios-erp/roles/${encodeURIComponent(userLogon)}`, {
      method: 'PUT',
      headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers),
      body: JSON.stringify(payload)
    });
    return handleResponse(response);
  }

  static async buscarUsuariosERP(term) {
    const q = encodeURIComponent(String(term || '').trim());
    const response = await fetch(`${API_CONFIG.baseURL}/usuarios-erp/buscar?term=${q}`, {
      method: 'GET',
      headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers)
    });
    return handleResponse(response);
  }

  static async cargarPanelERP(segment = 'all') {
    const s = encodeURIComponent(String(segment || 'all').trim().toLowerCase());
    const response = await fetch(`${API_CONFIG.baseURL}/usuarios-erp/panel?segment=${s}`, {
      method: 'GET',
      headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers)
    });
    return handleResponse(response);
  }

  static async ejecutarAccionERP(userLogon, accion) {
    const response = await fetch(`${API_CONFIG.baseURL}/usuarios-erp/acciones/${encodeURIComponent(userLogon)}`, {
      method: 'POST',
      headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers),
      body: JSON.stringify({ accion })
    });
    return handleResponse(response);
  }

  static async obtenerHistorialERP(userLogon) {
    const response = await fetch(`${API_CONFIG.baseURL}/usuarios-erp/historial/${encodeURIComponent(userLogon)}`, {
      method: 'GET',
      headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers)
    });
    return handleResponse(response);
  }
}

window.UsuariosAPI = UsuariosAPI;
console.log('✅ UsuariosAPI loaded');
