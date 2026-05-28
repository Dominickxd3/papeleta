
class AuthAPI {
  static async login(usuario, contrasena) {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/auth/login`, {
        method: 'POST',
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers),
        body: JSON.stringify({ usuario, contrasena })
      });
      return handleResponse(response);
    } catch (error) {
      console.error('Error en login:', error);
      throw error;
    }
  }

  static async logout() {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      return { success: true };
    } catch (error) {
      console.error('Error en logout:', error);
      throw error;
    }
  }

  static async verificarToken() {
    try {
      const token = localStorage.getItem('token');
      if (!token) return false;

      const response = await fetch(`${API_CONFIG.baseURL}/auth/verify`, {
        method: 'GET',
        headers: {
          ...API_CONFIG.headers,
          'Authorization': `Bearer ${token}`
        }
      });
      return response.ok;
    } catch (error) {
      console.error('Error al verificar token:', error);
      return false;
    }
  }
}

console.log('AuthAPI cargando');

