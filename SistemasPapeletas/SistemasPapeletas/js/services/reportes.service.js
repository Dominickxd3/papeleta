const ReportesService = {
  async cargarDashboard(filtros = {}) {
    if (!window.ReportesAPI || typeof window.ReportesAPI.estadisticasDashboard !== "function") {
      throw new Error("ReportesAPI no disponible");
    }
    return window.ReportesAPI.estadisticasDashboard(filtros);
  },

  async general(filtros = {}) {
    if (!window.ReportesAPI || typeof window.ReportesAPI.reporteGeneral !== "function") {
      throw new Error("ReportesAPI no disponible");
    }
    return window.ReportesAPI.reporteGeneral(filtros);
  },

  async porArea(area, filtros = {}) {
    if (!window.ReportesAPI || typeof window.ReportesAPI.reportePorArea !== "function") {
      throw new Error("ReportesAPI no disponible");
    }
    return window.ReportesAPI.reportePorArea(area, filtros);
  },

  async exportarPDF(tipoReporte, filtros = {}) {
    if (!window.ReportesAPI || typeof window.ReportesAPI.exportarPDF !== "function") {
      throw new Error("ReportesAPI no disponible");
    }
    return window.ReportesAPI.exportarPDF(tipoReporte, filtros);
  },

  async exportarExcel(tipoReporte, filtros = {}) {
    if (!window.ReportesAPI || typeof window.ReportesAPI.exportarExcel !== "function") {
      throw new Error("ReportesAPI no disponible");
    }
    return window.ReportesAPI.exportarExcel(tipoReporte, filtros);
  }
};

window.ReportesService = ReportesService;
