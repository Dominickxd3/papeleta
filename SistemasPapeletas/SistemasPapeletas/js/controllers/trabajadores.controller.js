let trabajadores = [];
let trabajadoresFiltrados = [];
let actualizandoTrabajadores = false;
const MOBILE_BREAKPOINT = 820;
let resizeTimer = null;
let currentPage = 1;
let pageSize = 25;
let syncProgressTimer = null;
let syncProgressValue = 0;

document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ trabajadores.controller.js cargado');
  const form = document.getElementById('form-trabajador');
  const tablaBody = document.querySelector('#tabla-trabajadores tbody');
  const mobileContainer = document.getElementById('mobileTrabajadores');

  inicializarEventosUI(form, tablaBody, mobileContainer);
  cargarTrabajadores(tablaBody, mobileContainer);
});

async function cargarTrabajadores(tablaBody, mobileContainer) {
  const t0 = performance.now();
  mostrarLoadingTabla(tablaBody);

  try {
    const data = await TrabajadoresAPI.listarTodos();

    trabajadores = Array.isArray(data) ? data : [];
    trabajadoresFiltrados = trabajadores;

    actualizarEstadisticas(trabajadores);
    llenarFiltroAreas(trabajadores);
    aplicarFiltros(tablaBody, mobileContainer, true);
    actualizarSyncInfo({
      ok: true,
      ms: performance.now() - t0,
      ultimaSync: obtenerUltimaSyncLocal(trabajadores),
      total: trabajadores.length,
      activos: trabajadores.filter((t) => esTrabajadorActivo(t)).length,
      inactivos: trabajadores.filter((t) => !esTrabajadorActivo(t)).length
    });

    console.log(`✅ ${trabajadores.length} trabajadores cargados`);
  } catch (error) {
    console.error('❌ Error al cargar trabajadores:', error);
    mostrarErrorTabla(tablaBody, 'Error al cargar trabajadores: ' + (error?.message || 'Error desconocido'));
    actualizarSyncInfo({ ok: false });
  }
}

function inicializarEventosUI(form, tablaBody, mobileContainer) {
  const txtBuscar = document.getElementById('txtBuscar');
  const filtroArea = document.getElementById('filtroArea');
  const filtroEstado = document.getElementById('filtroEstado');
  const btnActualizar = document.getElementById('btnActualizarTrabajadores');
  const selPageSize = document.getElementById('twPageSize');

  if (txtBuscar) txtBuscar.addEventListener('input', () => aplicarFiltros(tablaBody, mobileContainer, true));
  if (filtroArea) filtroArea.addEventListener('change', () => aplicarFiltros(tablaBody, mobileContainer, true));
  if (filtroEstado) filtroEstado.addEventListener('change', () => aplicarFiltros(tablaBody, mobileContainer, true));

  
  if (selPageSize) {
    selPageSize.addEventListener('change', () => {
      pageSize = Math.max(1, Number(selPageSize.value) || 25);
      currentPage = 1;
      aplicarFiltros(tablaBody, mobileContainer, true);
    });
  }
  document.querySelectorAll('.estado-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const value = btn.dataset.value || '';
      if (filtroEstado) filtroEstado.value = value;
      document.querySelectorAll('.estado-chip').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      aplicarFiltros(tablaBody, mobileContainer, true);
    });
  });

  if (btnActualizar) {
    btnActualizar.addEventListener('click', async () => {
      if (actualizandoTrabajadores) return;
      actualizandoTrabajadores = true;
      setEstadoBotonActualizar(btnActualizar, true);
      iniciarProgresoSync();
      try {
        const syncResult = await TrabajadoresAPI.sincronizarCache();
        completarProgresoSync(syncResult);
        await cargarTrabajadores(tablaBody, mobileContainer);
        actualizarSyncInfo({
          ok: true,
          ms: syncResult?.durationMs ?? null,
          ultimaSync: syncResult?.ultimaSync ?? obtenerUltimaSyncLocal(trabajadores),
          total: syncResult?.total ?? trabajadores.length,
          activos: syncResult?.activos ?? trabajadores.filter((t) => esTrabajadorActivo(t)).length,
          inactivos: syncResult?.inactivos ?? trabajadores.filter((t) => !esTrabajadorActivo(t)).length,
          reusedInFlightSync: !!syncResult?.reusedInFlightSync
        });
      } catch (error) {
        marcarErrorProgresoSync(error);
        actualizarSyncInfo({ ok: false });
      } finally {
        actualizandoTrabajadores = false;
        setEstadoBotonActualizar(btnActualizar, false);
      }
    });
  }

  const btnCancelar = document.getElementById('btnCancelarTrabajador');
  if (btnCancelar) btnCancelar.addEventListener('click', () => mostrarModalTrabajador(false));


  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => aplicarFiltros(tablaBody, mobileContainer), 120);
  });
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const trabajador = normalizarTrabajadorDesdeForm(form);
      const errores = validarTrabajador(trabajador);
      if (errores.length > 0) {
        alert(errores.join('\n'));
        return;
      }

      try {
        if (form.dataset.modo === 'editar' && form.dataset.id) {
          trabajador.id = form.dataset.id;
          await TrabajadoresAPI.actualizar(trabajador.id, trabajador);
          alert('Trabajador actualizado correctamente');
        } else {
          await TrabajadoresAPI.crear(trabajador);
          alert('Trabajador registrado correctamente');
        }

        form.reset();
        form.dataset.modo = 'crear';
        form.dataset.id = '';
        mostrarModalTrabajador(false);
        await cargarTrabajadores(tablaBody, mobileContainer);
      } catch (error) {
        alert('No se pudo guardar el trabajador: ' + (error?.message || 'Error desconocido'));
      }
    });
  }
}

