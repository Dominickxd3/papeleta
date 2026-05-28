class PermisosController {
  static registroSeleccionado = null;
  static paginaActual = 1;
  static registrosPorPagina = 10;
  static totalPaginas = 1;

  static usuario = null;
  static esPrivilegiado = false; // ADMIN/RRHH
  static autoRefreshTimer = null;
  static autoRefreshMs = 60000;
  static _initialized = false;
  static _eventsBound = false;
  static _searchDebounceTimer = null;





   static aprobarSeleccionado() {
  if (!this.registroSeleccionado) {
    return mostrarNotificacion("Selecciona una papeleta", "warning");
  }
  return this.aprobar(this.registroSeleccionado);
}

static rechazarSeleccionado() {
  if (!this.registroSeleccionado) {
    return mostrarNotificacion("Selecciona una papeleta", "warning");
  }
  return this.rechazar(this.registroSeleccionado);
}

static async aprobar(id) {
  try {
    const r = await Swal.fire({
      title: "¿Aprobar papeleta?",
      text: "La papeleta pasar? a estado APROBADA.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Sí, aprobar",
      cancelButtonText: "Cancelar"
    });
    if (!r.isConfirmed) return;

    await PapeletaPermisoAPI.aprobar(Number(id), { observacion: "Aprobado desde sistema" });

    mostrarNotificacion("Papeleta aprobada", "success");
    await this.cargarPapeletas();
  } catch (e) {
    console.error("Error al aprobar:", e);

    if (e.code === "ENDPOINT_NOT_FOUND") {
      Swal.fire({
        icon: "error",
        title: "Falta endpoint en backend",
        html: `
          <div style="text-align:left">
            <p>No existe ruta para <b>aprobar</b> en tu backend.</p>
            <p style="margin-top:8px;font-size:.9rem;opacity:.8">${e.message}</p>
          </div>
        `
      });
      return;
    }

    mostrarNotificacion("Error al aprobar la papeleta", "error");
  }
}

static async rechazar(id) {
  try {
    const r = await Swal.fire({
      title: "¿Rechazar papeleta?",
      input: "text",
      inputLabel: "Motivo (opcional)",
      inputPlaceholder: "Escribe el motivo del rechazo???",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, rechazar",
      cancelButtonText: "Cancelar"
    });
    if (!r.isConfirmed) return;

    await PapeletaPermisoAPI.rechazar(Number(id), { motivo: r.value || "" });

    mostrarNotificacion("Papeleta rechazada", "success");
    await this.cargarPapeletas();
  } catch (e) {
    console.error("Error al rechazar:", e);

    if (e.code === "ENDPOINT_NOT_FOUND") {
      Swal.fire({
        icon: "error",
        title: "Falta endpoint en backend",
        html: `
          <div style="text-align:left">
            <p>No existe ruta para <b>rechazar</b> en tu backend.</p>
            <p style="margin-top:8px;font-size:.9rem;opacity:.8">${e.message}</p>
          </div>
        `
      });
      return;
    }

    mostrarNotificacion("Error al rechazar la papeleta", "error");
  }
}

  // =========================
  // INIT
  // =========================
  static async inicializar() {
    if (this._initialized) return;
    this._initialized = true;

    // usuario
    const raw = localStorage.getItem("usuario");
    if (!raw || raw === "undefined" || raw === "null") {
      window.location.href = "../index.html";
      return;
    }

    try {
      this.usuario = JSON.parse(raw);
    } catch {
      window.location.href = "../index.html";
      return;
    }

    const rol = String(this.usuario?.rol || this.usuario?.Rol || this.usuario?.role || "").toLowerCase();
    this.esPrivilegiado = rol.includes("admin") || rol.includes("rrhh");

    // salud backend
    try {
      const health = await HealthAPI.check();
      if (!health || health.status === "ERROR") {
        mostrarNotificacion("?s?? No se puede conectar con el servidor", "error");
        PermisosView.mostrarVacio();
        return;
      }
    } catch (e) {
      mostrarNotificacion("?s?? Servidor no disponible", "error");
      PermisosView.mostrarVacio();
      return;
    }

    // pasar usuario al service (para filtrar por rol)
    if (typeof PermisosService.setUsuario === "function") {
      PermisosService.setUsuario(this.usuario);
    }

    this.inicializarEventos();

    await UISelectorService.cargarAreas("filtroArea");
    await TrabajadoresService.cargar();
    await this.cargarPapeletas();

    // ocultar botones aprobar/rechazar si NO es ADMIN/RRHH
    const btnAprobar = document.getElementById("btnAprobar");
    const btnRechazar = document.getElementById("btnRechazar");
    if (!this.esPrivilegiado) {
      if (btnAprobar) btnAprobar.style.display = "none";
      if (btnRechazar) btnRechazar.style.display = "none";
    }

    // auto refresh 30s
    this.iniciarAutoRefresh();

    // limpiar interval al salir
    window.addEventListener("beforeunload", () => {
      if (PermisosController.autoRefreshTimer) clearInterval(PermisosController.autoRefreshTimer);
    }, { once: true });
  }

  // =========================
  // EVENTS
  // =========================
  static inicializarEventos() {
    if (this._eventsBound) return;
    this._eventsBound = true;

    // Buscar
    document.getElementById("txtBuscar")?.addEventListener("input", () => {
      if (this._searchDebounceTimer) clearTimeout(this._searchDebounceTimer);
      this._searchDebounceTimer = setTimeout(() => this.aplicarFiltros(), 180);
    });

    // Filtros
    document.getElementById("filtroArea")?.addEventListener("change", () => this.aplicarFiltros());
    document.getElementById("chkEliminados")?.addEventListener("change", () => this.aplicarFiltros());

    // Tabs
    const tabs = [
      { id: "tabTodas", estado: "todas" },
      { id: "tabPendientes", estado: "pendientes" },
      { id: "tabAprobadas", estado: "aprobadas" },
      { id: "tabRechazadas", estado: "rechazadas" },
    ];

    tabs.forEach(t => {
      const btn = document.getElementById(t.id);
      if (!btn) return;

      btn.dataset.filter = t.estado;
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tabs-permisos .tab").forEach(x => x.classList.remove("active"));
        btn.classList.add("active");
        this.aplicarFiltros();
      });
    });

    // Botones principales
    document.getElementById("btnNueva")?.addEventListener("click", () => this.abrirFormularioNuevo());
    document.getElementById("btnActualizar")?.addEventListener("click", () => this.cargarPapeletas());
    document.getElementById("btnExportar")?.addEventListener("click", () => this.exportarExcel());
    document.getElementById("btnEditar")?.addEventListener("click", () => this.editarSeleccionado());
    document.getElementById("btnEliminar")?.addEventListener("click", () => this.eliminarSeleccionado());

    // Aprobar / Rechazar
    document.getElementById("btnAprobar")?.addEventListener("click", () => this.aprobarSeleccionado());
    document.getElementById("btnRechazar")?.addEventListener("click", () => this.rechazarSeleccionado());

    // Paginaci?n (botones)
    document.getElementById("btnFirst")?.addEventListener("click", () => this.irPagina(1));
    document.getElementById("btnPrev")?.addEventListener("click", () => this.irPagina("prev"));
    document.getElementById("btnNext")?.addEventListener("click", () => this.irPagina("next"));
    document.getElementById("btnLast")?.addEventListener("click", () => this.irPagina("last"));

    document.getElementById("selPageSize")?.addEventListener("change", (e) => {
      this.registrosPorPagina = parseInt(e.target.value, 10) || 10;
      this.paginaActual = 1;
      this.renderizar();
    });

    // Delegaci?n de eventos para tabla + acciones
    const tbody = document.getElementById("tbodyPermisos");
    tbody?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      const tr = e.target.closest("tr[data-id]");

      // click en bot?n acci?n
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        const id = Number(btn.dataset.id);
        const action = btn.dataset.action;

        if (action === "ver") return this.verDetalle(id);
        if (action === "editar") return this.editarPapeleta(id);
        if (action === "pdf") return this.generarPDF(id);
        if (action === "aprobar") return this.aprobar(id);
        if (action === "rechazar") return this.rechazar(id);
        if (action === "eliminar") return this.eliminarPapeleta(id);
        if (action === "restaurar") return this.restaurarPapeleta(id);
        return;
      }

      // click en fila
      if (tr) {
        const id = Number(tr.dataset.id);
        this.seleccionarFila(tr, id);
      }
    });

    // Delegaci?n m?vil (cards + botones)
    const mobile = document.getElementById("mobileCards");
    mobile?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      const card = e.target.closest(".perm-card[data-id]");

      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        const id = Number(btn.dataset.id);
        const action = btn.dataset.action;

        if (action === "ver") return this.verDetalle(id);
        if (action === "editar") return this.editarPapeleta(id);
        if (action === "pdf") return this.generarPDF(id);
        if (action === "aprobar") return this.aprobar(id);
        if (action === "rechazar") return this.rechazar(id);
        if (action === "eliminar") return this.eliminarPapeleta(id);
        if (action === "restaurar") return this.restaurarPapeleta(id);
        return;
      }

      if (card) {
        const id = Number(card.dataset.id);
        this.seleccionarCard(card, id);
      }
    });

    // click en n?meros de p?gina
    document.getElementById("pags")?.addEventListener("click", (e) => {
      const b = e.target.closest("button.pg");
      if (!b) return;
      this.irPagina(Number(b.dataset.pg));
    });

    window.addEventListener("message", async (event) => {
      const data = event?.data;
      if (!data || typeof data !== "object") return;

      if (data.type === "PAPELETA_GUARDADA") {
        this.cerrarModalPapeleta();
        await this.cargarPapeletas();
        return;
      }

      if (data.type === "CERRAR_MODAL_PAPELETA") {
        this.cerrarModalPapeleta();
      }
    });
  }

  static abrirModalPapeleta(url, titulo = "Papeleta") {
    const modal = document.getElementById("modalPapeleta");
    const iframe = document.getElementById("modalPapeletaFrame");
    const titleEl = document.getElementById("modalPapeletaTitle");

    if (!modal || !iframe) {
      console.warn("No existe modalPapeleta/modalPapeletaFrame en permisos.html");
      window.location.href = url;
      return;
    }

    if (titleEl) titleEl.textContent = titulo;

    iframe.src = url;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    modal.querySelectorAll('[data-close="modal"]').forEach((el) => {
      el.onclick = () => this.cerrarModalPapeleta();
    });
  }

  static cerrarModalPapeleta() {
    const modal = document.getElementById("modalPapeleta");
    const iframe = document.getElementById("modalPapeletaFrame");

    if (iframe) iframe.src = "about:blank";
    if (modal) modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  // =========================
  // AUTO REFRESH (polling)
  // =========================
  static iniciarAutoRefresh() {
    if (this.autoRefreshTimer) clearInterval(this.autoRefreshTimer);

    if (!this.esPrivilegiado) return;

    this.autoRefreshTimer = setInterval(async () => {
      if (document.hidden) return;
      try {
        await this.aplicarFiltros(false);
      } catch (e) {
        console.warn("Auto-refresh fallo:", e);
      }
    }, this.autoRefreshMs);
  }

  // =========================
  // DATA
  // =========================
  static async cargarPapeletas(resetPagina = true) {
    try {
      PermisosView.mostrarCargando();
      if (resetPagina) this.paginaActual = 1;
      await this.aplicarFiltros(false);

      this.registroSeleccionado = null;
      this._deshabilitarBotonesSeleccion();
    } catch (e) {
      console.error("Error al cargar papeletas:", e);
      mostrarNotificacion("No se pudieron cargar las papeletas", "error");
      PermisosView.mostrarVacio();
    }
  }

  /**
   * aplicarFiltros(resetPagina = true)
   */
  static async aplicarFiltros(resetPagina = true) {
    const txtBuscar = document.getElementById("txtBuscar")?.value || "";
    const area = document.getElementById("filtroArea")?.value || "";
    const mostrarEliminados = document.getElementById("chkEliminados")?.checked || false;

    const tabActivo = document.querySelector(".tabs-permisos .tab.active");
    const estado = tabActivo?.dataset?.filter || "todas";

    if (resetPagina) this.paginaActual = 1;
    await PermisosService.cargarPapeletas({
      page: this.paginaActual,
      pageSize: this.registrosPorPagina,
      texto: txtBuscar,
      area,
      mostrarEliminados,
      estado
    });

    this.renderizar();
  }

  static renderizar() {
    const datos = PermisosService.obtenerPaginados();
    this.totalPaginas = PermisosService.getTotalPaginas();
    const totalRegistros = Number(PermisosService.totalRegistros || 0);

    if (!datos.length) {
      PermisosView.mostrarVacio();
      PermisosView.actualizarPaginacion(
        this.paginaActual,
        this.totalPaginas,
        totalRegistros,
        this.registrosPorPagina
      );
      return;
    }

    PermisosView.renderizarTabla(datos, this.paginaActual, this.registrosPorPagina, totalRegistros);
    PermisosView.actualizarPaginacion(
      this.paginaActual,
      this.totalPaginas,
      totalRegistros,
      this.registrosPorPagina
    );
  }

  // =========================
  // PAGINATION
  // =========================
  static async irPagina(p) {
    if (p === "prev") this.paginaActual = Math.max(1, this.paginaActual - 1);
    else if (p === "next") this.paginaActual = Math.min(this.totalPaginas, this.paginaActual + 1);
    else if (p === "last") this.paginaActual = this.totalPaginas;
    else this.paginaActual = Math.max(1, Number(p) || 1);

    await this.aplicarFiltros(false);
  }

  // =========================
  // SELECTION + BUTTONS
  // =========================
  static _habilitarBotonesSeleccion() {
    document.getElementById("btnEditar")?.removeAttribute("disabled");
    document.getElementById("btnEliminar")?.removeAttribute("disabled");

    if (this.esPrivilegiado) {
      document.getElementById("btnAprobar")?.removeAttribute("disabled");
      document.getElementById("btnRechazar")?.removeAttribute("disabled");
    }
  }

  static _deshabilitarBotonesSeleccion() {
    document.getElementById("btnEditar")?.setAttribute("disabled", "disabled");
    document.getElementById("btnEliminar")?.setAttribute("disabled", "disabled");
    document.getElementById("btnAprobar")?.setAttribute("disabled", "disabled");
    document.getElementById("btnRechazar")?.setAttribute("disabled", "disabled");
  }

  static seleccionarFila(tr, id) {
    document.querySelectorAll("#tbodyPermisos tr").forEach(x => x.classList.remove("selected"));
    tr.classList.add("selected");
    this.registroSeleccionado = Number(id);
    this._habilitarBotonesSeleccion();
  }

  static seleccionarCard(card, id) {
    document.querySelectorAll("#mobileCards .perm-card").forEach(x => x.classList.remove("selected"));
    card.classList.add("selected");
    this.registroSeleccionado = Number(id);
    this._habilitarBotonesSeleccion();
  }

  // =========================
  // NAV
  // =========================
static abrirFormularioNuevo() {
  this.abrirModalPapeleta(`formulario-papeleta.html?_t=${Date.now()}`, "Nueva Papeleta");
}

  static editarSeleccionado() {
    if (!this.registroSeleccionado) return mostrarNotificacion("Selecciona una papeleta", "warning");
    this.editarPapeleta(this.registroSeleccionado);
  }

 static editarPapeleta(id) {
  const url = `formulario-papeleta.html?id=${Number(id)}&_t=${Date.now()}`;
  this.abrirModalPapeleta(url, "Editar Papeleta");
}
  // =========================
  // DELETE (ANULAR)
  // =========================
  static eliminarSeleccionado() {
    if (!this.registroSeleccionado) return mostrarNotificacion("Selecciona una papeleta", "warning");
    this.eliminarPapeleta(this.registroSeleccionado);
  }

  static async eliminarPapeleta(id) {
    const r = await Swal.fire({
      title: "?Anular papeleta?",
      text: "La papeleta quedar? como ANULADA.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, anular",
      cancelButtonText: "Cancelar"
    });
    if (!r.isConfirmed) return;

    try {
      await PapeletaPermisoAPI.eliminar(Number(id));
      mostrarNotificacion("Papeleta anulada correctamente", "success");

      this.registroSeleccionado = null;
      this._deshabilitarBotonesSeleccion();

      await this.cargarPapeletas();
    } catch (e) {
      console.error(e);
      mostrarNotificacion("Error al anular la papeleta", "error");
    }
  }

  static async restaurarPapeleta(id) {
    if (!this.esPrivilegiado) return mostrarNotificacion("No tienes permisos para restaurar papeletas", "error");

    const r = await Swal.fire({
      title: "Restaurar papeleta?",
      text: "La papeleta volvera a estar activa y pendiente de revision.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Si, restaurar",
      cancelButtonText: "Cancelar"
    });
    if (!r.isConfirmed) return;

    try {
      await PapeletaPermisoAPI.restaurar(Number(id));
      mostrarNotificacion("Papeleta restaurada correctamente", "success");

      this.registroSeleccionado = null;
      this._deshabilitarBotonesSeleccion();

      await this.cargarPapeletas();
    } catch (e) {
      console.error(e);
      mostrarNotificacion("Error al restaurar la papeleta", "error");
    }
  }

  // =========================
  // APPROVE / REJECT
  // =========================
  static async aprobarSeleccionado() {
    if (!this.registroSeleccionado) return mostrarNotificacion("Selecciona una papeleta", "warning");
    return this.aprobar(this.registroSeleccionado);
  }

  static async rechazarSeleccionado() {
    if (!this.registroSeleccionado) return mostrarNotificacion("Selecciona una papeleta", "warning");
    return this.rechazar(this.registroSeleccionado);
  }

  static async aprobar(id) {
    if (!this.esPrivilegiado) return mostrarNotificacion("No tienes permisos para aprobar", "error");

    const r = await Swal.fire({
      title: "¿Aprobar papeleta?",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Sí, aprobar",
      cancelButtonText: "Cancelar"
    });
    if (!r.isConfirmed) return;

    try {
      if (typeof PapeletaPermisoAPI.aprobar === "function") {
        await PapeletaPermisoAPI.aprobar(Number(id));
        mostrarNotificacion("Papeleta aprobada", "success");
        this.registroSeleccionado = null;
        this._deshabilitarBotonesSeleccion();
        await this.cargarPapeletas();
      } else {
        mostrarNotificacion("Falta implementar endpoint: PapeletaPermisoAPI.aprobar(id)", "warning");
      }
    } catch (e) {
      console.error(e);
      mostrarNotificacion("No se pudo aprobar (revisa endpoint)", "error");
    }
  }

  static async rechazar(id) {
    if (!this.esPrivilegiado) return mostrarNotificacion("No tienes permisos para rechazar", "error");

    const r = await Swal.fire({
      title: "¿Rechazar papeleta?",
      input: "text",
      inputLabel: "Motivo (opcional)",
      inputPlaceholder: "Escribe el motivo...",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, rechazar",
      cancelButtonText: "Cancelar"
    });
    if (!r.isConfirmed) return;

    try {
      if (typeof PapeletaPermisoAPI.rechazar === "function") {
        await PapeletaPermisoAPI.rechazar(Number(id), r.value || "");
        mostrarNotificacion("Papeleta rechazada", "success");
        this.registroSeleccionado = null;
        this._deshabilitarBotonesSeleccion();
        await this.cargarPapeletas();
      } else {
        mostrarNotificacion("Falta implementar endpoint: PapeletaPermisoAPI.rechazar(id, motivo)", "warning");
      }
    } catch (e) {
      console.error(e);
      mostrarNotificacion("No se pudo rechazar (revisa endpoint)", "error");
    }
  }

  // =========================
  // DETAIL
  // =========================
  static _formatearDuracion(totalRaw) {
    const totalStr = String(totalRaw || "").trim();
    if (!totalStr) return "-";

    // Caso ISO: 1970-01-01T02:00:00.000Z
    const iso = totalStr.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (iso) {
      const h = Number(iso[1] || 0);
      const m = Number(iso[2] || 0);
      if (m === 0) return `${h} ${h === 1 ? "hora" : "horas"}`;
      return `${h} ${h === 1 ? "hora" : "horas"} ${m} min`;
    }

    // Caso HH:mm[:ss]
    const hhmm = totalStr.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
    if (hhmm) {
      const h = Number(hhmm[1] || 0);
      const m = Number(hhmm[2] || 0);
      if (m === 0) return `${h} ${h === 1 ? "hora" : "horas"}`;
      return `${h} ${h === 1 ? "hora" : "horas"} ${m} min`;
    }

    return totalStr;
  }

  static _esSinRetorno(retornoRaw) {
    const s = String(retornoRaw || "").trim();
    if (!s) return true;
    return s === "00:00" || s === "00:00:00" || /T00:00(?::00)?/.test(s);
  }

  static _esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  static async verDetalle(id) {
    const p = PermisosService.buscarPorId(Number(id));
    if (!p) return mostrarNotificacion("No se encontr? la papeleta", "error");
    let historial = [];
    if (typeof PapeletaPermisoAPI?.historial === "function") {
      const historyResult = await PapeletaPermisoAPI.historial(Number(id));
      historial = Array.isArray(historyResult?.data) ? historyResult.data : (Array.isArray(historyResult) ? historyResult : []);
    }

    const fecha = typeof formatearFechaCorta === "function" ? formatearFechaCorta(p.FechaPermisoPP) : (p.FechaPermisoPP || "");
    const fechaLarga = (() => {
      const raw = String(p.FechaPermisoPP || "").trim();
      const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
      let d = null;
      if (m) d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
      else {
        const tmp = new Date(raw);
        if (!Number.isNaN(tmp.getTime())) d = tmp;
      }
      if (!d) return this._esc(fecha || "-");
      const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
      return `${d.getDate()} de ${meses[d.getMonth()]}, ${d.getFullYear()}`;
    })();
    const salida = (p.HSalidaPP || "").toString();
    const retorno = (p.HRetornoPP || "").toString();
    const totalFmt = this._formatearDuracion(p.TiempoPP);
    const retornoFmt = this._esSinRetorno(retorno)
      ? "Sin retorno"
      : (typeof formatearHoraCorta === "function" ? formatearHoraCorta(retorno) : retorno);
    const trabajadorSafe = this._esc(p.TrabajadorPP || "-");
    const dniSafe = this._esc(p.DOIPP || "-");
    const areaSafe = this._esc(p.AreaPP || "-");
    const cargoSafe = this._esc(p.CargoPP || "-");
    const fechaSafe = this._esc(fecha || "-");
    const motivoSafe = this._esc(p.MotivoPP || "-");
    const considerarSafe = this._esc(p.ConsiderarPP || p.Considerar || "-");
    const salidaSafe = this._esc(typeof formatearHoraCorta === "function" ? formatearHoraCorta(salida) : salida);
    const retornoSafe = this._esc(retornoFmt);
    const totalSafe = this._esc(totalFmt);
    const estadoRaw = String(p.EstadoPP || p.EstadoAprobacion || "Pendiente");
    const estadoNorm = estadoRaw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const puedeImprimir = this._isEstadoAprobadoRRHH(estadoRaw);
    const estadoClass = estadoNorm.includes("RECHAZ")
      ? "rechazado"
      : (estadoNorm.includes("APROB") ? "aprobado" : "pendiente");
    const estadoSafe = this._esc(
      estadoNorm.includes("RECHAZ")
        ? "Rechazado"
        : (estadoNorm.includes("APROB") ? "Aprobado por RRHH" : "Pendiente")
    );
    const historialHtml = historial.length
      ? historial.slice(0, 8).map((h) => {
          const fechaHist = h.FechaHora ? new Date(h.FechaHora) : null;
          const fechaTxt = fechaHist && !Number.isNaN(fechaHist.getTime())
            ? fechaHist.toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })
            : "-";
          return `
            <div class="pp-preview-history-row">
              <strong>${this._esc(h.Accion || "-")}</strong>
              <span>${this._esc(h.NombreUsuario || h.Usuario || "-")} | ${this._esc(fechaTxt)}</span>
              <small>${this._esc(h.Observaciones || h.IP || "")}</small>
            </div>
          `;
        }).join("")
      : `<div class="pp-preview-history-row"><span>Sin historial registrado.</span></div>`;

    Swal.fire({
      width: 760,
      showCancelButton: true,
      showConfirmButton: true,
      reverseButtons: true,
      cancelButtonText: "Volver",
      confirmButtonText: "Imprimir detalle",
      customClass: {
        popup: "pp-preview-modal",
        cancelButton: "pp-preview-btn pp-preview-btn-secondary",
        confirmButton: "pp-preview-btn pp-preview-btn-primary"
      },
      html: `
        <section class="pp-preview-card">
          <header class="pp-preview-head">
            <div>
              <p class="pp-preview-kicker">Registro administrativo</p>
              <h3 class="pp-preview-title">Papeleta de Salida #${this._esc(p.NumeroPP || id)}</h3>
            </div>
            <span class="pp-preview-state ${estadoClass}">${estadoSafe}</span>
          </header>

          <div class="pp-preview-worker">
            <span>Trabajador</span>
            <strong><em>DO</em>${trabajadorSafe}</strong>
          </div>

          <div class="pp-preview-grid two">
            <div><span>DNI</span><strong>${dniSafe}</strong></div>
            <div><span>Fecha</span><strong class="is-fecha">${this._esc(fechaLarga)}</strong></div>
          </div>

          <div class="pp-preview-divider"></div>

          <div class="pp-preview-grid two">
            <div><span>Area</span><strong>${areaSafe}</strong></div>
            <div><span>Condicion</span><strong>${considerarSafe}</strong></div>
          </div>

          <div class="pp-preview-motivo">
            <span>Motivo</span>
            <p>"${motivoSafe}"</p>
          </div>

          <div class="pp-preview-time">
            <div><span>Salida</span><strong>${salidaSafe}</strong></div>
            <div><span>Retorno</span><strong>${retornoSafe}</strong></div>
            <div><span>T. Total</span><strong>${totalSafe}</strong></div>
          </div>

          <div class="pp-preview-divider"></div>

          <div class="pp-preview-history">
            <span>Historial</span>
            ${historialHtml}
          </div>
        </section>
      `,
      didOpen: () => {
        if (!puedeImprimir) {
          const btn = Swal.getConfirmButton();
          if (btn) {
            btn.disabled = true;
            btn.textContent = "Impresion solo aprobadas";
          }
        }
      }
    }).then((r) => {
      if (r.isConfirmed && puedeImprimir) this.generarPDF(id);
    });
  }

  static _isEstadoAprobadoRRHH(estadoRaw) {
    const estado = String(estadoRaw || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, " ")
      .trim()
      .toUpperCase();

    return estado.includes("APROBADO") && estado.includes("RRHH");
  }

  static async generarPDF(id) {
    const p = PermisosService.buscarPorId(Number(id));
    const estado = p?.EstadoAprobacion || p?.EstadoPP || "";
    if (!this._isEstadoAprobadoRRHH(estado)) {
      mostrarNotificacion("Solo se puede imprimir una papeleta aprobada por RRHH", "warning");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token || token === "undefined" || token === "null" || token === "temp-token") {
      localStorage.removeItem("token");
      localStorage.removeItem("usuario");
      window.location.href = `${window.location.origin}/index.html`;
      return;
    }

    let paper = localStorage.getItem("pdfPaperSize") || "A4";
    if (!["A4", "A5"].includes(String(paper).toUpperCase())) {
      paper = "A4";
    }
    if (typeof Swal !== "undefined" && Swal?.fire) {
      const ask = await Swal.fire({
        title: "Tamano de impresion",
        input: "select",
        inputOptions: {
          A4: "A4 (210 x 297 mm)",
          A5: "A5 (148 x 210 mm)"
        },
        inputValue: paper,
        showCancelButton: true,
        confirmButtonText: "Abrir PDF",
        cancelButtonText: "Cancelar"
      });
      if (!ask.isConfirmed) return;
      paper = String(ask.value || "A4").toUpperCase();
      localStorage.setItem("pdfPaperSize", paper);
    }

    const target = `${API_CONFIG.baseURL}/papeletas/${Number(id)}/pdf?paper=${encodeURIComponent(paper)}&_=${Date.now()}`;

    let overlay = document.getElementById("pdf-preview-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "pdf-preview-overlay";
      overlay.innerHTML = `
        <div id="pdf-preview-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9998"></div>
        <div style="position:fixed;inset:2.5vh 2.5vw;background:#fff;border-radius:10px;overflow:hidden;z-index:9999;display:flex;flex-direction:column;box-shadow:0 18px 45px rgba(0,0,0,.35)">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #e5e7eb;background:#f8fafc">
            <strong>Vista Previa PDF</strong>
            <button id="pdf-preview-close" type="button" style="border:0;background:#111827;color:#fff;padding:8px 10px;border-radius:6px;cursor:pointer">Cerrar</button>
          </div>
          <iframe id="pdf-preview-frame" style="flex:1;border:0;width:100%" title="Vista previa PDF"></iframe>
        </div>
      `;
      document.body.appendChild(overlay);

      const close = () => {
        const frame = document.getElementById("pdf-preview-frame");
        if (frame) {
          const oldUrl = frame.dataset.objectUrl;
          if (oldUrl) URL.revokeObjectURL(oldUrl);
          delete frame.dataset.objectUrl;
          frame.src = "about:blank";
        }
        overlay.remove();
      };

      overlay.querySelector("#pdf-preview-close")?.addEventListener("click", close);
      overlay.querySelector("#pdf-preview-backdrop")?.addEventListener("click", close);
      window.addEventListener("keydown", function onEsc(e) {
        if (e.key === "Escape") {
          close();
          window.removeEventListener("keydown", onEsc);
        }
      });
    }

    const frame = document.getElementById("pdf-preview-frame");
    if (!frame) return;

    try {
      frame.src = "about:blank";
      const response = await fetch(target, {
        method: "GET",
        headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : API_CONFIG.headers)
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.message || `Error ${response.status} al generar PDF`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const oldUrl = frame.dataset.objectUrl;
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      frame.dataset.objectUrl = objectUrl;
      frame.src = objectUrl;
    } catch (error) {
      mostrarNotificacion(error?.message || "No se pudo cargar la vista previa del PDF", "error");
    }
  }

  // =========================
  // EXPORT
  // =========================
  static async exportarExcel() {
    try {
      const now = new Date();
      const mesActual = now.getMonth() + 1;
      const anioActual = now.getFullYear();

      const { value: filtro, isConfirmed } = await Swal.fire({
        title: "Exportar reporte",
        html: `
          <div style="display:grid;gap:10px;text-align:left">
            <label>Mes
              <select id="swal-mes" class="swal2-input" style="margin:6px 0 0 0">
                ${[
                  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
                ].map((m, i) => `<option value="${i + 1}" ${i + 1 === mesActual ? "selected" : ""}>${m}</option>`).join("")}
              </select>
            </label>
            <label>Año
              <input id="swal-anio" class="swal2-input" type="number" min="2000" max="2100" value="${anioActual}" style="margin:6px 0 0 0" />
            </label>
          </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: "Exportar",
        cancelButtonText: "Cancelar",
        preConfirm: () => {
          const mes = Number(document.getElementById("swal-mes")?.value || 0);
          const anio = Number(document.getElementById("swal-anio")?.value || 0);
          if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
            Swal.showValidationMessage("Mes inválido");
            return false;
          }
          if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
            Swal.showValidationMessage("Año inválido");
            return false;
          }
          return { mes, anio };
        }
      });

      if (!isConfirmed || !filtro) return;

      const tabActivo = document.querySelector(".tabs-permisos .tab.active");
      const filtrosActuales = {
        texto: String(document.getElementById("txtBuscar")?.value || "").trim(),
        area: String(document.getElementById("filtroArea")?.value || "").trim(),
        estado: String(tabActivo?.dataset?.filter || "todas").trim(),
        mostrarAnulados: !!document.getElementById("chkEliminados")?.checked
      };

      const { blob, filename } = await PapeletaPermisoAPI.exportarExcelMesAnio(
        filtro.mes,
        filtro.anio,
        filtrosActuales
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      mostrarNotificacion("Reporte exportado correctamente", "success");
    } catch (error) {
      console.error("âŒ Error al exportar reporte:", error);
      mostrarNotificacion(error?.message || "No se pudo exportar el reporte", "error");
    }
  }
}

window.PermisosController = PermisosController;
console.log("PermisosController loaded + exposed");
