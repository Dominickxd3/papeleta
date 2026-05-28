class PapeletaPermisoAPI {
  static async listar(options = {}) {
    try {
      const q = new URLSearchParams();
      if (Number.isInteger(options.page)) q.set("page", String(options.page));
      if (Number.isInteger(options.pageSize)) q.set("pageSize", String(options.pageSize));
      if (String(options.area || "").trim()) q.set("area", String(options.area).trim());
      if (String(options.texto || "").trim()) q.set("texto", String(options.texto).trim());
      if (String(options.estado || "").trim()) q.set("estado", String(options.estado).trim());
      if (typeof options.mostrarAnulados === "boolean") q.set("mostrarAnulados", options.mostrarAnulados ? "true" : "false");

      const url = `${API_CONFIG.baseURL}/papeletas/listar${q.toString() ? `?${q.toString()}` : ""}`;
      const response = await fetch(url, {
        method: "GET",
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers),
        cache: "no-store",
      });
      return handleResponse(response);
    } catch (error) {
      console.warn("⚠️ Endpoint /listar no disponible, intentando /mostrar");
      return this.mostrar();
    }
  }

  static async mostrar() {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/papeletas/mostrar`, {
        method: "GET",
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers),
        cache: "no-store",
      });
      return handleResponse(response);
    } catch (error) {
      console.error("❌ Error al obtener papeletas:", error);
      return [];
    }
  }

  static async insertar(permiso) {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/papeletas/insertar`, {
        method: "POST",
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers),
        body: JSON.stringify({
          FechaRegistroPP: permiso.fechaRegistro || new Date().toISOString(),
          PcRegistroPP: permiso.pcRegistro || obtenerNombrePC(),
          FechaModificacionPP: new Date().toISOString(),
          PcModificacionPP: obtenerNombrePC(),
          FechaEmisionPP: permiso.fechaEmision || new Date().toISOString(),
          FechaPermisoPP: permiso.fechaPermiso,
          NumeroPP: permiso.numero,
          DOIPP: permiso.doi,
          TrabajadorPP: permiso.trabajador,
          CargoPP: permiso.cargo,
          AreaPP: permiso.area,
          MotivoPP: permiso.motivo || "",
          ConsiderarPP: permiso.considerar || "",
          FechaVacDesdePP: permiso.vacacionesDesde || null,
          FechaVacHastaPP: permiso.vacacionesHasta || null,
          HSalidaPP: permiso.horaSalida,
          HRetornoPP: permiso.horaRetorno,
          TiempoPP: permiso.tiempo,
          ObservacionesPP: permiso.observaciones || "",
          ActivoPP: "1",
        }),
      });
      return handleResponse(response);
    } catch (error) {
      console.error("❌ Error al insertar papeleta:", error);
      throw error;
    }
  }

  static async editar(permiso) {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/papeletas/editar`, {
        method: "PUT",
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers),
        body: JSON.stringify({
          IdPP: permiso.id,
          FechaModificacionPP: new Date().toISOString(),
          PcModificacionPP: obtenerNombrePC(),
          FechaPermisoPP: permiso.fechaPermiso,
          NumeroPP: permiso.numero,
          DOIPP: permiso.doi,
          TrabajadorPP: permiso.trabajador,
          CargoPP: permiso.cargo,
          AreaPP: permiso.area,
          MotivoPP: permiso.motivo || "",
          ConsiderarPP: permiso.considerar || "",
          FechaVacDesdePP: permiso.vacacionesDesde || null,
          FechaVacHastaPP: permiso.vacacionesHasta || null,
          HSalidaPP: permiso.horaSalida,
          HRetornoPP: permiso.horaRetorno,
          TiempoPP: permiso.tiempo,
          ObservacionesPP: permiso.observaciones || "",
          ActivoPP: "1",
        }),
      });
      return handleResponse(response);
    } catch (error) {
      console.error("❌ Error al editar papeleta:", error);
      throw error;
    }
  }

  static async eliminar(id) {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/papeletas/eliminar`, {
        method: "DELETE",
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers),
        body: JSON.stringify({ IdPP: id }),
      });
      return handleResponse(response);
    } catch (error) {
      console.error("❌ Error al eliminar papeleta:", error);
      throw error;
    }
  }

  static async restaurar(id) {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/papeletas/restaurar`, {
        method: "PATCH",
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers),
        body: JSON.stringify({ IdPP: id }),
      });
      return handleResponse(response);
    } catch (error) {
      console.error("❌ Error al restaurar papeleta:", error);
      throw error;
    }
  }

  static async obtenerReporte(id) {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/papeletas/reporte/${id}`, {
        method: "GET",
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers),
      });
      return handleResponse(response);
    } catch (error) {
      console.error("❌ Error al obtener reporte:", error);
      throw error;
    }
  }

  static async historial(id) {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/papeletas/${Number(id)}/historial`, {
        method: "GET",
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers),
        cache: "no-store",
      });
      return handleResponse(response);
    } catch (error) {
      console.error("❌ Error al obtener historial de papeleta:", error);
      return { success: false, data: [] };
    }
  }

  static async porEstado() {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/papeletas/por-estado`, {
        method: "GET",
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers),
      });
      return handleResponse(response);
    } catch (error) {
      console.error("❌ Error al obtener papeletas por estado:", error);
      return [];
    }
  }

  static async obtenerUltimoNumero() {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/papeletas/ultimo-numero`, {
        method: "GET",
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers),
      });
      return handleResponse(response);
    } catch (error) {
      console.error("❌ Error al obtener último número:", error);
      return { ultimoNumero: 0 };
    }
  }

  static async aprobar(id, observacionesAdmin = "") {
    return this._gestionarRRHH(id, "APROBADO_RRHH", observacionesAdmin);
  }

  static async rechazar(id, observacionesAdmin = "") {
    return this._gestionarRRHH(id, "RECHAZADO", observacionesAdmin);
  }

  static async _gestionarRRHH(IdPP, nuevoEstado, observacionesAdmin = "") {
    const response = await fetch(`${API_CONFIG.baseURL}/papeletas/gestionar`, {
      method: "POST",
      headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers),
      body: JSON.stringify({
        IdPP: Number(IdPP),
        nuevoEstado,
        observacionesAdmin: observacionesAdmin || ""
      })
    });

    return handleResponse(response);
  }

  static async exportarExcelMesAnio(mes, anio, filtros = {}) {
    const mm = Number(mes);
    const yy = Number(anio);
    if (!Number.isInteger(mm) || mm < 1 || mm > 12) {
      throw new Error("Mes inválido");
    }
    if (!Number.isInteger(yy) || yy < 2000 || yy > 2100) {
      throw new Error("Año inválido");
    }

    const q = new URLSearchParams();
    q.set("mes", String(mm));
    q.set("anio", String(yy));

    if (filtros && typeof filtros === "object") {
      if (String(filtros.area || "").trim()) q.set("area", String(filtros.area).trim());
      if (String(filtros.texto || "").trim()) q.set("texto", String(filtros.texto).trim());
      if (String(filtros.estado || "").trim()) q.set("estado", String(filtros.estado).trim());
      if (typeof filtros.mostrarAnulados === "boolean") q.set("mostrarAnulados", filtros.mostrarAnulados ? "true" : "false");
    }

    const url = `${API_CONFIG.baseURL}/papeletas/exportar-excel?${q.toString()}`;
    const response = await fetch(url, {
      method: "GET",
      headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers),
    });

    if (!response.ok) {
      let msg = `Error al exportar (${response.status})`;
      try {
        const data = await response.json();
        msg = data?.message || msg;
      } catch {}
      throw new Error(msg);
    }

    const blob = await response.blob();
    const dispo = response.headers.get("content-disposition") || "";
    const match = dispo.match(/filename="?([^"]+)"?/i);
    const filename = match?.[1] || `reporte_papeletas_${yy}_${String(mm).padStart(2, "0")}.xlsx`;

    return { blob, filename };
  }
}

window.PapeletaPermisoAPI = PapeletaPermisoAPI;
window.PapeletasAPI = PapeletaPermisoAPI;
console.log("✅ PapeletaPermisoAPI loaded + exposed");

