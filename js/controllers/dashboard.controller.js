
(function () {
  function boot() {
    if (window.DashboardController && typeof window.DashboardController.init === "function") {
      return;
    }

    window.DashboardController = {
      init() {
        // Si la vista expone init, la invocamos.
        if (window.DashboardView && typeof window.DashboardView.init === "function") {
          window.DashboardView.init();
        }
      }
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
