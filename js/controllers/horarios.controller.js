(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = { rows: [], vista: 'detalle', cargando: false };

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function hora(value) {
    return String(value || '').trim();
  }

  function fechaCorta(iso) {
    const [y, m, d] = String(iso || '').split('-');
    return y && m && d ? `${d}/${m}/${y}` : esc(iso);
  }

  function numero(value, decimales = 0) {
    const n = Number(value || 0);
    return n.toLocaleString('es-PE', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  }

  function isoLocal(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function fillTopbarUser() {
    try {
      const u = JSON.parse(localStorage.getItem('usuario') || 'null');
      if (!u) return;
      const rol = String(u.rol || u.Rol || '').toUpperCase() === 'USUARIO_ERP' ? 'USUARIO' : (u.rol || u.Rol || '');
      if ($('userName')) $('userName').textContent = u.nombre || u.NombreCompleto || 'Usuario';
      if ($('userRole')) $('userRole').textContent = rol;
    } catch {
      /* sin usuario guardado */
    }
  }

  function filasFiltradas() {
    const texto = String($('hrBuscar').value || '').trim().toUpperCase();
    const filtro = $('hrFiltro').value;
    return state.rows.filter((r) => {
      if (texto && !String(r.Trabajador || '').toUpperCase().includes(texto) && !String(r.DNI || '').includes(texto)) return false;
      if (filtro === 'papeleta' && !(Number(r.CantidadPapeletas) > 0)) return false;
      if (filtro === 'tarde' && !(Number(r.MinutosTarde) > 0)) return false;
      if (filtro === 'sinmarca' && r.SinMarcas !== 'SI') return false;
      return true;
    });
  }

  function marcasHtml(r) {
    const marcas = [r.Marca1, r.Marca2, r.Marca3, r.Marca4].map(hora).filter(Boolean);
    if (!marcas.length) return '<span class="hr-sin">Sin marcas</span>';
    const extra = Number(r.CantidadMarcas || 0) > 4 ? ` <span class="hr-muted">(+${Number(r.CantidadMarcas) - 4})</span>` : '';
    const manual = Number(r.MarcasManuales || 0) > 0 ? ' <span class="hr-chip hr-chip-manual" title="Incluye marcas manuales">Manual</span>' : '';
    return `${marcas.map(esc).join(' · ')}${extra}${manual}`;
  }

  function renderDetalle(rows) {
    const tbody = $('hrTablaDetalle').querySelector('tbody');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="hr-vacio">No hay registros para este filtro.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((r) => {
      const entrada = hora(r.HoraEntradaProgramada);
      const salida = hora(r.HoraSalidaProgramada);
      const horario = entrada || salida ? `${esc(entrada || '—')} a ${esc(salida || '—')}` : '<span class="hr-muted">Sin horario</span>';
      const tarde = Number(r.MinutosTarde || 0) > 0 ? `<span class="hr-chip hr-chip-tarde">${numero(r.MinutosTarde)} min</span>` : '';
      const tienePap = Number(r.CantidadPapeletas || 0) > 0;
      const feriado = r.Feriado === 'SI' ? ' <span class="hr-chip">Feriado</span>' : '';
      return `
        <tr class="${tienePap ? 'hr-con-papeleta' : ''}">
          <td><strong>${fechaCorta(r.Fecha)}</strong><div class="hr-muted">${esc(r.DiaSemana)}${feriado}</div></td>
          <td><strong>${esc(r.Trabajador)}</strong><div class="hr-muted">${esc(r.DNI)} · ${esc(r.Cargo)}</div></td>
          <td>${horario}</td>
          <td>${marcasHtml(r)}</td>
          <td>${tarde}</td>
          <td>${tienePap ? esc(r.NumeroPapeleta) : ''}</td>
          <td>${tienePap ? esc(r.HorarioPermiso) : ''}</td>
          <td>${tienePap ? esc(r.TipoPermiso) : ''}</td>
          <td class="hr-motivo">${tienePap ? esc(r.MotivoPermiso) : ''}</td>
          <td>${tienePap ? numero(r.HorasPermiso, 2) : ''}</td>
        </tr>`;
    }).join('');
  }

  function resumir(rows) {
    const map = new Map();
    rows.forEach((r) => {
      const key = r.DNI;
      if (!map.has(key)) {
        map.set(key, {
          Trabajador: r.Trabajador, DNI: r.DNI, Area: r.AreaERP || r.Seccion,
          conMarca: 0, sinMarca: 0, diasTarde: 0, minTarde: 0, papeletas: 0, horas: 0
        });
      }
      const s = map.get(key);
      if (r.SinMarcas === 'SI') s.sinMarca += 1; else s.conMarca += 1;
      if (Number(r.MinutosTarde || 0) > 0) { s.diasTarde += 1; s.minTarde += Number(r.MinutosTarde); }
      s.papeletas += Number(r.CantidadPapeletas || 0);
      s.horas += Number(r.HorasPermiso || 0);
    });
    return [...map.values()].sort((a, b) => String(a.Trabajador).localeCompare(String(b.Trabajador), 'es'));
  }

  function renderResumen(rows) {
    const tbody = $('hrTablaResumen').querySelector('tbody');
    const resumen = resumir(rows);
    if (!resumen.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="hr-vacio">No hay registros para este filtro.</td></tr>';
      return;
    }
    tbody.innerHTML = resumen.map((s) => `
      <tr>
        <td><strong>${esc(s.Trabajador)}</strong><div class="hr-muted">${esc(s.DNI)}</div></td>
        <td>${esc(s.Area)}</td>
        <td>${numero(s.conMarca)}</td>
        <td>${numero(s.sinMarca)}</td>
        <td>${numero(s.diasTarde)}</td>
        <td>${numero(s.minTarde)}</td>
        <td>${numero(s.papeletas)}</td>
        <td>${numero(s.horas, 2)}</td>
      </tr>`).join('');
  }

  function render() {
    const rows = filasFiltradas();
    $('hrStatTrab').textContent = numero(new Set(rows.map((r) => r.DNI)).size);
    $('hrStatTarde').textContent = numero(rows.filter((r) => Number(r.MinutosTarde || 0) > 0).length);
    $('hrStatPap').textContent = numero(rows.reduce((t, r) => t + Number(r.CantidadPapeletas || 0), 0));
    $('hrStatHoras').textContent = numero(rows.reduce((t, r) => t + Number(r.HorasPermiso || 0), 0), 2);

    if (state.vista === 'detalle') renderDetalle(rows); else renderResumen(rows);
    $('hrResumenTexto').textContent = state.vista === 'detalle'
      ? `Mostrando ${numero(rows.length)} días de ${numero(state.rows.length)}`
      : `Mostrando ${numero(new Set(rows.map((r) => r.DNI)).size)} trabajadores`;
  }

  function mostrarMensaje(texto) {
    const cols = state.vista === 'detalle' ? 10 : 8;
    const tabla = state.vista === 'detalle' ? $('hrTablaDetalle') : $('hrTablaResumen');
    tabla.querySelector('tbody').innerHTML = `<tr><td colspan="${cols}" class="hr-vacio">${texto}</td></tr>`;
  }

  async function cargar() {
    if (state.cargando) return;
    const desde = $('hrDesde').value;
    const hasta = $('hrHasta').value;
    if (!desde || !hasta) return;

    state.cargando = true;
    $('btnHrActualizar').disabled = true;
    mostrarMensaje('<div class="loading"><i class="fas fa-spinner fa-spin"></i><p>Cargando horarios...</p></div>');
    try {
      const qs = new URLSearchParams({ desde, hasta });
      const response = await fetch(`${API_CONFIG.baseURL}/horarios?${qs}`, {
        method: 'GET',
        headers: getAuthHeaders(),
        cache: 'no-store'
      });
      const data = await handleResponse(response);
      state.rows = Array.isArray(data?.data) ? data.data : [];
      const areas = Array.isArray(data?.areas) ? data.areas : null;
      $('hrAlcance').textContent = areas
        ? (areas.length ? `Tu personal: ${areas.join(', ')}` : 'No tienes áreas asignadas. Pide a RRHH que te asigne tu área.')
        : 'Todo el personal de Producción y Desarrollo de Productos';
      render();
    } catch (error) {
      state.rows = [];
      mostrarMensaje(esc(error?.message || 'No se pudo cargar el horario'));
    } finally {
      state.cargando = false;
      $('btnHrActualizar').disabled = false;
    }
  }

  function cambiarVista(vista) {
    state.vista = vista;
    document.querySelectorAll('.hr-tab').forEach((b) => {
      const activo = b.dataset.vista === vista;
      b.classList.toggle('active', activo);
      b.setAttribute('aria-selected', activo ? 'true' : 'false');
    });
    $('hrCardDetalle').hidden = vista !== 'detalle';
    $('hrCardResumen').hidden = vista !== 'resumen';
    render();
  }

  function init() {
    fillTopbarUser();
    const hoy = new Date();
    $('hrDesde').value = isoLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    $('hrHasta').value = isoLocal(hoy);

    $('btnHrActualizar').addEventListener('click', cargar);
    $('hrDesde').addEventListener('change', cargar);
    $('hrHasta').addEventListener('change', cargar);
    $('hrBuscar').addEventListener('input', render);
    $('hrFiltro').addEventListener('change', render);
    document.querySelectorAll('.hr-tab').forEach((b) => b.addEventListener('click', () => cambiarVista(b.dataset.vista)));

    cargar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
