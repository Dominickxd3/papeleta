// ==========================================
// TRABAJADORES VIEW - Solo renderizado (sin fetch, sin lógica de negocio)
// ==========================================
// Depende de: utils/trabajadores-formatters.js y
// services/trabajadores.service.js.

class TrabajadoresView {
  static MOBILE_BREAKPOINT = 820;

  static leerFiltros() {
    const txtBuscar = document.getElementById('txtBuscar');
    const filtroArea = document.getElementById('filtroArea');
    const filtroEstado = document.getElementById('filtroEstado');
    return {
      busqueda: txtBuscar ? txtBuscar.value : '',
      area: filtroArea ? filtroArea.value : '',
      estado: filtroEstado ? filtroEstado.value : ''
    };
  }

  static leerFormulario(form) {
    return {
      id: form.dataset.id || null,
      DOI: form.dni.value.trim(),
      Trabajador: `${form.nombres.value.trim()} ${form.apellidos.value.trim()}`,
      Nombres: form.nombres.value.trim(),
      Apellidos: form.apellidos.value.trim(),
      Ocupacion: form.cargo ? form.cargo.value.trim() : '',
      Area: form.area.value.trim(),
      Activo: String(form.estado?.value || '').toLowerCase() === 'activo' ? '1' : '0'
    };
  }

  static renderizarLista(pageItems) {
    const tablaBody = document.querySelector('#tabla-trabajadores tbody');
    const mobileContainer = document.getElementById('mobileTrabajadores');

    if (window.innerWidth <= this.MOBILE_BREAKPOINT) {
      if (tablaBody) tablaBody.innerHTML = '';
      this.renderizarCardsTrabajadores(mobileContainer, pageItems);
    } else {
      if (mobileContainer) mobileContainer.innerHTML = '';
      this.renderizarTablaTrabajadores(tablaBody, pageItems);
    }
  }

