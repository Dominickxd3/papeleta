class PermisosView {
  static tbodyId = "tbodyPermisos";
  static mobileId = "mobileCards";

  static _tbody() {
    return document.getElementById(this.tbodyId);
  }

  static _mobile() {
    return document.getElementById(this.mobileId);
  }

  static _horaHHMM(valor) {
    const v = String(valor || "");
    const m = v.match(/T(\d{2}:\d{2})/);
    if (m) return m[1];
    const m2 = v.match(/^(\d{2}:\d{2})/);
    return m2 ? m2[1] : v;
  }

  static _esSinRetorno(valor) {
    const s = this._horaHHMM(valor);
    return s === "00:00" || s === "00:00:00";
  }

  static _textoRetorno(valor) {
    const h = this._horaHHMM(valor);
    return this._esSinRetorno(h) ? "Sin retorno" : h;
  }

  static _textoTotal(totalValor, retornoValor) {
    if (this._esSinRetorno(retornoValor)) return "-";
    return this._horaHHMM(totalValor || "00:00");
  }

  static _esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  static mostrarCargando() {
    const tbody = this._tbody();
    if (!tbody) return;

    tbody.innerHTML = `
      <tr>
        <td colspan="11" style="text-align:center; padding: 28px;">
          <i class="fa-solid fa-circle-notch fa-spin"></i>
          <div style="margin-top:8px;">Cargando papeletas...</div>
        </td>
      </tr>
    `;

    const mobile = this._mobile();
    if (mobile) {
      mobile.innerHTML = `
        <div class="perm-empty">
          <i class="fa-solid fa-circle-notch fa-spin"></i>
          <div>Cargando papeletas...</div>
        </div>
      `;
    }
  }

  static mostrarVacio() {
    const tbody = this._tbody();
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="11" style="text-align:center; padding: 28px; color:#6b7280;">
            <i class="fa-solid fa-inbox" style="font-size: 28px; opacity:.7;"></i>
            <div style="margin-top:8px;">No se encontraron registros</div>
          </td>
        </tr>
      `;
    }

    const mobile = this._mobile();
    if (mobile) {
      mobile.innerHTML = `
        <div class="perm-empty">
          <i class="fa-solid fa-inbox"></i>
          <div>No se encontraron registros</div>
        </div>
      `;
    }
  }

  static renderizarTabla(datos, pagina, porPagina, totalRegistros = 0) {
    const tbody = this._tbody();
    const mobile = this._mobile();

    if (!datos || datos.length === 0) {
      this.mostrarVacio();
      return;
    }

    if (tbody) {
      const page = Math.max(1, Number(pagina) || 1);
      const size = Math.max(1, Number(porPagina) || 10);
      const base = (page - 1) * size;
      const total = Math.max(0, Number(totalRegistros) || 0);
      tbody.innerHTML = datos.map((p, idx) => this._fila(p, Math.max(1, total - (base + idx)))).join("");
    }
    if (mobile) mobile.innerHTML = datos.map((p) => this._card(p)).join("");
  }

  static _fila(p, correlativoVisual) {
    const id = Number(p.IdPP);
    const activo = String(p.ActivoPP ?? "1");
    const anulado = activo === "2";

    const trabajador = p.TrabajadorPP || p.Trabajador || "N/A";
    const dni = p.DOIPP || p.DOI || "N/A";
    const cargo = p.CargoPP || p.Cargo || p.Ocupacion || "N/A";
    const area = p.AreaPP || p.Area || "N/A";
    const motivo = p.MotivoPP || p.Motivo || "-";

    const fecha = p.FechaPermisoPP || p.FechaPermiso || "";
    const salida = this._horaHHMM(p.HSalidaPP || p.HoraSalida || "");
    const retornoRaw = p.HRetornoPP || p.HoraRetorno || "";
    const retorno = this._textoRetorno(retornoRaw);
    const total = this._textoTotal(p.TiempoPP || p.Tiempo || "00:00", retornoRaw);
    const estado = anulado ? "Rechazada" : (p.EstadoPP || p.EstadoAprobacion || "Pendiente");
    const trabajadorSafe = this._esc(trabajador);
    const dniSafe = this._esc(dni);
    const cargoSafe = this._esc(cargo);
    const areaSafe = this._esc(area);
    const motivoSafe = this._esc(motivo);
    const fechaSafe = this._esc(typeof formatearFechaCorta === "function" ? formatearFechaCorta(fecha) : (fecha || "-"));
    const salidaSafe = this._esc(typeof formatearHoraCorta === "function" ? formatearHoraCorta(salida) : salida);
    const retornoSafe = this._esc(retorno === "Sin retorno" ? "Sin retorno" : (typeof formatearHoraCorta === "function" ? formatearHoraCorta(retorno) : retorno));
    const totalSafe = this._esc(total);

    return `
      <tr class="perm-row" data-id="${id}">
        <td>${correlativoVisual || "-"}</td>
        <td>${fechaSafe}</td>

        <td class="perm-worker">
          <div class="perm-worker__name">${trabajadorSafe}</div>
          <div class="perm-worker__dni">DNI: ${dniSafe}</div>
        </td>

        <td>${cargoSafe}</td>
        <td>${areaSafe}</td>
        <td class="perm-motivo" title="${motivoSafe}">${motivoSafe}</td>

        <td class="text-center">${salidaSafe}</td>
        <td class="text-center">${retornoSafe}</td>
        <td class="text-center"><strong>${totalSafe}</strong></td>

        <td class="text-center">${this.obtenerBadgeEstado(estado, anulado)}</td>

        <td class="text-center">
          ${this._acciones(id, anulado, estado)}
        </td>
      </tr>
    `;
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

  static _isEstadoCerrado(estadoRaw, anulado = false) {
    const estado = String(estadoRaw || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, " ")
      .trim()
      .toUpperCase();

    return anulado || estado.includes("APROBADO") || estado.includes("RECHAZ");
  }

  static _acciones(id, anulado, estado) {
    const canPdf = this._isEstadoAprobadoRRHH(estado);
    const esPrivilegiado = !!window.PermisosController?.esPrivilegiado;
    const canEdit = esPrivilegiado || !this._isEstadoCerrado(estado, anulado);
    return `
      <div class="perm-actions">
        <button class="action-btn" title="Ver" data-action="ver" data-id="${id}">
          <i class="fa-solid fa-eye"></i>
        </button>

        <button class="action-btn ${canEdit ? "" : "is-disabled"}" title="${canEdit ? "Editar" : "Solo ADMIN/RRHH puede editar papeletas cerradas"}" data-action="editar" data-id="${id}" ${canEdit ? "" : "disabled"}>
          <i class="fa-solid fa-pen"></i>
        </button>

        <button class="action-btn ${canPdf ? "" : "is-disabled"}" title="${canPdf ? "PDF" : "Disponible solo con aprobación RRHH"}" data-action="pdf" data-id="${id}" ${canPdf ? "" : "disabled"}>
          <i class="fa-solid fa-file-pdf"></i>
        </button>

        ${
          anulado && esPrivilegiado
            ? `<button class="action-btn" title="Restaurar" data-action="restaurar" data-id="${id}"><i class="fa-solid fa-rotate-left"></i></button>`
            : anulado
              ? ""
            : `<button class="action-btn danger" title="Anular" data-action="eliminar" data-id="${id}"><i class="fa-solid fa-trash"></i></button>`
        }
      </div>
    `;
  }

  static _accionesCard(id, anulado, estado) {
    const canPdf = this._isEstadoAprobadoRRHH(estado);
    const esPrivilegiado = !!window.PermisosController?.esPrivilegiado;
    const canEdit = esPrivilegiado || !this._isEstadoCerrado(estado, anulado);
    return `
      <div class="perm-actions">
        <button class="action-btn" title="Ver" data-action="ver" data-id="${id}">
          <i class="fa-solid fa-eye"></i>
        </button>

        <button class="action-btn ${canEdit ? "" : "is-disabled"}" title="${canEdit ? "Editar" : "Solo ADMIN/RRHH puede editar papeletas cerradas"}" data-action="editar" data-id="${id}" ${canEdit ? "" : "disabled"}>
          <i class="fa-solid fa-pen"></i>
        </button>

        <button class="action-btn ${canPdf ? "" : "is-disabled"}" title="${canPdf ? "PDF" : "Disponible solo con aprobación RRHH"}" data-action="pdf" data-id="${id}" ${canPdf ? "" : "disabled"}>
          <i class="fa-solid fa-file-pdf"></i>
        </button>

        ${
          esPrivilegiado
            ? `<button class="action-btn" title="Aprobar" data-action="aprobar" data-id="${id}">
                 <i class="fa-solid fa-check"></i>
               </button>
               <button class="action-btn danger" title="Rechazar" data-action="rechazar" data-id="${id}">
                 <i class="fa-solid fa-xmark"></i>
               </button>`
            : ""
        }

        ${
          anulado && esPrivilegiado
            ? `<button class="action-btn" title="Restaurar" data-action="restaurar" data-id="${id}"><i class="fa-solid fa-rotate-left"></i></button>`
            : anulado
              ? ""
            : `<button class="action-btn danger" title="Anular" data-action="eliminar" data-id="${id}"><i class="fa-solid fa-trash"></i></button>`
        }
      </div>
    `;
  }

  static _card(p) {
    const id = Number(p.IdPP);
    const activo = String(p.ActivoPP ?? "1");
    const anulado = activo === "2";

    const trabajador = p.TrabajadorPP || p.Trabajador || "N/A";
    const dni = p.DOIPP || p.DOI || "N/A";
    const cargo = p.CargoPP || p.Cargo || p.Ocupacion || "N/A";
    const area = p.AreaPP || p.Area || "N/A";
    const motivo = p.MotivoPP || p.Motivo || "-";

    const fecha = p.FechaPermisoPP || p.FechaPermiso || "";
    const salida = this._horaHHMM(p.HSalidaPP || p.HoraSalida || "");
    const retornoRaw = p.HRetornoPP || p.HoraRetorno || "";
    const retorno = this._textoRetorno(retornoRaw);
    const total = this._textoTotal(p.TiempoPP || p.Tiempo || "00:00", retornoRaw);
    const estado = anulado ? "Rechazada" : (p.EstadoPP || p.EstadoAprobacion || "Pendiente");
    const trabajadorSafe = this._esc(trabajador);
    const dniSafe = this._esc(dni);
    const cargoSafe = this._esc(cargo);
    const areaSafe = this._esc(area);
    const motivoSafe = this._esc(motivo);
    const fechaSafe = this._esc(typeof formatearFechaCorta === "function" ? formatearFechaCorta(fecha) : (fecha || "-"));
    const salidaSafe = this._esc(typeof formatearHoraCorta === "function" ? formatearHoraCorta(salida) : salida);
    const retornoSafe = this._esc(retorno === "Sin retorno" ? "Sin retorno" : (typeof formatearHoraCorta === "function" ? formatearHoraCorta(retorno) : retorno));
    const totalSafe = this._esc(total);

    return `
      <div class="perm-card" data-id="${id}">
        <div class="perm-card__top">
          <div class="perm-card__title">
            <div class="name">${trabajadorSafe}</div>
            <div class="meta">${cargoSafe} • ${areaSafe} • DNI: ${dniSafe}</div>
          </div>
          <div>${this.obtenerBadgeEstado(estado, anulado)}</div>
        </div>

        <div class="perm-card__grid">
          <div><span>Fecha</span><strong>${fechaSafe}</strong></div>
          <div><span>Salida</span><strong>${salidaSafe}</strong></div>
          <div><span>Retorno</span><strong>${retornoSafe}</strong></div>
          <div><span>Total</span><strong>${totalSafe}</strong></div>
        </div>

        <div class="perm-card__motivo"><span>Motivo</span><div>${motivoSafe}</div></div>

        <div class="perm-card__actions">
          ${this._accionesCard(id, anulado, estado)}
        </div>
      </div>
    `;
  }

  static obtenerBadgeEstado(estado, anulado = false) {
    if (anulado) return `<span class="perm-badge bad" title="Anulada internamente"><i class="fa-solid fa-xmark"></i> Rechazada</span>`;

    const e = String(estado || "").toLowerCase();

    if (e.includes("anulad")) return `<span class="perm-badge bad" title="Anulada internamente"><i class="fa-solid fa-xmark"></i> Rechazada</span>`;
    if (e.includes("pendiente")) return `<span class="perm-badge pending"><i class="fa-solid fa-clock"></i> Pendiente</span>`;
    if (e.includes("aprob") && e.includes("rrhh")) return `<span class="perm-badge ok"><i class="fa-solid fa-check-double"></i> Aprob. RRHH</span>`;
    if (e.includes("aprob")) return `<span class="perm-badge ok"><i class="fa-solid fa-check"></i> Aprobada</span>`;
    if (e.includes("rechaz")) return `<span class="perm-badge bad"><i class="fa-solid fa-xmark"></i> Rechazada</span>`;

    return `<span class="perm-badge info"><i class="fa-solid fa-circle-info"></i> ${this._esc(estado || "Sin estado")}</span>`;
  }

  static actualizarPaginacion(paginaActual, totalPaginas, totalRegistros, porPagina) {
    const lbl = document.getElementById("lblInfo");
    if (lbl) {
      const ini = totalRegistros === 0 ? 0 : (paginaActual - 1) * porPagina + 1;
      const fin = Math.min(paginaActual * porPagina, totalRegistros);
      lbl.textContent = `Mostrando ${ini}-${fin} de ${totalRegistros} registros`;
    }

    const pags = document.getElementById("pags");
    if (!pags) return;

    const max = 5;
    let start = Math.max(1, paginaActual - Math.floor(max / 2));
    let end = Math.min(totalPaginas, start + max - 1);
    if (end - start < max - 1) start = Math.max(1, end - max + 1);

    let html = "";
    for (let i = start; i <= end; i++) {
      html += `<button class="pg ${i === paginaActual ? "active" : ""}" data-pg="${i}">${i}</button>`;
    }
    pags.innerHTML = html;
  }
}

window.PermisosView = PermisosView;
console.log("✅ PermisosView loaded + exposed");
