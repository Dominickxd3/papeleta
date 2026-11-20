(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const PAGINA = 300;
  const state = {
    rows: [],
    vista: 'detalle',
    cargando: false,
    visibles: PAGINA,
    orden: { campo: 'Trabajador', dir: 'asc' }
  };

  // ---------- utilidades ----------
  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  const hora = (v) => String(v || '').trim();
  const num = (v) => Number(v || 0) || 0;

  function numero(value, decimales = 0) {
    return num(value).toLocaleString('es-PE', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  }

  function minutosTexto(m) {
    const total = Math.round(num(m));
    if (total < 60) return `${total} min`;
    const h = Math.floor(total / 60);
    const r = total % 60;
    return r ? `${h} h ${r} min` : `${h} h`;
  }

  function isoLocal(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function fechaLarga(iso) {
    const [y, m, d] = String(iso || '').split('-').map(Number);
    if (!y) return esc(iso);
    return new Date(y, m - 1, d).toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
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

  // ---------- filtros ----------
  const esTarde = (r) => num(r.MinutosTarde) > 0;
  const esSinMarca = (r) => r.SinMarcas === 'SI';
  const tienePapeleta = (r) => num(r.CantidadPapeletas) > 0;
  const saleAntes = (r) => num(r.MinutosSalidaAntes) > 0 && num(r.CantidadMarcas) > 1;

  function filasFiltradas() {
    const texto = String($('hrBuscar').value || '').trim().toUpperCase();
    const area = $('hrArea').value;
    const filtro = $('hrFiltro').value;
    return state.rows.filter((r) => {
      if (texto && !String(r.Trabajador || '').toUpperCase().includes(texto) && !String(r.DNI || '').includes(texto)) return false;
      if (area && r.AreaERP !== area) return false;
      if (filtro === 'tarde' && !esTarde(r)) return false;
      if (filtro === 'sinmarca' && !esSinMarca(r)) return false;
      if (filtro === 'papeleta' && !tienePapeleta(r)) return false;
      if (filtro === 'salida' && !saleAntes(r)) return false;
      return true;
    });
  }

  // ---------- indicadores ----------
  function renderKpis(rows) {
    const trabajadores = new Set(rows.map((r) => r.DNI)).size;
    const tarde = rows.filter(esTarde);
    const minTarde = tarde.reduce((t, r) => t + num(r.MinutosTarde), 0);
    const pap = rows.reduce((t, r) => t + num(r.CantidadPapeletas), 0);
    const conPap = new Set(rows.filter(tienePapeleta).map((r) => r.DNI)).size;

    $('hrStatTrab').textContent = numero(trabajadores);
    $('hrStatTrabSub').textContent = `${numero(rows.length)} días registrados`;
    $('hrStatTarde').textContent = numero(tarde.length);
    $('hrStatTardeSub').textContent = tarde.length ? `${minutosTexto(minTarde)} en total` : 'sin tardanzas';
    $('hrStatSin').textContent = numero(rows.filter(esSinMarca).length);
    $('hrStatPap').textContent = numero(pap);
    $('hrStatPapSub').textContent = `${numero(conPap)} trabajadores`;
    $('hrStatHoras').textContent = numero(rows.reduce((t, r) => t + num(r.HorasPermiso), 0), 2);

    const filtro = $('hrFiltro').value;
    document.querySelectorAll('.hr-kpi').forEach((k) => k.classList.toggle('active', !!filtro && k.dataset.filtro === filtro));
  }

  // ---------- detalle por dia ----------
  function celdaEntrada(r) {
    if (esSinMarca(r)) return '<span class="hr-tag hr-tag--bad">Sin marcas</span>';
    const t = hora(r.PrimeraMarca || r.Marca1);
    const clase = esTarde(r) ? 'late' : (hora(r.HoraEntradaProgramada) ? 'ok' : '');
    const lugar = r.LugarEntrada ? `<div class="hr-sub">${esc(r.LugarEntrada)}</div>` : '';
    return `<span class="hr-time ${clase}">${esc(t)}</span>${lugar}`;
  }

  function celdaSalida(r) {
    if (esSinMarca(r)) return '';
    if (num(r.CantidadMarcas) < 2) {
      return r.Fecha === isoLocal(new Date())
        ? '<span class="hr-tag">En turno</span>'
        : '<span class="hr-tag hr-tag--warn">Sin salida</span>';
    }
    const t = hora(r.UltimaMarca);
    const clase = saleAntes(r) ? 'early' : (hora(r.HoraSalidaProgramada) ? 'ok' : '');
    const marcas = [r.Marca1, r.Marca2, r.Marca3, r.Marca4].map(hora).filter(Boolean);
    const extra = num(r.CantidadMarcas) > 2
      ? `<div class="hr-sub" title="Marcas: ${esc(marcas.join(', '))}${num(r.CantidadMarcas) > 4 ? '…' : ''}">${num(r.CantidadMarcas)} marcas</div>`
      : '';
    const antes = saleAntes(r) ? `<div class="hr-sub">${minutosTexto(r.MinutosSalidaAntes)} antes</div>` : '';
    return `<span class="hr-time ${clase}">${esc(t)}</span>${antes || extra}`;
  }

  function celdaPermiso(r) {
    if (!tienePapeleta(r)) return '';
    const tipo = r.TipoPermiso ? `<span class="hr-tag hr-tag--pap">${esc(r.TipoPermiso)}</span>` : '';
    const motivo = r.MotivoPermiso ? `<div class="hr-perm__motivo" title="${esc(r.MotivoPermiso)}">${esc(r.MotivoPermiso)}</div>` : '';
    return `
      <div class="hr-perm">
        <div class="hr-perm__head">N° ${esc(r.NumeroPapeleta)} ${tipo}</div>
        <div class="hr-perm__time">${esc(r.HorarioPermiso)}</div>
        ${motivo}
      </div>`;
  }

  function filaDetalle(r) {
    const entrada = hora(r.HoraEntradaProgramada);
    const salida = hora(r.HoraSalidaProgramada);
    const horario = entrada || salida
      ? `<span class="hr-time">${esc(entrada || '—')} – ${esc(salida || '—')}</span>`
      : '<span class="hr-none">Sin horario</span>';
    const feriado = r.Feriado === 'SI' ? ' <span class="hr-tag">Feriado</span>' : '';
    const manual = num(r.MarcasManuales) > 0 ? ' <span class="hr-tag hr-tag--manual" title="Incluye marcas registradas a mano">Manual</span>' : '';
    const estado = esSinMarca(r) ? 'is-sin' : esTarde(r) ? 'is-tarde' : tienePapeleta(r) ? 'is-pap' : '';
    const tarde = esTarde(r) ? `<span class="hr-tag hr-tag--warn">${minutosTexto(r.MinutosTarde)}</span>` : '';

    return `
      <tr class="hr-row ${estado}">
        <td data-label="Trabajador">
          <div class="hr-name">${esc(r.Trabajador)}${manual}</div>
          <div class="hr-sub">${esc(r.DNI)} · ${esc(r.Cargo)}</div>
        </td>
        <td data-label="Horario">${horario}${feriado}</td>
        <td data-label="Entrada">${celdaEntrada(r)}</td>
        <td data-label="Salida">${celdaSalida(r)}</td>
        <td data-label="Tardanza">${tarde}</td>
        <td data-label="Papeleta">${celdaPermiso(r)}</td>
        <td data-label="Horas" class="num">${tienePapeleta(r) ? numero(r.HorasPermiso, 2) : ''}</td>
      </tr>`;
  }

  function renderDetalle(rows) {
    const tbody = $('hrTablaDetalle').querySelector('tbody');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="hr-empty"><i class="fa-regular fa-calendar-xmark"></i>No hay registros para este filtro.</td></tr>';
      return;
    }

    const porDia = new Map();
    rows.forEach((r) => {
      if (!porDia.has(r.Fecha)) porDia.set(r.Fecha, []);
      porDia.get(r.Fecha).push(r);
    });

    let html = '';
    let pintadas = 0;
    for (const [fecha, lista] of porDia) {
      if (pintadas >= state.visibles) break;
      const tardes = lista.filter(esTarde).length;
      const sin = lista.filter(esSinMarca).length;
      const pap = lista.reduce((t, r) => t + num(r.CantidadPapeletas), 0);
      html += `
        <tr class="hr-day"><td colspan="7">
          <span class="hr-day__date">${fechaLarga(fecha)}</span>
          <span class="hr-day__meta"><b>${lista.length}</b> trabajadores · <b>${tardes}</b> tardanzas · <b>${sin}</b> sin marcas · <b>${pap}</b> papeletas</span>
        </td></tr>`;
      for (const r of lista) {
        if (pintadas >= state.visibles) break;
        html += filaDetalle(r);
        pintadas += 1;
      }
    }
    if (pintadas < rows.length) {
      html += `<tr class="hr-more"><td colspan="7"><button type="button" class="hr-btn" id="hrVerMas">Ver ${numero(Math.min(PAGINA, rows.length - pintadas))} más</button></td></tr>`;
    }
    tbody.innerHTML = html;
    $('hrVerMas')?.addEventListener('click', () => { state.visibles += PAGINA; render(); });
  }

  // ---------- resumen por trabajador ----------
  function resumir(rows) {
    const map = new Map();
    rows.forEach((r) => {
      if (!map.has(r.DNI)) {
        map.set(r.DNI, {
          Trabajador: r.Trabajador, DNI: r.DNI, Area: r.AreaERP || r.Seccion, Cargo: r.Cargo,
          conMarca: 0, sinMarca: 0, diasTarde: 0, minTarde: 0, salidas: 0, papeletas: 0, horas: 0
        });
      }
      const s = map.get(r.DNI);
      if (esSinMarca(r)) s.sinMarca += 1; else s.conMarca += 1;
      if (esTarde(r)) { s.diasTarde += 1; s.minTarde += num(r.MinutosTarde); }
      if (saleAntes(r)) s.salidas += 1;
      s.papeletas += num(r.CantidadPapeletas);
      s.horas += num(r.HorasPermiso);
    });
    const lista = [...map.values()];
    lista.forEach((s) => { s.asistencia = s.conMarca / Math.max(1, s.conMarca + s.sinMarca); });

    const { campo, dir } = state.orden;
    const signo = dir === 'asc' ? 1 : -1;
    lista.sort((a, b) => {
      if (campo === 'Trabajador') return signo * String(a.Trabajador).localeCompare(String(b.Trabajador), 'es');
      return signo * (a[campo] - b[campo]) || String(a.Trabajador).localeCompare(String(b.Trabajador), 'es');
    });
    return lista;
  }

  function celdaNum(valor, texto) {
    return valor ? `<td class="num">${texto ?? numero(valor)}</td>` : '<td class="num hr-zero">0</td>';
  }

  function renderResumen(rows) {
    const tbody = $('hrTablaResumen').querySelector('tbody');
    const resumen = resumir(rows);
    document.querySelectorAll('#hrTablaResumen th.sortable').forEach((th) => {
      th.classList.toggle('sort-asc', th.dataset.orden === state.orden.campo && state.orden.dir === 'asc');
      th.classList.toggle('sort-desc', th.dataset.orden === state.orden.campo && state.orden.dir === 'desc');
    });
    if (!resumen.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="hr-empty"><i class="fa-regular fa-user"></i>No hay registros para este filtro.</td></tr>';
      return;
    }
    tbody.innerHTML = resumen.map((s) => {
      const pct = Math.round(s.asistencia * 100);
      return `
        <tr class="hr-row ${s.sinMarca ? '' : ''}">
          <td data-label="Trabajador">
            <div class="hr-name">${esc(s.Trabajador)}</div>
            <div class="hr-sub">${esc(s.DNI)} · ${esc(s.Area)}</div>
          </td>
          <td data-label="Asistencia">
            <div class="hr-bar" title="${s.conMarca} días con marca, ${s.sinMarca} sin marca">
              <div class="hr-bar__track"><div class="hr-bar__fill" style="width:${pct}%"></div></div>
              <span class="hr-bar__txt">${s.conMarca}/${s.conMarca + s.sinMarca} días</span>
            </div>
          </td>
          ${celdaNum(s.diasTarde, `${numero(s.diasTarde)} ${s.diasTarde === 1 ? 'día' : 'días'}`).replace('<td', '<td data-label="Tardanzas"')}
          ${celdaNum(s.minTarde, minutosTexto(s.minTarde)).replace('<td', '<td data-label="Tiempo tarde"')}
          ${celdaNum(s.salidas).replace('<td', '<td data-label="Salidas antes"')}
          ${celdaNum(s.papeletas).replace('<td', '<td data-label="Papeletas"')}
          ${celdaNum(s.horas, numero(s.horas, 2)).replace('<td', '<td data-label="Horas permiso"')}
        </tr>`;
    }).join('');
  }

  // ---------- render general ----------
  function render() {
    const rows = filasFiltradas();
    renderKpis(rows);
    if (state.vista === 'detalle') {
      renderDetalle(rows);
      $('hrResumenTexto').textContent = `${numero(rows.length)} de ${numero(state.rows.length)} registros`;
    } else {
      renderResumen(rows);
      $('hrResumenTexto').textContent = `${numero(new Set(rows.map((r) => r.DNI)).size)} trabajadores`;
    }
  }

  function mostrarMensaje(html) {
    const tabla = state.vista === 'detalle' ? $('hrTablaDetalle') : $('hrTablaResumen');
    tabla.querySelector('tbody').innerHTML = `<tr><td colspan="7" class="hr-empty">${html}</td></tr>`;
  }

  function llenarAreas() {
    const select = $('hrArea');
    const actual = select.value;
    const areas = [...new Set(state.rows.map((r) => r.AreaERP).filter(Boolean))].sort();
    select.innerHTML = '<option value="">Todas las áreas</option>' +
      areas.map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
    select.value = areas.includes(actual) ? actual : '';
    select.hidden = areas.length < 2;
  }

  function marcarRangoRapido() {
    const desde = $('hrDesde').value;
    const hasta = $('hrHasta').value;
    document.querySelectorAll('.hr-quick button').forEach((b) => {
      const [d, h] = rangoRapido(b.dataset.rango);
      b.classList.toggle('active', d === desde && h === hasta);
    });
  }

  function rangoRapido(tipo) {
    const hoy = new Date();
    if (tipo === 'hoy') return [isoLocal(hoy), isoLocal(hoy)];
    if (tipo === 'semana') {
      const lunes = new Date(hoy);
      lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
      return [isoLocal(lunes), isoLocal(hoy)];
    }
    if (tipo === 'mesAnterior') {
      return [isoLocal(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)), isoLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 0))];
    }
    return [isoLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), isoLocal(hoy)];
  }

  async function cargar() {
    if (state.cargando) return;
    const desde = $('hrDesde').value;
    const hasta = $('hrHasta').value;
    if (!desde || !hasta) return;

    state.cargando = true;
    state.visibles = PAGINA;
    marcarRangoRapido();
    $('btnHrActualizar').disabled = true;
    mostrarMensaje('<i class="fa-solid fa-spinner fa-spin"></i>Cargando horarios…');
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
        ? (areas.length ? `Tu personal · ${areas.join(' · ')}` : 'No tienes áreas asignadas. Pide a RRHH que te asigne tu área.')
        : 'Todo el personal de Producción y Desarrollo de Productos';
      $('hrActualizado').textContent = `Actualizado ${new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`;
      llenarAreas();
      render();
    } catch (error) {
      state.rows = [];
      renderKpis([]);
      mostrarMensaje(`<i class="fa-solid fa-triangle-exclamation"></i>${esc(error?.message || 'No se pudo cargar el horario')}`);
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
    const [d, h] = rangoRapido('mes');
    $('hrDesde').value = d;
    $('hrHasta').value = h;

    let buscarTimer = null;
    const reRender = () => { state.visibles = PAGINA; render(); };

    $('btnHrActualizar').addEventListener('click', cargar);
    $('hrDesde').addEventListener('change', cargar);
    $('hrHasta').addEventListener('change', cargar);
    $('hrBuscar').addEventListener('input', () => { clearTimeout(buscarTimer); buscarTimer = setTimeout(reRender, 150); });
    $('hrArea').addEventListener('change', reRender);
    $('hrFiltro').addEventListener('change', reRender);

    document.querySelectorAll('.hr-quick button').forEach((b) => b.addEventListener('click', () => {
      const [desde, hasta] = rangoRapido(b.dataset.rango);
      $('hrDesde').value = desde;
      $('hrHasta').value = hasta;
      cargar();
    }));

    document.querySelectorAll('.hr-kpi').forEach((k) => k.addEventListener('click', () => {
      const f = k.dataset.filtro || '';
      $('hrFiltro').value = $('hrFiltro').value === f ? '' : f;
      reRender();
    }));

    document.querySelectorAll('.hr-tab').forEach((b) => b.addEventListener('click', () => cambiarVista(b.dataset.vista)));

    document.querySelectorAll('#hrTablaResumen th.sortable').forEach((th) => th.addEventListener('click', () => {
      const campo = th.dataset.orden;
      if (state.orden.campo === campo) state.orden.dir = state.orden.dir === 'asc' ? 'desc' : 'asc';
      else state.orden = { campo, dir: campo === 'Trabajador' ? 'asc' : 'desc' };
      render();
    }));

    cargar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
