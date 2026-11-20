(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const PAGINA = 300;
  const state = {
    rows: [],
    vista: 'detalle',
    todos: false,
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
    const t = new Date(y, m - 1, d).toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    return t.charAt(0).toUpperCase() + t.slice(1);
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

  const VACIO = '<span class="hr-none">—</span>';
  const esHoy = (r) => r.Fecha === isoLocal(new Date());
  const CONECTORES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'en', 'a', 'al', 'para', 'por', 'con']);

  // "AUXILIAR DE DESARROLLO DE PRODUCTOS" -> "Auxiliar de Desarrollo de Productos"
  function tipoTitulo(texto) {
    return String(texto || '').toLowerCase().split(/\s+/).filter(Boolean)
      .map((p, i) => (i > 0 && CONECTORES.has(p)) ? p : p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
  }

  // "CITA MEDICA" -> "Cita medica"
  function tipoOracion(texto) {
    const t = String(texto || '').trim().toLowerCase();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }

  function celdaTrabajador(nombre, sub) {
    return `
      <div class="hr-worker">
        <span class="hr-avatar" aria-hidden="true"><i class="fa-solid fa-user"></i></span>
        <div class="hr-worker__txt">
          <div class="hr-name">${esc(nombre)}</div>
          <div class="hr-sub">${sub}</div>
        </div>
      </div>`;
  }

  function pill(texto, tipo) {
    return `<span class="hr-pill hr-pill--${tipo}"><span class="hr-dot"></span>${texto}</span>`;
  }

  // ---------- detalle por dia ----------
  function celdaEstado(r) {
    if (esSinMarca(r)) return pill('Sin marcas', 'bad');
    if (num(r.CantidadMarcas) < 2) return esHoy(r) ? pill('En turno', 'ok') : pill('Sin salida', 'warn');
    if (saleAntes(r)) return pill('Salió antes', 'warn');
    return pill('Asistió', 'ok');
  }

  function marcasTitulo(r) {
    const marcas = [r.Marca1, r.Marca2, r.Marca3, r.Marca4].map(hora).filter(Boolean);
    let t = `Marcas: ${marcas.join(', ')}${num(r.CantidadMarcas) > 4 ? '…' : ''}`;
    if (num(r.MarcasManuales) > 0) t += ' (incluye marcas manuales)';
    return esc(t);
  }

  function celdaEntrada(r) {
    if (esSinMarca(r)) return VACIO;
    const clase = esTarde(r) ? 'late' : (hora(r.HoraEntradaProgramada) ? 'ok' : '');
    return `<span class="hr-time ${clase}" title="${marcasTitulo(r)}">${esc(hora(r.PrimeraMarca || r.Marca1))}</span>`;
  }

  function celdaSalida(r) {
    if (esSinMarca(r) || num(r.CantidadMarcas) < 2) return VACIO;
    const clase = saleAntes(r) ? 'late' : '';
    return `<span class="hr-time ${clase}" title="${marcasTitulo(r)}">${esc(hora(r.UltimaMarca))}</span>`;
  }

  function celdaPermiso(r) {
    if (!tienePapeleta(r)) return VACIO;
    const tipo = r.TipoPermiso ? ` · ${esc(r.TipoPermiso)}` : '';
    const detalle = [r.HorarioPermiso, tipoOracion(r.MotivoPermiso)].filter(Boolean).map(esc).join(' · ');
    return `
      <div class="hr-perm" title="${esc(r.MotivoPermiso || '')}">
        <i class="fa-regular fa-file-lines" aria-hidden="true"></i>
        <div>
          <div class="hr-perm__head">N° ${esc(r.NumeroPapeleta)}${tipo}</div>
          <div class="hr-sub">${detalle}</div>
        </div>
      </div>`;
  }

  function filaDetalle(r) {
    const entrada = hora(r.HoraEntradaProgramada);
    const salida = hora(r.HoraSalidaProgramada);
    const horario = entrada || salida
      ? `<span class="hr-strong">${esc(entrada || '—')} – ${esc(salida || '—')}</span>`
      : VACIO;
    const feriado = r.Feriado === 'SI' ? '<div class="hr-sub">Feriado</div>' : '';
    const tarde = esTarde(r) ? `<span class="hr-pill hr-pill--warn">${minutosTexto(r.MinutosTarde)}</span>` : VACIO;

    return `
      <tr class="hr-row">
        <td data-label="Trabajador">${celdaTrabajador(r.Trabajador, `${esc(r.DNI)} · ${esc(tipoTitulo(r.Cargo))}`)}</td>
        <td data-label="Horario" class="center">${horario}${feriado}</td>
        <td data-label="Entrada" class="center">${celdaEntrada(r)}</td>
        <td data-label="Salida" class="center">${celdaSalida(r)}</td>
        <td data-label="Estado">${celdaEstado(r)}</td>
        <td data-label="Tardanza" class="center">${tarde}</td>
        <td data-label="Papeleta">${celdaPermiso(r)}</td>
        <td data-label="Horas" class="num">${tienePapeleta(r) ? `<span class="hr-strong">${numero(r.HorasPermiso, 2)}</span>` : VACIO}</td>
      </tr>`;
  }

  function renderDetalle(rows) {
    const tbody = $('hrTablaDetalle').querySelector('tbody');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="hr-empty"><i class="fa-regular fa-calendar-xmark"></i>No hay registros para este filtro.</td></tr>';
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
      html += `
        <tr class="hr-day"><td colspan="8">
          <span class="hr-day__date">${fechaLarga(fecha)}</span>
          <span class="hr-day__meta">· ${lista.length} trabajadores</span>
        </td></tr>`;
      for (const r of lista) {
        if (pintadas >= state.visibles) break;
        html += filaDetalle(r);
        pintadas += 1;
      }
    }
    if (pintadas < rows.length) {
      html += `<tr class="hr-more"><td colspan="8"><button type="button" class="hr-btn" id="hrVerMas">Ver ${numero(Math.min(PAGINA, rows.length - pintadas))} más</button></td></tr>`;
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

  function celdaNum(label, valor, texto) {
    return `<td data-label="${label}" class="center">${valor ? `<span class="hr-strong">${texto ?? numero(valor)}</span>` : VACIO}</td>`;
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
      const total = s.conMarca + s.sinMarca;
      const sinMarca = s.sinMarca ? ` <span class="hr-sub">(${s.sinMarca} sin marca)</span>` : '';
      const tarde = s.diasTarde
        ? `<span class="hr-pill hr-pill--warn">${numero(s.diasTarde)} ${s.diasTarde === 1 ? 'día' : 'días'}</span>`
        : VACIO;
      return `
        <tr class="hr-row">
          <td data-label="Trabajador">${celdaTrabajador(s.Trabajador, `${esc(s.DNI)} · ${esc(tipoTitulo(s.Cargo))}`)}</td>
          <td data-label="Asistencia" class="center"><span class="hr-strong">${s.conMarca} de ${total}</span>${sinMarca}</td>
          <td data-label="Tardanzas" class="center">${tarde}</td>
          ${celdaNum('Tiempo tarde', s.minTarde, minutosTexto(s.minTarde))}
          ${celdaNum('Salidas antes', s.salidas)}
          ${celdaNum('Papeletas', s.papeletas)}
          ${celdaNum('Horas permiso', s.horas, numero(s.horas, 2))}
        </tr>`;
    }).join('');
  }

  // ---------- render general ----------
  function render() {
    const rows = filasFiltradas();
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
    const cols = state.vista === 'detalle' ? 8 : 7;
    tabla.querySelector('tbody').innerHTML = `<tr><td colspan="${cols}" class="hr-empty">${html}</td></tr>`;
  }

  function llenarAreas() {
    const select = $('hrArea');
    const actual = select.value;
    const areas = [...new Set(state.rows.map((r) => r.AreaERP).filter(Boolean))].sort();
    select.innerHTML = '<option value="">Todas las áreas</option>' +
      areas.map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
    select.value = areas.includes(actual) ? actual : '';
    // Solo ADMIN / RRHH (acceso a todo) eligen area; los jefes ya vienen filtrados por su rol.
    select.hidden = !state.todos || areas.length < 2;
    if (select.hidden) select.value = '';
  }

  // Rango inicial: del 1 del mes actual a hoy.
  function rangoInicial() {
    const hoy = new Date();
    return [isoLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), isoLocal(hoy)];
  }

  async function cargar() {
    if (state.cargando) return;
    const desde = $('hrDesde').value;
    const hasta = $('hrHasta').value;
    if (!desde || !hasta) return;

    state.cargando = true;
    state.visibles = PAGINA;
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
      state.todos = !Array.isArray(data?.areas);
      $('hrActualizado').textContent = `Actualizado ${new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`;
      llenarAreas();
      render();
    } catch (error) {
      state.rows = [];
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
    const [d, h] = rangoInicial();
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
