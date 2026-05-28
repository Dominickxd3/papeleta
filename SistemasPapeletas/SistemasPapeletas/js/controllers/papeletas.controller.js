class PermisosController {
  static registroSeleccionado = null;
  static paginaActual = 1;
  registrosPorPagina = 10;
  static totalPaginas = 1;

  // ?o. MEJORA: detecta si el usuario es ADMIN/RRHH para aprobar/rechazar
  static esPrivilegiado = false;

  static _esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  static async inicializar() {
    console.log("?Ys? Sistema Permisos Iniciado");

    const raw = localStorage.getItem('usuario');
    if (!raw || raw === 'undefined' || raw === 'null') {
      window.location.href = '../index.html';
      return;
    }

    // ?o. MEJORA: calcular rol (ADMIN/RRHH) sin romper tu l?gica
    try {
      const u = JSON.parse(raw);
      const rol = String(u?.rol || u?.Rol || u?.role || u?.ROLE || "").toUpperCase();
      this.esPrivilegiado = rol.includes("ADMIN") || rol.includes("RRHH");
    } catch (_) {
      this.esPrivilegiado = false;
    }

    try {
      const health = await HealthAPI.check();
      if (!health || health.status === "ERROR") {
        mostrarNotificacion("No se puede conectar con el servidor", "error");
        PermisosView.mostrarVacio();
        return;
      }
    } catch (e) {
      mostrarNotificacion("Servidor no disponible", "error");
      PermisosView.mostrarVacio();
      return;
    }

    // ?o. MEJORA: tu bloque "exports.*" es backend, lo dejo pero evito que truene en front
    if (typeof exports !== "undefined") {
      exports.listar = async (req, res) => {
        try {
          const data = await Papeletas.listar(req.user); // si filtras por rol
          res.json({ status: "OK", data });
        } catch (e) {
          res.status(500).json({ status: "ERROR", message: e.message });
        }
      };

      exports.anular = async (req, res) => {
        try {
          await Papeletas.anular(Number(req.params.id), req.user);
          res.json({ status: "OK" });
        } catch (e) {
          res.status(400).json({ status: "ERROR", message: e.message });
        }
      };

      exports.aprobar = async (req, res) => {
        try {
          await Papeletas.aprobar(Number(req.params.id), req.user);
          res.json({ status: "OK" });
        } catch (e) {
          res.status(400).json({ status: "ERROR", message: e.message });
        }
      };

      exports.rechazar = async (req, res) => {
        try {
          const motivo = req.body?.motivo || "";
          await Papeletas.rechazar(Number(req.params.id), motivo, req.user);
          res.json({ status: "OK" });
        } catch (e) {
          res.status(400).json({ status: "ERROR", message: e.message });
        }
      };
    }

    this.inicializarEventos();

    // Cargar ?reas en el filtro
    await UISelectorService.cargarAreas("filtroArea");
    await TrabajadoresService.cargar();

    await this.cargarPapeletas();
  }

  static inicializarEventos() {
    // B?squeda y filtros
    document.getElementById("txtBuscar")?.addEventListener("input", () => this.aplicarFiltros());
    document.getElementById("filtroArea")?.addEventListener("change", () => this.aplicarFiltros());

    // ?o. MEJORA: soportar ambos IDs (chkEliminados en tu HTML / chkEliminar en tu JS)
    document.getElementById("chkEliminar")?.addEventListener("change", () => this.aplicarFiltros());
    document.getElementById("chkEliminados")?.addEventListener("change", () => this.aplicarFiltros());

    document.getElementById("btnAprobar")?.addEventListener("click", () => this.aprobarSeleccionado());
    document.getElementById("btnRechazar")?.addEventListener("click", () => this.rechazarSeleccionado());

    // ?o. MEJORA: tabs compatibles (.filter-chip o .tab)
    const bindTabs = (selector) => {
      document.querySelectorAll(selector).forEach(chip => {
        chip.addEventListener("click", (e) => {
          document.querySelectorAll(selector).forEach(c => c.classList.remove("active"));
          e.currentTarget.classList.add("active");
          this.aplicarFiltros();
        });
      });
    };
    bindTabs(".filter-chip");
    bindTabs(".tab");

    // Botones superiores
    document.getElementById("btnActualizar")?.addEventListener("click", () => this.cargarPapeletas());
    document.getElementById("btnExportar")?.addEventListener("click", () => this.exportarExcel());
    document.getElementById("btnEditar")?.addEventListener("click", () => this.editarSeleccionado());
    document.getElementById("btnEliminar")?.addEventListener("click", () => this.eliminarSeleccionado());
    document.getElementById("btnNueva")?.addEventListener("click", () => this.abrirFormularioNuevo());

    // Botones aprobar/rechazar (solo si est?n visibles por rol)
    document.getElementById("btnAprobar")?.addEventListener("click", () => {
      if (!this.registroSeleccionado) return mostrarNotificacion("Selecciona una papeleta primero", "warning");
      this.aprobar(this.registroSeleccionado);
    });
    document.getElementById("btnRechazar")?.addEventListener("click", () => {
      if (!this.registroSeleccionado) return mostrarNotificacion("Selecciona una papeleta primero", "warning");
      this.rechazar(this.registroSeleccionado);
    });

    // Paginaci?n
    document.getElementById("btnFirst")?.addEventListener("click", () => this.irPagina(1));
    document.getElementById("btnPrev")?.addEventListener("click", () => this.irPagina("prev"));
    document.getElementById("btnNext")?.addEventListener("click", () => this.irPagina("next"));
    document.getElementById("btnLast")?.addEventListener("click", () => this.irPagina("last"));

    // ?o. MEJORA: soportar ambos IDs (selPageSize en tu HTML / registrosPorPagina en tu JS)
    const onPageSize = (e) => {
      this.registrosPorPagina = Number(e.target.value || 10);
      this.paginaActual = 1;
      this.renderizar();
    };
    document.getElementById("registrosPorPagina")?.addEventListener("change", onPageSize);
    document.getElementById("selPageSize")?.addEventListener("change", onPageSize);

    // Cerrar autocomplete al hacer clic fuera
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".autocomplete-wrapper")) {
        PermisosView.cerrarAutocompletes();
      }
    });
  }

  static async cargarPapeletas() {
    try {
      PermisosView.mostrarCargando();
      await PermisosService.cargarPapeletas();

      if (!PermisosService.datosOriginales.length) {
        PermisosView.mostrarVacio();
        return;
      }

      this.paginaActual = 1;
      this.aplicarFiltros();
      console.log(`?o. ${PermisosService.datosOriginales.length} papeletas cargadas`);
    } catch (e) {
      console.error("?O Error al cargar papeletas:", e);
      mostrarNotificacion("No se pudieron cargar las papeletas", "error");
      PermisosView.mostrarVacio();
    }
  }

  static aplicarFiltros() {
    const texto = document.getElementById("txtBuscar")?.value || "";
    const area = document.getElementById("filtroArea")?.value || "";

    // ?o. MEJORA: soportar ambos IDs
    const mostrarEliminados =
      !!document.getElementById("chkEliminar")?.checked ||
      !!document.getElementById("chkEliminados")?.checked;

    // ?o. MEJORA: detectar tab activa sea .filter-chip o .tab
    const tabActiva =
      document.querySelector(".filter-chip.active") ||
      document.querySelector(".tab.active");

    const estado = tabActiva?.dataset?.filter || "todas";

    PermisosService.aplicarFiltros({ texto, area, mostrarEliminados, estado });
    this.paginaActual = 1;
    this.renderizar();
  }

  static renderizar() {
    const datos = PermisosService.obtenerPaginados(this.paginaActual, this.registrosPorPagina);
    this.totalPaginas = PermisosService.getTotalPaginas(this.registrosPorPagina);

    PermisosView.renderizarTabla(datos, this.paginaActual, this.registrosPorPagina);
    PermisosView.actualizarPaginacion(
      this.paginaActual,
      this.totalPaginas,
      PermisosService.datosFiltrados.length,
      this.registrosPorPagina
    );
  }

  static irPagina(p) {
    if (p === "prev") this.paginaActual = Math.max(1, this.paginaActual - 1);
    else if (p === "next") this.paginaActual = Math.min(this.totalPaginas, this.paginaActual + 1);
    else if (p === "last") this.paginaActual = this.totalPaginas;
    else this.paginaActual = Math.max(1, Number(p));
    this.renderizar();
  }

  static seleccionarFila(el, id) {
    document.querySelectorAll("#tbodyPermisos tr, .mobile-card").forEach(x => x.classList.remove("selected"));
    el.classList.add("selected");
    this.registroSeleccionado = Number(id);

    // Habilitar botones
    const btnEditar = document.getElementById("btnEditar");
    const btnEliminar = document.getElementById("btnEliminar");
    const btnAprobar = document.getElementById("btnAprobar");
    const btnRechazar = document.getElementById("btnRechazar");
    if (btnEditar) btnEditar.disabled = false;
    if (btnEliminar) btnEliminar.disabled = false;

    // ?o. MEJORA: solo habilitar aprobar/rechazar si es privilegiado
    if (btnAprobar) btnAprobar.disabled = !this.esPrivilegiado;
    if (btnRechazar) btnRechazar.disabled = !this.esPrivilegiado;
  }

  // ?o. MEJORA: abrir formulario NUEVO en modal (si existe modal), si no redirige como antes
  static abrirFormularioNuevo() {
    if (document.getElementById("modalPapeleta")) {
      abrirModalPapeleta("formulario-papeleta.html", "Nueva Papeleta");
      return;
    }
    window.location.href = 'formulario-papeleta.html';
  }

  static editarSeleccionado() {
    if (!this.registroSeleccionado) {
      return mostrarNotificacion("Selecciona una papeleta primero", "warning");
    }
    this.editarPapeleta(this.registroSeleccionado);
  }

  // ?o. MEJORA: abrir EDITAR en modal (si existe modal), si no redirige como antes
  static editarPapeleta(id) {
    const url = `formulario-papeleta.html?id=${id}`;
    if (document.getElementById("modalPapeleta")) {
      abrirModalPapeleta(url, "Editar Papeleta");
      return;
    }
    window.location.href = url;
  }

  static eliminarSeleccionado() {
    if (!this.registroSeleccionado) {
      return mostrarNotificacion("Selecciona una papeleta primero", "warning");
    }
    this.eliminarPapeleta(this.registroSeleccionado);
  }

  // ?o. Anular (soft delete)
  static async eliminarPapeleta(id) {
    const r = await Swal.fire({
      title: "?Anular papeleta?",
      text: "La papeleta quedar? como eliminada (se puede restaurar).",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "S?, anular",
      cancelButtonText: "Cancelar"
    });

    if (!r.isConfirmed) return;

    try {
      await PapeletaPermisoAPI.eliminar(Number(id));
      mostrarNotificacion("Papeleta anulada correctamente", "success");
      this.registroSeleccionado = null;
      const btnEditar = document.getElementById("btnEditar");
      const btnEliminar = document.getElementById("btnEliminar");
      if (btnEditar) btnEditar.disabled = true;
      if (btnEliminar) btnEliminar.disabled = true;
      await this.cargarPapeletas();
    } catch (e) {
      console.error(e);
      mostrarNotificacion("Error al anular la papeleta", "error");
    }
  }

  static async restaurarPapeleta(id) {
    mostrarNotificacion("Restaurar: agrega endpoint en backend y lo conecto.", "info");
  }

  static verDetalle(id) {
    const p = PermisosService.buscarPorId(Number(id));
    if (!p) return mostrarNotificacion("No se encontr? la papeleta", "error");
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
    const salida = typeof formatearHoraCorta === "function" ? formatearHoraCorta(p.HSalidaPP || "--") : (p.HSalidaPP || "--");
    const retornoRaw = String(p.HRetornoPP || "").trim();
    const retorno = (!retornoRaw || retornoRaw === "00:00" || retornoRaw === "00:00:00") ? "Sin retorno" : (typeof formatearHoraCorta === "function" ? formatearHoraCorta(retornoRaw) : retornoRaw);
    const total = p.TiempoPP || "--";

    const trabajadorSafe = this._esc(p.TrabajadorPP || "");
    const dniSafe = this._esc(p.DOIPP || "");
    const areaSafe = this._esc(p.AreaPP || "");
    const cargoSafe = this._esc(p.CargoPP || "");
    const motivoSafe = this._esc(p.MotivoPP || "");
    const considerarSafe = this._esc(p.ConsiderarPP || p.Considerar || "-");
    const salidaSafe = this._esc(salida);
    const retornoSafe = this._esc(retorno);
    const totalSafe = this._esc(total);
    const fechaSafe = this._esc(fecha || "-");
    const estadoRaw = String(p.EstadoPP || p.EstadoAprobacion || "Pendiente");
    const estadoNorm = estadoRaw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const puedeImprimir = estadoNorm.includes("APROB") && estadoNorm.includes("RRHH");
    const estadoClass = estadoNorm.includes("RECHAZ")
      ? "rechazado"
      : (estadoNorm.includes("APROB") ? "aprobado" : "pendiente");
    const estadoSafe = this._esc(
      estadoNorm.includes("RECHAZ")
        ? "Rechazado"
        : (estadoNorm.includes("APROB") ? "Aprobado por RRHH" : "Pendiente")
    );

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

  static async generarPDF(id) {
    const token = localStorage.getItem("token");
    if (!token || token === "undefined" || token === "null" || token === "temp-token") {
      localStorage.removeItem("token");
      localStorage.removeItem("usuario");
      window.location.href = `${window.location.origin}/index.html`;
      return;
    }

    const target = `${API_CONFIG.baseURL}/papeletas/${Number(id)}/pdf`;

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

  static aprobar(id) {
    mostrarNotificacion("Endpoint de aprobacion pendiente en backend.", "info");
  }

  static rechazar(id) {
    mostrarNotificacion("Endpoint de rechazo pendiente en backend.", "info");
  }

  static exportarExcel() {
    if (!PermisosService.datosFiltrados.length) {
      return mostrarNotificacion("No hay datos para exportar", "warning");
    }

    const rows = PermisosService.datosFiltrados.map(x => ({
      Numero: x.NumeroPP || "",
      Fecha: formatearFechaCorta(x.FechaPermisoPP || ""),
      DNI: x.DOIPP || "",
      Trabajador: x.TrabajadorPP || "",
      Cargo: x.CargoPP || "",
      Area: x.AreaPP || "",
      Motivo: x.MotivoPP || "",
      Estado: x.EstadoPP || x.EstadoAprobacion || "",
      Salida: x.HSalidaPP || "",
      Retorno: x.HRetornoPP || "",
      Total: x.TiempoPP || ""
    }));

    const headers = Object.keys(rows[0]);
    let csv = headers.join(",") + "\n";
    rows.forEach(r => {
      csv += headers.map(h => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",") + "\n";
    });

    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `papeletas_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();

    mostrarNotificacion("Exportado correctamente", "success");
  }

  static aprobarSeleccionado() {
    if (!this.esPrivilegiado) return mostrarNotificacion("No tienes permisos", "warning");
    if (!this.registroSeleccionado) return mostrarNotificacion("Selecciona una papeleta", "warning");
    this.aprobar(this.registroSeleccionado);
  }

  static rechazarSeleccionado() {
    if (!this.esPrivilegiado) return mostrarNotificacion("No tienes permisos", "warning");
    if (!this.registroSeleccionado) return mostrarNotificacion("Selecciona una papeleta", "warning");
    this.rechazar(this.registroSeleccionado);
  }

  static async aprobar(id) {
    if (!this.esPrivilegiado) return;

    const r = await Swal.fire({
      title: "?Aprobar papeleta?",
      text: "Esta acci?n marcar? la papeleta como APROBADA.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "S?, aprobar",
      cancelButtonText: "Cancelar"
    });
    if (!r.isConfirmed) return;

    try {
      await PapeletaPermisoAPI.aprobar(Number(id));
      mostrarNotificacion("?o. Papeleta aprobada", "success");
      await this.cargarPapeletas();
    } catch (e) {
      console.error(e);
      mostrarNotificacion("?O Error al aprobar", "error");
    }
  }

  static async rechazar(id) {
    if (!this.esPrivilegiado) return;

    const r = await Swal.fire({
      title: "Rechazar papeleta",
      input: "text",
      inputLabel: "Motivo (opcional)",
      inputPlaceholder: "Ej: Falta sustento / horario inv?lido",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Rechazar",
      cancelButtonText: "Cancelar"
    });
    if (!r.isConfirmed) return;

    try {
      await PapeletaPermisoAPI.rechazar(Number(id), r.value || "");
      mostrarNotificacion("?o. Papeleta rechazada", "success");
      await this.cargarPapeletas();
    } catch (e) {
      console.error(e);
      mostrarNotificacion("?O Error al rechazar", "error");
    }
  }
}

// ===============================
// ?o. MODAL helpers
// ===============================
function abrirModalPapeleta(url, titulo = "Papeleta") {
  const modal = document.getElementById("modalPapeleta");
  const frame = document.getElementById("modalPapeletaFrame");
  const title = document.getElementById("modalPapeletaTitle");

  if (!modal || !frame || !title) {
    // fallback: si no existe modal
    window.location.href = url;
    return;
  }

  title.textContent = titulo;
  frame.src = url;

  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function cerrarModalPapeleta() {
  const modal = document.getElementById("modalPapeleta");
  const frame = document.getElementById("modalPapeletaFrame");

  if (!modal || !frame) return;

  modal.setAttribute("aria-hidden", "true");
  frame.src = "about:blank";
  document.body.style.overflow = "";
}

// Cerrar modal con click fuera o bot?n X
document.addEventListener("click", (e) => {
  const close = e.target.closest("[data-close='modal']");
  if (close) cerrarModalPapeleta();
});

// Cerrar con ESC
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const modal = document.getElementById("modalPapeleta");
    if (modal && modal.getAttribute("aria-hidden") === "false") cerrarModalPapeleta();
  }
});

// ?o. Si el iframe manda mensaje de "cerrar" o "guardado", cerramos y refrescamos tabla
window.addEventListener("message", async (event) => {
  if (!event.data) return;

  if (event.data.type === "PAPELETA_GUARDADA") {
    cerrarModalPapeleta();
    // ?o. MEJORA: refrescar usando el controlador real
    try {
      if (typeof PermisosController?.cargarPapeletas === "function") {
        await PermisosController.cargarPapeletas();
      }
    } catch (e) {
      console.warn("No se pudo refrescar tras guardar:", e);
    }
  }

  if (event.data.type === "CERRAR_MODAL_PAPELETA") {
    cerrarModalPapeleta();
  }
});

window.PermisosController = PermisosController;
console.log("?o. PermisosController loaded + exposed");




