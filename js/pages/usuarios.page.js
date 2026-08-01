// ==========================================
// USUARIOS PAGE - Entry point del módulo
// ==========================================
// Valida sesión + permiso ADMIN, luego inicializa el módulo.

(() => {
  const F = window.UsuariosFormatters || {};

  document.addEventListener('DOMContentLoaded', () => {
    const raw = localStorage.getItem('usuario');
    if (!raw || raw === 'undefined' || raw === 'null') {
      window.location.href = '../index.html';
      return;
    }

    let role = '';
    try {
      const u = JSON.parse(raw);
      role = u.rol || u.Rol || '';
    } catch {
      window.location.href = '../index.html';
      return;
    }

    if (typeof F.isAdminRole !== 'function' || !F.isAdminRole(role)) {
      window.location.href = 'dashboard.html';
      return;
    }

    const controller = window.UsuariosController;
    if (!controller || typeof controller.inicializar !== 'function') {
      console.error('UsuariosController no está disponible.');
      return;
    }

    controller.inicializar();
  });
})();