function normalizarTrabajadorDesdeForm(form) {
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

function validarTrabajador(t) {
  const errores = [];
  if (!t.DOI || t.DOI.length !== 8 || !/^\d{8}$/.test(t.DOI)) errores.push('El DOI/DNI debe tener exactamente 8 digitos');
  if (!t.Nombres?.trim()) errores.push('Los nombres son obligatorios');
  if (!t.Apellidos?.trim()) errores.push('Los apellidos son obligatorios');
  if (!t.Area?.trim()) errores.push('El area es obligatoria');
  return errores;
}

function actualizarEstadisticas(data) {
  const total = data.length;
  const activos = data.filter((t) => esTrabajadorActivo(t)).length;
  const areasUnicas = new Set(data.map((t) => t.Area || t.AREA).filter(Boolean)).size;

  const statTotal = document.getElementById('statTotal');
  const statActivos = document.getElementById('statActivos');
  const statAreas = document.getElementById('statAreas');

  if (statTotal) statTotal.textContent = total;
  if (statActivos) statActivos.textContent = activos;
  if (statAreas) statAreas.textContent = areasUnicas;
}

function obtenerUltimaSyncLocal(data) {
  const valores = (Array.isArray(data) ? data : [])
    .map((t) => t.FechaSync || t.FECHASYNC)
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());

  return valores[0] || null;
}

function llenarFiltroAreas(data) {
  const selectArea = document.getElementById('filtroArea');
  if (!selectArea) return;

  const areas = [...new Set(data.map((t) => t.Area || t.AREA))].filter(Boolean);
  selectArea.innerHTML = '<option value="">Todas las areas</option>';
  areas.forEach((area) => {
    selectArea.innerHTML += `<option value="${area}">${area}</option>`;
  });
}