  static renderizarTablaTrabajadores(tbody, data) {
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!data || data.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5">
            <div class="empty-state">
              <i class="fas fa-user-slash"></i>
              <p>No se encontraron trabajadores</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();

    data.forEach((t) => {
      const tr = document.createElement('tr');
      const esActivo = TrabajadoresService.esTrabajadorActivo(t);
      const estadoTexto = esActivo ? 'Activo' : 'Inactivo';
      const estadoClass = esActivo ? 'badge-active' : 'badge-inactive';
      const nombreCompleto = (t.Trabajador || '-').trim();
      const iniciales = obtenerInicialesTrabajador(nombreCompleto);

      tr.innerHTML = `
        <td><strong>${t.DOI || '-'}</strong></td>
        <td>
          <div class="trabajador-info">
            <span class="avatar-mini">${iniciales}</span>
            <strong>${nombreCompleto}</strong>
          </div>
        </td>
        <td>${t.Ocupacion || '-'}</td>
        <td><span class="tag-area">${t.Area || t.AREA || '-'}</span></td>
        <td><span class="badge ${estadoClass}">${estadoTexto}</span></td>
      `;
      fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
  }

  static renderizarCardsTrabajadores(container, data) {
    if (!container) return;
    container.innerHTML = '';

    if (!data || data.length === 0) {
      container.innerHTML = `
        <div class="worker-card">
          <div class="empty-state">
            <i class="fas fa-user-slash"></i>
            <p>No se encontraron trabajadores</p>
          </div>
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();

    data.forEach((t) => {
      const card = document.createElement('article');
      card.className = 'worker-card';

      const esActivo = TrabajadoresService.esTrabajadorActivo(t);
      const estadoTexto = esActivo ? 'Activo' : 'Inactivo';
      const estadoClass = esActivo ? 'badge-active' : 'badge-inactive';
      const nombreCompleto = (t.Trabajador || '-').trim();
      const iniciales = obtenerInicialesTrabajador(nombreCompleto);
      const area = t.Area || t.AREA || '-';
      const cargo = t.Ocupacion || '-';

      card.innerHTML = `
        <div class="worker-card__head">
          <span class="avatar-mini">${iniciales}</span>
          <div>
            <h4 class="worker-card__name">${nombreCompleto}</h4>
            <div class="worker-card__dni">DNI: ${t.DOI || '-'}</div>
          </div>
        </div>

        <div class="worker-card__grid">
          <div class="worker-card__item">
            <span>Cargo</span>
            <strong>${cargo}</strong>
          </div>
          <div class="worker-card__item">
            <span>Área</span>
            <strong><span class="tag-area">${area}</span></strong>
          </div>
          <div class="worker-card__item">
            <span>Estado</span>
            <strong><span class="badge ${estadoClass}">${estadoTexto}</span></strong>
          </div>
        </div>
      `;

      fragment.appendChild(card);
    });

    container.appendChild(fragment);
  }

  static mostrarLoadingTabla() {
    const tbody = document.querySelector('#tabla-trabajadores tbody');
    if (!tbody) return;
    tbody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Cargando trabajadores...</p>
          </div>
        </td>
      </tr>
    `;
  }

  static mostrarErrorTabla(mensaje) {
    const tbody = document.querySelector('#tabla-trabajadores tbody');
    if (!tbody) return;
    tbody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty-state">
            <i class="fas fa-exclamation-triangle" style="color: var(--danger);"></i>
            <p>${mensaje}</p>
          </div>
        </td>
      </tr>
    `;
  }

  static actualizarResumenLista(total, start, end, totalSistema) {
    const el = document.getElementById('resumenTrabajadores');
    if (!el) return;
    if (total === 0) {
      el.textContent = `Mostrando 0 de ${totalSistema} trabajadores`;
      return;
    }
    el.textContent = `Mostrando ${start + 1}-${end} de ${total} trabajadores (total sistema: ${totalSistema})`;
  }

  static renderizarPaginacion({ totalPages, currentPage, onCambiarPagina }) {
    const btnFirst = document.getElementById('twFirst');
    const btnPrev = document.getElementById('twPrev');
    const btnNext = document.getElementById('twNext');
    const btnLast = document.getElementById('twLast');
    const pagesWrap = document.getElementById('twPages');

    if (!btnFirst || !btnPrev || !btnNext || !btnLast || !pagesWrap) return;

    btnFirst.disabled = currentPage <= 1;
    btnPrev.disabled = currentPage <= 1;
    btnNext.disabled = currentPage >= totalPages;
    btnLast.disabled = currentPage >= totalPages;

    btnFirst.onclick = () => onCambiarPagina(1);
    btnPrev.onclick = () => onCambiarPagina(Math.max(1, currentPage - 1));
    btnNext.onclick = () => onCambiarPagina(Math.min(totalPages, currentPage + 1));
    btnLast.onclick = () => onCambiarPagina(totalPages);

    pagesWrap.innerHTML = '';
    const maxButtons = 5;
    let from = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let to = Math.min(totalPages, from + maxButtons - 1);
    from = Math.max(1, to - maxButtons + 1);

    for (let p = from; p <= to; p++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = String(p);
      if (p === currentPage) b.classList.add('active');
      b.onclick = () => onCambiarPagina(p);
      pagesWrap.appendChild(b);
    }
  }

  static actualizarEstadisticas(data) {
    const total = data.length;
    const activos = data.filter((t) => TrabajadoresService.esTrabajadorActivo(t)).length;
    const areasUnicas = new Set(data.map((t) => t.Area || t.AREA).filter(Boolean)).size;

    const statTotal = document.getElementById('statTotal');
    const statActivos = document.getElementById('statActivos');
    const statAreas = document.getElementById('statAreas');

    if (statTotal) statTotal.textContent = total;
    if (statActivos) statActivos.textContent = activos;
    if (statAreas) statAreas.textContent = areasUnicas;
  }

  static llenarFiltroAreas(data) {
    const selectArea = document.getElementById('filtroArea');
    if (!selectArea) return;

    const areas = [...new Set(data.map((t) => t.Area || t.AREA))].filter(Boolean);
    selectArea.innerHTML = '<option value="">Todas las areas</option>';
    areas.forEach((area) => {
      selectArea.innerHTML += `<option value="${area}">${area}</option>`;
    });
  }

  static mostrarModalTrabajador(mostrar) {
    const modal = document.getElementById('modalTrabajador');
    if (!modal) return;
    modal.style.display = mostrar ? 'flex' : 'none';
  }

  static abrirModalEdicion(t) {
    const form = document.getElementById('form-trabajador');
    if (!form) return;

    form.dni.value = t.DOI || '';
    const partes = (t.Trabajador || '').trim().split(/\s+/);
    form.nombres.value = partes.slice(0, 2).join(' ');
    form.apellidos.value = partes.slice(2).join(' ');
    if (form.cargo) form.cargo.value = t.Ocupacion || '';
    if (form.area) form.area.value = t.Area || t.AREA || '';
    if (form.estado) form.estado.value = TrabajadoresService.esTrabajadorActivo(t) ? 'Activo' : 'Inactivo';

    form.dataset.modo = 'editar';
    form.dataset.id = t.IdTrabajador;
    document.getElementById('tituloModalTrabajador').textContent = 'Editar Trabajador';
    this.mostrarModalTrabajador(true);
  }

  static setEstadoBotonActualizar(btn, cargando) {
    if (!btn) return;
    btn.disabled = !!cargando;
    btn.setAttribute('aria-busy', cargando ? 'true' : 'false');
    btn.innerHTML = cargando
      ? '<i class="fa-solid fa-spinner fa-spin"></i> Actualizando...'
      : '<i class="fa-solid fa-rotate"></i> Actualizar';
  }

  static pintarProgresoSync(percent) {
    const valor = Math.max(0, Math.min(100, Number(percent) || 0));
    const percentEl = document.getElementById('syncTrabajadoresPercent');
    const bar = document.getElementById('syncTrabajadoresBar');
    const progress = document.querySelector('.sync-progress');

    if (percentEl) percentEl.textContent = `${Math.round(valor)}%`;
    if (bar) bar.style.width = `${valor}%`;
    if (progress) progress.setAttribute('aria-valuenow', String(Math.round(valor)));
  }

  static mostrarProgresoSyncInicio() {
    const panel = document.getElementById('syncTrabajadoresPanel');
    const title = document.getElementById('syncTrabajadoresTitle');
    const status = document.getElementById('syncTrabajadoresStatus');

    if (panel) {
      panel.hidden = false;
      panel.classList.remove('is-success', 'is-error');
    }
    if (title) title.textContent = 'Sincronizando trabajadores';
    if (status) status.textContent = 'Consultando ERP y actualizando cache local...';
  }

  static mostrarProgresoSyncCompletado(result) {
    const panel = document.getElementById('syncTrabajadoresPanel');
    const title = document.getElementById('syncTrabajadoresTitle');
    const status = document.getElementById('syncTrabajadoresStatus');
    const activos = Number(result?.activos ?? 0);
    const inactivos = Number(result?.inactivos ?? 0);
    const total = Number(result?.total ?? (activos + inactivos));
    const duracion = result?.durationMs != null ? ` en ${Math.round(result.durationMs)} ms` : '';
    const reutilizada = result?.reusedInFlightSync ? ' Se reutilizo una sincronizacion ya en curso.' : '';

    if (panel) panel.classList.add('is-success');
    if (title) title.textContent = 'Sincronizacion completada';
    if (status) {
      status.textContent = `Total ${total}, activos ${activos}, inactivos ${inactivos}${duracion}.${reutilizada}`.trim();
    }

    this.pintarProgresoSync(100);
    window.setTimeout(() => {
      const currentPanel = document.getElementById('syncTrabajadoresPanel');
      if (currentPanel?.classList.contains('is-success')) {
        currentPanel.hidden = true;
      }
    }, 2200);
  }

  static mostrarProgresoSyncError(error, percent) {
    const panel = document.getElementById('syncTrabajadoresPanel');
    const title = document.getElementById('syncTrabajadoresTitle');
    const status = document.getElementById('syncTrabajadoresStatus');

    if (panel) {
      panel.hidden = false;
      panel.classList.remove('is-success');
      panel.classList.add('is-error');
    }
    if (title) title.textContent = 'No se pudo sincronizar';
    if (status) status.textContent = error?.message || 'Ocurrio un error al actualizar desde ERP.';
    this.pintarProgresoSync(percent);
  }

  static actualizarSyncInfo({ ok, ms = null, ultimaSync = null, total = null, activos = null, inactivos = null, reusedInFlightSync = false, lastError = null } = {}) {
    const el = document.getElementById('syncTrabajadoresInfo');
    if (!el) return;

    if (!ok) {
      el.textContent = 'No se pudo actualizar desde ERP';
      return;
    }

    const hora = formatearFechaHoraLocal(ultimaSync) || formatearFechaHoraLocal(new Date());
    const tiempo = ms == null ? '' : ` (${Math.round(ms)} ms)`;
    const resumen = total == null ? '' : ` | Total ${total}, activos ${activos ?? 0}, inactivos ${inactivos ?? 0}`;
    const errorTxt = lastError ? ` | Ultimo error: ${lastError.Observaciones || lastError.Accion}` : '';
    el.textContent = `Actualizado: ${hora}${tiempo}${resumen}${errorTxt}`;
  }
}

window.TrabajadoresView = TrabajadoresView;
console.log("TrabajadoresView loaded + exposed");
