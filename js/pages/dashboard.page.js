(() => {
  function isValidSession() {
    const token = localStorage.getItem("token");
    const usuarioRaw = localStorage.getItem("usuario");
    return !!(
      token &&
      token !== "temp-token" &&
      token !== "undefined" &&
      token !== "null" &&
      usuarioRaw &&
      usuarioRaw !== "undefined" &&
      usuarioRaw !== "null"
    );
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      if (!isValidSession()) {
        localStorage.removeItem("token");
        localStorage.removeItem("usuario");
        window.location.href = `${window.location.origin}/index.html`;
        return;
      }

      const controller = window.DashboardController;
      if (!controller || typeof controller.inicializar !== "function") {
        console.error("DashboardController no está disponible.");
        return;
      }

      await controller.inicializar();
    } catch (err) {
      console.error("Error al iniciar módulo de dashboard:", err);
    }
  });
})();