function esTrabajadorActivo(trabajador) {
  if (trabajador.Estado === 'Activo' || trabajador.Estado === 'ACTIVO') return true;
  if (trabajador.ESTADO === 'Activo' || trabajador.ESTADO === 'ACTIVO') return true;
  if (trabajador.Activo === '1' || trabajador.Activo === 1) return true;
  if (trabajador.ACTIVO === '1' || trabajador.ACTIVO === 1) return true;
  return false;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildTrabajadorSearchText(t) {
  return normalizeText([
    t.Trabajador,
    t.TRABAJADOR,
    t.NombreCompletoT,
    t.NOMBRECOMPLETOT,
    t.DOI,
    t.DOI_T,
    t.DOIT,
    t.Ocupacion,
    t.OCUPACION,
    t.Cargo,
    t.CARGO,
    t.Area,
    t.AREA,
    t.Estado,
    t.ESTADO
  ].filter(Boolean).join(' '));
}

function aplicarFiltros(tablaBody, mobileContainer, resetPage = false) {
  let resultado = [...trabajadores];

  const txtBuscar = document.getElementById('txtBuscar');
  const filtroArea = document.getElementById('filtroArea');
  const filtroEstado = document.getElementById('filtroEstado');

  const busqueda = txtBuscar ? normalizeText(txtBuscar.value) : '';
  if (busqueda) {
    const tokens = busqueda.split(' ').filter(Boolean);
    resultado = resultado.filter((t) => {
      const haystack = buildTrabajadorSearchText(t);
      return tokens.every((tk) => haystack.includes(tk));
    });
  }

  const area = filtroArea ? filtroArea.value : '';
  if (area) resultado = resultado.filter((t) => (t.Area || t.AREA) === area);

  const estado = filtroEstado ? filtroEstado.value : '';
  if (estado === 'activo') resultado = resultado.filter((t) => esTrabajadorActivo(t));
  else if (estado === 'inactivo') resultado = resultado.filter((t) => !esTrabajadorActivo(t));

  trabajadoresFiltrados = resultado;
  if (resetPage) currentPage = 1;

  const total = trabajadoresFiltrados.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const pageItems = trabajadoresFiltrados.slice(start, end);

  if (window.innerWidth <= MOBILE_BREAKPOINT) {
    if (tablaBody) tablaBody.innerHTML = '';
    renderizarCardsTrabajadores(mobileContainer, pageItems);
  } else {
    if (mobileContainer) mobileContainer.innerHTML = '';
    renderizarTablaTrabajadores(tablaBody, pageItems);
  }

  actualizarResumenLista(total, start, Math.min(end, total));
  renderizarPaginacion(tablaBody, mobileContainer, totalPages);
}

function renderizarTablaTrabajadores(tbody, data) {
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
    const esActivo = esTrabajadorActivo(t);
    const estadoTexto = esActivo ? 'Activo' : 'Inactivo';
    const estadoClass = esActivo ? 'badge-active' : 'badge-inactive';
    const nombreCompleto = (t.Trabajador || '-').trim();
    const iniciales = obtenerIniciales(nombreCompleto);

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

function renderizarCardsTrabajadores(container, data) {
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

    const esActivo = esTrabajadorActivo(t);
    const estadoTexto = esActivo ? 'Activo' : 'Inactivo';
    const estadoClass = esActivo ? 'badge-active' : 'badge-inactive';
    const nombreCompleto = (t.Trabajador || '-').trim();
    const iniciales = obtenerIniciales(nombreCompleto);
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

function mostrarLoadingTabla(tbody) {
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

function actualizarResumenLista(total = trabajadoresFiltrados.length, start = 0, end = total) {
  const el = document.getElementById('resumenTrabajadores');
  if (!el) return;
  if (total === 0) {
    el.textContent = `Mostrando 0 de ${trabajadores.length} trabajadores`;
    return;
  }
  el.textContent = `Mostrando ${start + 1}-${end} de ${total} trabajadores (total sistema: ${trabajadores.length})`;
}

function renderizarPaginacion(tablaBody, mobileContainer, totalPages) {
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

  btnFirst.onclick = () => {
    currentPage = 1;
    aplicarFiltros(tablaBody, mobileContainer);
  };
  btnPrev.onclick = () => {
    currentPage = Math.max(1, currentPage - 1);
    aplicarFiltros(tablaBody, mobileContainer);
  };
  btnNext.onclick = () => {
    currentPage = Math.min(totalPages, currentPage + 1);
    aplicarFiltros(tablaBody, mobileContainer);
  };
  btnLast.onclick = () => {
    currentPage = totalPages;
    aplicarFiltros(tablaBody, mobileContainer);
  };

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
    b.onclick = () => {
      currentPage = p;
      aplicarFiltros(tablaBody, mobileContainer);
    };
    pagesWrap.appendChild(b);
  }
}

function obtenerIniciales(nombre) {
  const p = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '--';
  return (p[0][0] + (p[1]?.[0] || '')).toUpperCase();
}

function mostrarErrorTabla(tbody, mensaje) {
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

function editarTrabajador(t) {
  const form = document.getElementById('form-trabajador');
  if (!form) return;

  form.dni.value = t.DOI || '';
  const partes = (t.Trabajador || '').trim().split(/\s+/);
  form.nombres.value = partes.slice(0, 2).join(' ');
  form.apellidos.value = partes.slice(2).join(' ');
  if (form.cargo) form.cargo.value = t.Ocupacion || '';
  if (form.area) form.area.value = t.Area || t.AREA || '';
  if (form.estado) form.estado.value = esTrabajadorActivo(t) ? 'Activo' : 'Inactivo';

  form.dataset.modo = 'editar';
  form.dataset.id = t.IdTrabajador;
  document.getElementById('tituloModalTrabajador').textContent = 'Editar Trabajador';
  mostrarModalTrabajador(true);
}

async function eliminarTrabajador(id, tablaBody) {
  if (!confirm('¿Seguro que deseas eliminar este trabajador?')) return;

  try {
    await TrabajadoresAPI.eliminar(id);
    alert('Trabajador eliminado correctamente');
    await cargarTrabajadores(tablaBody);
  } catch (error) {
    alert('No se pudo eliminar el trabajador: ' + (error?.message || 'Error desconocido'));
  }
}

function mostrarModalTrabajador(mostrar) {
  const modal = document.getElementById('modalTrabajador');
  if (!modal) return;
  modal.style.display = mostrar ? 'flex' : 'none';
}

function setEstadoBotonActualizar(btn, cargando) {
  if (!btn) return;
  btn.disabled = !!cargando;
  btn.setAttribute('aria-busy', cargando ? 'true' : 'false');
  btn.innerHTML = cargando
    ? '<i class="fa-solid fa-spinner fa-spin"></i> Actualizando...'
    : '<i class="fa-solid fa-rotate"></i> Actualizar';
}

function iniciarProgresoSync() {
  const panel = document.getElementById('syncTrabajadoresPanel');
  const title = document.getElementById('syncTrabajadoresTitle');
  const status = document.getElementById('syncTrabajadoresStatus');

  syncProgressValue = 8;
  pintarProgresoSync(syncProgressValue);
  if (panel) {
    panel.hidden = false;
    panel.classList.remove('is-success', 'is-error');
  }
  if (title) title.textContent = 'Sincronizando trabajadores';
  if (status) status.textContent = 'Consultando ERP y actualizando cache local...';

  if (syncProgressTimer) clearInterval(syncProgressTimer);
  syncProgressTimer = setInterval(() => {
    if (syncProgressValue >= 92) return;
    const incremento = syncProgressValue < 45 ? 7 : syncProgressValue < 75 ? 4 : 1;
    syncProgressValue = Math.min(92, syncProgressValue + incremento);
    pintarProgresoSync(syncProgressValue);
  }, 320);
}

function completarProgresoSync(result) {
  if (syncProgressTimer) {
    clearInterval(syncProgressTimer);
    syncProgressTimer = null;
  }

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

  pintarProgresoSync(100);
  window.setTimeout(() => {
    const currentPanel = document.getElementById('syncTrabajadoresPanel');
    if (currentPanel?.classList.contains('is-success')) {
      currentPanel.hidden = true;
    }
  }, 2200);
}

function marcarErrorProgresoSync(error) {
  if (syncProgressTimer) {
    clearInterval(syncProgressTimer);
    syncProgressTimer = null;
  }

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
  pintarProgresoSync(Math.max(syncProgressValue, 100));
}

function pintarProgresoSync(percent) {
  syncProgressValue = Math.max(0, Math.min(100, Number(percent) || 0));
  const percentEl = document.getElementById('syncTrabajadoresPercent');
  const bar = document.getElementById('syncTrabajadoresBar');
  const progress = document.querySelector('.sync-progress');

  if (percentEl) percentEl.textContent = `${Math.round(syncProgressValue)}%`;
  if (bar) bar.style.width = `${syncProgressValue}%`;
  if (progress) progress.setAttribute('aria-valuenow', String(Math.round(syncProgressValue)));
}

function formatearFechaHoraLocal(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function actualizarSyncInfo({ ok, ms = null, ultimaSync = null, total = null, activos = null, inactivos = null, reusedInFlightSync = false } = {}) {
  const el = document.getElementById('syncTrabajadoresInfo');
  if (!el) return;

  if (!ok) {
    el.textContent = 'No se pudo actualizar desde ERP';
    return;
  }

  const hora = formatearFechaHoraLocal(ultimaSync) || formatearFechaHoraLocal(new Date());
  const tiempo = ms == null ? '' : ` (${Math.round(ms)} ms)`;
  el.textContent = `Actualizado: ${hora}${tiempo}`;
}


