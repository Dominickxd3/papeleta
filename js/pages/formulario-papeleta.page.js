// ==========================================
// FORMULARIO PAPELETA PAGE - Entry point del módulo
// ==========================================
// 1. Detecta si se abre dentro de un iframe (modal) para aplicar estilos.
// 2. Reemplaza el onerror inline del logo del sidebar legacy.
// 3. Valida sesión (sin guard por rol, igual que el original), luego inicializa.

(() => {
  // Si el formulario está dentro de un iframe (modal), aplicamos estilos especiales.
  // Se ejecuta de forma inmediata (antes del primer paint) igual que el script inline original.
  if (window.self !== window.top) {
    document.documentElement.classList.add("is-iframe");
    document.documentElement.classList.add("in-modal");
  }

  // Ocultar logo si la imagen no carga (reemplaza el onerror inline del HTML).
  document.querySelectorAll('.profile-img').forEach((img) => {
    img.addEventListener('error', () => { img.style.display = 'none'; });
  });

  document.addEventListener('DOMContentLoaded', () => {
    const raw = localStorage.getItem('usuario');
    if (!raw || raw === 'undefined' || raw === 'null') {
      window.location.href = '../index.html';
      return;
    }

    // El original no restringía por rol: cualquier sesión válida accede al formulario.

    const controller = window.FormularioPapeletaController;
    if (!controller || typeof controller.inicializar !== 'function') {
      console.error('FormularioPapeletaController no está disponible.');
      return;
    }

    controller.inicializar();
  });
})();
