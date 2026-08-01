(() => {
  function normalizeRole(role) {
    return String(role || "")
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  function canAccessTrabajadores(role) {
    const r = normalizeRole(role);
    const allowed = new Set([
      'ADMIN',
      'ADMINISTRADOR',
      'ADMINISTRADOR DEL SISTEMA',
      'RRHH',
      'RR HH',
      'RECURSOS HUMANOS'
    ]);
    return allowed.has(r);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const raw = localStorage.getItem('usuario');
    if (!raw || raw === 'undefined' || raw === 'null') {
      window.location.href = '../index.html';
      return;
    }

    try {
      const u = JSON.parse(raw);
      const role = u.rol || u.Rol || '';
      if (!canAccessTrabajadores(role)) {
        window.location.href = 'dashboard.html';
        return;
      }
    } catch {
      window.location.href = 'dashboard.html';
      return;
    }

    const controller = window.TrabajadoresController;
    if (!controller || typeof controller.inicializar !== 'function') {
      console.error("TrabajadoresController no está disponible.");
      return;
    }

    controller.inicializar();
  });
})();
