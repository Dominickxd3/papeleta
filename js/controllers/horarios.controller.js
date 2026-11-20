(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const REFRESCO_MS = 60 * 1000; // actualizacion automatica cada minuto
  const state = {
    rows: [],
    vista: 'detalle',
    todos: false,
    cargando: false,
    pagina: 1,
    porPagina: 10,
    ultimaCarga: null,
    orden: { campo: 'Trabajador', dir: 'asc' },
    panel: { dni: null, filtro: '' }
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

  const plural = (n, uno, varios) => `${numero(n)} ${n === 1 ? uno : varios}`;

  function isoLocal(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function fechaPartes(iso) {
    const [y, m, d] = String(iso || '').split('-').map(Number);
    if (!y) return { corta: esc(iso), dia: '' };
    const fecha = new Date(y, m - 1, d);
    const dia = fecha.toLocaleDateString('es-PE', { weekday: 'long' });
    return {
      corta: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`,
      dia: dia.charAt(0).toUpperCase() + dia.slice(1)
    };
  }

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

  // ---------- reglas ----------
  const esHoy = (r) => r.Fecha === isoLocal(new Date());
  const esTarde = (r) => num(r.MinutosTarde) > 0;
  const esSinMarca = (r) => r.SinMarcas === 'SI';
  const tienePapeleta = (r) => num(r.CantidadPapeletas) > 0;
  const saleAntes = (r) => num(r.MinutosSalidaAntes) > 0 && num(r.CantidadMarcas) > 1;

  const aMinutos = (hhmm) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(hora(hhmm));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };

  // Tiempo extra: minutos que se quedo despues de su hora de salida programada.
  function minutosExtra(r) {
    if (num(r.CantidadMarcas) < 2) return 0;
    const ultima = aMinutos(r.UltimaMarca);
    const salida = aMinutos(r.HoraSalidaProgramada);
    const entrada = aMinutos(r.HoraEntradaProgramada);
    if (ultima === null || salida === null) return 0;
    if (entrada !== null && salida <= entrada) return 0; // turnos que cruzan medianoche: no se calcula
    return Math.max(0, ultima - salida);
  }
  const tieneExtra = (r) => minutosExtra(r) > 0;

  function balanceTexto(min) {
    if (min > 0) return { texto: `Se le debe ${minutosTexto(min)}`, detalle: 'la empresa le debe tiempo', tono: 'is-ok' };
    if (min < 0) return { texto: `Debe ${minutosTexto(-min)}`, detalle: 'debe tiempo a la empresa', tono: 'is-bad-main' };
    return { texto: 'Sin saldo', detalle: 'no debe ni se le debe', tono: '' };
  }

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
      if (filtro === 'extra' && !tieneExtra(r)) return false;
      return true;
    });
  }

  // ---------- piezas visuales ----------
  const nota = (texto) => `<span class="hr-note">${texto}</span>`;

  function celdaTrabajador(nombre, sub) {
    return `
      <div class="hr-worker">
        <span class="hr-avatar" aria-hidden="true"><i class="fa-solid fa-user"></i></span>
        <div>
          <div class="hr-name">${esc(nombre)}</div>
          <div class="hr-sub">${sub}</div>
        </div>
      </div>`;
  }

  function pill(texto, tipo, conPunto = true) {
    return `<span class="hr-pill hr-pill--${tipo}">${conPunto ? '<span class="hr-dot"></span>' : ''}${texto}</span>`;
  }

  // ---------- listado ----------
  function celdaEstado(r) {
    if (esSinMarca(r)) return pill('Sin marcas', 'bad');
    if (num(r.CantidadMarcas) < 2) return esHoy(r) ? pill('En turno', 'ok') : pill('Sin salida', 'warn');
    if (saleAntes(r)) return pill('Salió antes', 'warn');
    return pill('Asistió', 'ok');
  }

  function marcasTitulo(r) {
    const marcas = [r.Marca1, r.Marca2, r.Marca3, r.Marca4].map(hora).filter(Boolean);
    let t = `Marcas del día: ${marcas.join(', ')}${num(r.CantidadMarcas) > 4 ? '…' : ''}`;
    if (num(r.MarcasManuales) > 0) t += ' (incluye marcas manuales)';
    return esc(t);
  }

  function celdaEntrada(r) {
    if (esSinMarca(r)) return nota('Sin marca');
    const clase = esTarde(r) ? 'late' : (hora(r.HoraEntradaProgramada) ? 'ok' : '');
    return `<span class="hr-time ${clase}" title="${marcasTitulo(r)}">${esc(hora(r.PrimeraMarca || r.Marca1))}</span>`;
  }

  function celdaSalida(r) {
    if (esSinMarca(r)) return nota('Sin marca');
    if (num(r.CantidadMarcas) < 2) return nota(esHoy(r) ? 'Pendiente' : 'Sin marca');
    const clase = saleAntes(r) ? 'late' : '';
    const extra = minutosExtra(r);
    const sub = saleAntes(r)
      ? `<div class="hr-sub">${minutosTexto(r.MinutosSalidaAntes)} antes</div>`
      : extra ? `<div class="hr-sub hr-txt-ok">+${minutosTexto(extra)} extra</div>` : '';
    return `<span class="hr-time ${clase}" title="${marcasTitulo(r)}">${esc(hora(r.UltimaMarca))}</span>${sub}`;
  }

  function celdaTardanza(r) {
    if (esTarde(r)) return pill(minutosTexto(r.MinutosTarde), 'warn', false);
    if (esSinMarca(r)) return nota('No aplica');
    return nota('Puntual');
  }

  function celdaPermiso(r) {
    if (!tienePapeleta(r)) return nota('Sin papeleta');
    const tipo = r.TipoPermiso ? ` · ${esc(r.TipoPermiso)}` : '';
    const detalle = [r.HorarioPermiso, tipoOracion(r.MotivoPermiso)].filter(Boolean).map(esc).join(' · ');
    return `
      <div class="hr-perm" title="${esc(r.MotivoPermiso || '')}">
        <i class="fa-regular fa-file-lines" aria-hidden="true"></i>
        <div>
          <div class="hr-perm__head">N° ${esc(r.NumeroPapeleta)}${tipo} <span class="hr-perm__hours">${numero(r.HorasPermiso, 2)} h</span></div>
          <div class="hr-sub">${detalle}</div>
        </div>
      </div>`;
  }

  function filaDetalle(r) {
    const f = fechaPartes(r.Fecha);
    const entrada = hora(r.HoraEntradaProgramada);
    const salida = hora(r.HoraSalidaProgramada);
    const horario = entrada || salida
      ? `<span class="hr-strong">${esc(entrada || '—')} – ${esc(salida || '—')}</span>`
      : nota('Sin horario');
    const feriado = r.Feriado === 'SI' ? '<div class="hr-sub">Feriado</div>' : '';

    return `
      <tr class="hr-row hr-clickable" data-dni="${esc(r.DNI)}" tabindex="0" title="Ver historial de ${esc(r.Trabajador)}">
        <td data-label="Fecha"><div class="hr-strong">${f.corta}</div><div class="hr-sub">${f.dia}</div></td>
        <td data-label="Trabajador">${celdaTrabajador(r.Trabajador, `${esc(r.DNI)} · ${esc(tipoTitulo(r.Cargo))}`)}</td>
        <td data-label="Horario" class="center">${horario}${feriado}</td>
        <td data-label="Entrada" class="center">${celdaEntrada(r)}</td>
        <td data-label="Salida" class="center">${celdaSalida(r)}</td>
        <td data-label="Estado">${celdaEstado(r)}</td>
        <td data-label="Tardanza" class="center">${celdaTardanza(r)}</td>
        <td data-label="Papeleta">${celdaPermiso(r)}</td>
      </tr>`;
  }

  function renderDetalle(rows) {
    const tbody = $('hrTablaDetalle').querySelector('tbody');
    if (!rows.length) {
      $('hrPager').hidden = true;
      tbody.innerHTML = '<tr><td colspan="8" class="hr-empty"><i class="fa-regular fa-calendar-xmark"></i>No hay registros para este filtro.</td></tr>';
      return;
    }
    tbody.innerHTML = paginar(rows).map(filaDetalle).join('');
  }

  // ---------- paginacion ----------
  function paginar(lista) {
    const paginas = Math.max(1, Math.ceil(lista.length / state.porPagina));
    state.pagina = Math.min(Math.max(1, state.pagina), paginas);
    const inicio = (state.pagina - 1) * state.porPagina;
    renderPager(lista.length, paginas, inicio);
    return lista.slice(inicio, inicio + state.porPagina);
  }

  function renderPager(total, paginas, inicio) {
    $('hrPager').hidden = total === 0;
    const fin = Math.min(total, inicio + state.porPagina);
    $('hrPagerInfo').textContent = `Mostrando ${numero(inicio + 1)}–${numero(fin)} de ${numero(total)}`;

    const actual = state.pagina;
    const nums = new Set([1, paginas, actual - 1, actual, actual + 1].filter((n) => n >= 1 && n <= paginas));
    const orden = [...nums].sort((a, b) => a - b);
    let html = `<button type="button" class="hr-page" data-p="${actual - 1}" ${actual === 1 ? 'disabled' : ''} aria-label="Página anterior"><i class="fa-solid fa-chevron-left"></i></button>`;
    orden.forEach((n, i) => {
      if (i > 0 && n - orden[i - 1] > 1) html += '<span class="hr-page-gap">…</span>';
      html += `<button type="button" class="hr-page ${n === actual ? 'active' : ''}" data-p="${n}" ${n === actual ? 'aria-current="page"' : ''}>${n}</button>`;
    });
    html += `<button type="button" class="hr-page" data-p="${actual + 1}" ${actual === paginas ? 'disabled' : ''} aria-label="Página siguiente"><i class="fa-solid fa-chevron-right"></i></button>`;
    $('hrPagerPages').innerHTML = html;
  }

  // ---------- resumen por trabajador ----------
  function resumir(rows) {
    const map = new Map();
    rows.forEach((r) => {
      if (!map.has(r.DNI)) {
        map.set(r.DNI, {
          Trabajador: r.Trabajador, DNI: r.DNI, Cargo: r.Cargo,
          conMarca: 0, sinMarca: 0, diasTarde: 0, minTarde: 0, salidas: 0, minSalidas: 0,
          diasExtra: 0, minExtra: 0, papeletas: 0, horas: 0,
          debeTarde: 0, debeSalidas: 0, justificado: 0
        });
      }
      const s = map.get(r.DNI);
      if (esSinMarca(r)) s.sinMarca += 1; else s.conMarca += 1;
      const tarde = esTarde(r) ? num(r.MinutosTarde) : 0;
      const antes = saleAntes(r) ? num(r.MinutosSalidaAntes) : 0;
      if (tarde) { s.diasTarde += 1; s.minTarde += tarde; }
      if (antes) { s.salidas += 1; s.minSalidas += antes; }
      // Con papeleta ese dia, la tardanza o la salida temprana estan justificadas: no se cobran.
      if (tienePapeleta(r)) s.justificado += tarde + antes;
      else { s.debeTarde += tarde; s.debeSalidas += antes; }
      const extra = minutosExtra(r);
      if (extra) { s.diasExtra += 1; s.minExtra += extra; }
      s.papeletas += num(r.CantidadPapeletas);
      s.horas += num(r.HorasPermiso);
    });
    const lista = [...map.values()];
    lista.forEach((s) => {
      s.asistencia = s.conMarca / Math.max(1, s.conMarca + s.sinMarca);
      // Saldo final: positivo = la empresa le debe; negativo = el trabajador debe.
      s.balance = s.minExtra - s.debeTarde - s.debeSalidas;
    });

    const { campo, dir } = state.orden;
    const signo = dir === 'asc' ? 1 : -1;
    lista.sort((a, b) => {
      if (campo === 'Trabajador') return signo * String(a.Trabajador).localeCompare(String(b.Trabajador), 'es');
      return signo * (a[campo] - b[campo]) || String(a.Trabajador).localeCompare(String(b.Trabajador), 'es');
    });
    return lista;
  }

  // Valor principal con su unidad + una linea de detalle debajo.
  function bloque(principal, detalle, tono = '') {
    return `<div class="hr-stat ${tono}"><div class="hr-stat__main">${principal}</div>${detalle ? `<div class="hr-sub">${detalle}</div>` : ''}</div>`;
  }

  function renderResumen(rows) {
    const tbody = $('hrTablaResumen').querySelector('tbody');
    const resumen = resumir(rows);
    document.querySelectorAll('#hrTablaResumen th.sortable').forEach((th) => {
      th.classList.toggle('sort-asc', th.dataset.orden === state.orden.campo && state.orden.dir === 'asc');
      th.classList.toggle('sort-desc', th.dataset.orden === state.orden.campo && state.orden.dir === 'desc');
    });
    if (!resumen.length) {
      $('hrPager').hidden = true;
      tbody.innerHTML = '<tr><td colspan="7" class="hr-empty"><i class="fa-regular fa-user"></i>No hay registros para este filtro.</td></tr>';
      return;
    }
    tbody.innerHTML = paginar(resumen).map((s) => {
      const b = bloquesResumen(s);
      return `
        <tr class="hr-row hr-clickable" data-dni="${esc(s.DNI)}" tabindex="0" title="Ver historial de ${esc(s.Trabajador)}">
          <td data-label="Trabajador">${celdaTrabajador(s.Trabajador, `${esc(s.DNI)} · ${esc(tipoTitulo(s.Cargo))}`)}</td>
          <td data-label="Asistencia">${b.asistencia}</td>
          <td data-label="Tardanzas">${b.tardanzas}</td>
          <td data-label="Salidas antes de hora">${b.salidas}</td>
          <td data-label="Saldo de horas">${b.balance}</td>
          <td data-label="Papeletas">${b.papeletas}</td>
          <td class="hr-col-action"><span class="hr-link">Ver detalle <i class="fa-solid fa-chevron-right"></i></span></td>
        </tr>`;
    }).join('');
  }

  function bloquesResumen(s) {
    const total = s.conMarca + s.sinMarca;
    const sinRegistros = bloque(nota('Sin registros'), '');
    return {
      asistencia: bloque(
        `${numero(s.conMarca)} de ${plural(total, 'día', 'días')}`,
        s.sinMarca ? `${plural(s.sinMarca, 'día', 'días')} sin marcar` : 'Marcó todos los días',
        s.sinMarca ? 'is-bad' : ''
      ),
      tardanzas: !s.conMarca ? sinRegistros : s.diasTarde
        ? bloque(plural(s.diasTarde, 'día tarde', 'días tarde'), `${minutosTexto(s.minTarde)} en total`, 'is-warn')
        : bloque(nota('Siempre puntual'), ''),
      salidas: !s.conMarca ? sinRegistros : s.salidas
        ? bloque(plural(s.salidas, 'vez', 'veces'), `${minutosTexto(s.minSalidas)} antes de hora`)
        : bloque(nota('Ninguna'), ''),
      extra: !s.conMarca ? sinRegistros : s.diasExtra
        ? bloque(`+${minutosTexto(s.minExtra)}`, `en ${plural(s.diasExtra, 'día', 'días')}`, 'is-ok')
        : bloque(nota('Sin tiempo extra'), ''),
      balance: !s.conMarca ? sinRegistros : (() => {
        const bt = balanceTexto(s.balance);
        return bloque(bt.texto, bt.detalle, bt.tono);
      })(),
      papeletas: s.papeletas
        ? bloque(plural(s.papeletas, 'papeleta', 'papeletas'), `${numero(s.horas, 2)} h de permiso`)
        : bloque(nota('Sin papeletas'), '')
    };
  }

  // Un solo recuadro: quien debe a quien y como se llego a ese numero.
  function consolidadoHtml(s) {
    const bt = balanceTexto(s.balance);
    const linea = [
      `<span class="hr-calc__item">Tiempo extra <b class="hr-txt-ok">+${minutosTexto(s.minExtra)}</b></span>`,
      `<span class="hr-calc__item">Tardanzas <b class="${s.debeTarde ? 'hr-txt-bad' : ''}">−${minutosTexto(s.debeTarde)}</b></span>`,
      `<span class="hr-calc__item">Salidas antes <b class="${s.debeSalidas ? 'hr-txt-bad' : ''}">−${minutosTexto(s.debeSalidas)}</b></span>`
    ].join('<span class="hr-calc__op">·</span>');
    const justificado = s.justificado
      ? `<div class="hr-sub">No se cobran ${minutosTexto(s.justificado)} de tardanzas o salidas porque tenía papeleta ese día.</div>`
      : '';
    const total = s.conMarca + s.sinMarca;
    return `
      <div class="hr-saldo ${bt.tono}">
        <div class="hr-saldo__label">Saldo de horas del periodo</div>
        <div class="hr-saldo__main">${bt.texto}</div>
        <div class="hr-saldo__sub">${bt.detalle}</div>
        <div class="hr-calc">${linea}</div>
        ${justificado}
        <div class="hr-sub">Asistencia: ${numero(s.conMarca)} de ${plural(total, 'día', 'días')}${s.sinMarca ? ` (${plural(s.sinMarca, 'día', 'días')} sin marcar)` : ''} · ${s.papeletas ? `${plural(s.papeletas, 'papeleta', 'papeletas')} (${numero(s.horas, 2)} h)` : 'sin papeletas'}</div>
      </div>`;
  }

  // ---------- historial de un trabajador (panel lateral) ----------
  function detalleDia(r) {
    const partes = [];
    if (esSinMarca(r)) partes.push('<span class="hr-txt-bad">No marcó</span>');
    else if (num(r.CantidadMarcas) < 2 && !esHoy(r)) partes.push('<span class="hr-txt-warn">No marcó salida</span>');
    const just = tienePapeleta(r) ? ' <span class="hr-note">(justificado con papeleta)</span>' : '';
    if (esTarde(r)) partes.push(`<span class="hr-txt-warn">Llegó ${minutosTexto(r.MinutosTarde)} tarde</span>${just}`);
    if (saleAntes(r)) partes.push(`<span class="hr-txt-warn">Salió ${minutosTexto(r.MinutosSalidaAntes)} antes</span>${just}`);
    const extra = minutosExtra(r);
    if (extra) partes.push(`<span class="hr-txt-ok">Se quedó ${minutosTexto(extra)} más (tiempo extra)</span>`);
    if (tienePapeleta(r)) {
      const motivo = tipoOracion(r.MotivoPermiso);
      partes.push(`<span><i class="fa-regular fa-file-lines"></i> N° ${esc(r.NumeroPapeleta)} · ${esc(r.TipoPermiso || 'Papeleta')} · ${esc(r.HorarioPermiso)} (${numero(r.HorasPermiso, 2)} h)${motivo ? ` · ${esc(motivo)}` : ''}</span>`);
    }
    if (!partes.length) partes.push(nota(esHoy(r) && num(r.CantidadMarcas) < 2 ? 'En turno' : 'Sin novedades'));
    return partes.join('<br>');
  }

  function renderPanel() {
    const dni = state.panel.dni;
    if (!dni) return;
    const dias = state.rows.filter((r) => r.DNI === dni);
    if (!dias.length) { cerrarPanel(); return; }
    const r0 = dias[0];
    const s = resumir(dias)[0];
    const b = bloquesResumen(s);

    $('hrDrawerNombre').textContent = r0.Trabajador;
    $('hrDrawerSub').textContent = `${r0.DNI} · ${tipoTitulo(r0.Cargo)}`;
    const d = fechaPartes($('hrDesde').value);
    const h = fechaPartes($('hrHasta').value);
    $('hrDrawerPeriodo').textContent = `Periodo del ${d.corta} al ${h.corta}`;
    $('hrDrawerStats').innerHTML = consolidadoHtml(s);

    const f = state.panel.filtro;
    const cuenta = {
      '': dias.length,
      tarde: dias.filter(esTarde).length,
      sinmarca: dias.filter(esSinMarca).length,
      salida: dias.filter(saleAntes).length,
      extra: dias.filter(tieneExtra).length,
      papeleta: dias.filter(tienePapeleta).length
    };
    document.querySelectorAll('#hrDrawerFiltros .hr-chip').forEach((c) => {
      c.classList.toggle('active', c.dataset.f === f);
      c.innerHTML = `${esc(c.dataset.label)} <b>${cuenta[c.dataset.f] ?? 0}</b>`;
    });

    const lista = dias.filter((r) => {
      if (f === 'tarde') return esTarde(r);
      if (f === 'sinmarca') return esSinMarca(r);
      if (f === 'salida') return saleAntes(r);
      if (f === 'extra') return tieneExtra(r);
      if (f === 'papeleta') return tienePapeleta(r);
      return true;
    });

    $('hrDrawerTabla').innerHTML = lista.length ? lista.map((r) => {
      const fp = fechaPartes(r.Fecha);
      const ent = hora(r.HoraEntradaProgramada);
      const sal = hora(r.HoraSalidaProgramada);
      return `
        <tr>
          <td><div class="hr-strong">${fp.corta}</div><div class="hr-sub">${fp.dia}</div></td>
          <td class="center">${ent || sal ? `${esc(ent)} – ${esc(sal)}` : nota('Sin horario')}</td>
          <td class="center">${celdaEntrada(r)}</td>
          <td class="center">${celdaSalida(r)}</td>
          <td class="hr-detalle">${detalleDia(r)}</td>
        </tr>`;
    }).join('') : `<tr><td colspan="5" class="hr-empty">No hay días con este filtro.</td></tr>`;
  }

  function abrirPanel(dni) {
    state.panel = { dni, filtro: '' };
    $('hrDrawer').hidden = false;
    $('hrDrawerOverlay').hidden = false;
    document.body.classList.add('hr-no-scroll');
    renderPanel();
    $('hrDrawerCerrar').focus();
  }

  function cerrarPanel() {
    state.panel.dni = null;
    $('hrDrawer').hidden = true;
    $('hrDrawerOverlay').hidden = true;
    document.body.classList.remove('hr-no-scroll');
  }

  // ---------- render general ----------
  function render() {
    const rows = filasFiltradas();
    const trabajadores = new Set(rows.map((r) => r.DNI)).size;
    if (state.vista === 'detalle') {
      renderDetalle(rows);
      $('hrResumenTexto').textContent = `${plural(trabajadores, 'trabajador', 'trabajadores')} · ${plural(rows.length, 'registro', 'registros')}`;
    } else {
      renderResumen(rows);
      $('hrResumenTexto').textContent = plural(trabajadores, 'trabajador', 'trabajadores');
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

  // ---------- tiempo real ----------
  function pintarEstadoVivo(error) {
    const el = $('hrActualizado');
    if (!el) return;
    if (error) {
      el.innerHTML = '<span class="hr-live hr-live--off"></span>Sin conexión, reintentando';
      return;
    }
    if (!state.ultimaCarga) { el.textContent = ''; return; }
    const seg = Math.round((Date.now() - state.ultimaCarga) / 1000);
    const hace = seg < 10 ? 'ahora' : seg < 60 ? `hace ${seg} s` : `hace ${Math.floor(seg / 60)} min`;
    el.innerHTML = `<span class="hr-live"></span>En vivo · actualizado ${hace}`;
  }

  // silencioso = refresco automatico: no muestra "Cargando" ni mueve la pagina.
  async function cargar(silencioso = false) {
    if (state.cargando) return;
    const desde = $('hrDesde').value;
    const hasta = $('hrHasta').value;
    if (!desde || !hasta) return;

    state.cargando = true;
    if (!silencioso) {
      state.pagina = 1;
      $('btnHrActualizar').disabled = true;
      mostrarMensaje('<i class="fa-solid fa-spinner fa-spin"></i>Cargando horarios…');
    }
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
      state.ultimaCarga = Date.now();
      llenarAreas();
      render();
      renderPanel();
      pintarEstadoVivo(false);
    } catch (error) {
      if (silencioso) {
        pintarEstadoVivo(true);
      } else {
        state.rows = [];
        mostrarMensaje(`<i class="fa-solid fa-triangle-exclamation"></i>${esc(error?.message || 'No se pudo cargar el horario')}`);
      }
    } finally {
      state.cargando = false;
      $('btnHrActualizar').disabled = false;
    }
  }

  function iniciarTiempoReal() {
    setInterval(() => {
      if (document.visibilityState === 'visible') cargar(true);
    }, REFRESCO_MS);
    setInterval(() => pintarEstadoVivo(false), 15 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && state.ultimaCarga && Date.now() - state.ultimaCarga > REFRESCO_MS) {
        cargar(true);
      }
    });
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

    let buscarTimer = null;
    const reRender = () => { state.pagina = 1; render(); };

    $('btnHrActualizar').addEventListener('click', () => cargar(false));
    $('hrDesde').addEventListener('change', () => cargar(false));
    $('hrHasta').addEventListener('change', () => cargar(false));
    $('hrBuscar').addEventListener('input', () => { clearTimeout(buscarTimer); buscarTimer = setTimeout(reRender, 150); });
    $('hrArea').addEventListener('change', reRender);
    $('hrFiltro').addEventListener('change', reRender);

    document.querySelectorAll('.hr-tab').forEach((b) => b.addEventListener('click', () => cambiarVista(b.dataset.vista)));

    document.querySelectorAll('#hrTablaResumen th.sortable').forEach((th) => th.addEventListener('click', () => {
      const campo = th.dataset.orden;
      if (state.orden.campo === campo) state.orden.dir = state.orden.dir === 'asc' ? 'desc' : 'asc';
      else state.orden = { campo, dir: campo === 'Trabajador' ? 'asc' : 'desc' };
      reRender();
    }));

    // Paginacion
    $('hrPagerPages').addEventListener('click', (e) => {
      const btn = e.target.closest('.hr-page');
      if (!btn || btn.disabled) return;
      state.pagina = Number(btn.dataset.p) || 1;
      render();
      document.querySelector('.hr-tabsbar').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('hrPorPagina').addEventListener('change', (e) => {
      state.porPagina = Number(e.target.value) || 10;
      reRender();
    });

    // Abrir historial al hacer clic (o Enter) en una fila
    const abrirDesdeFila = (e) => {
      const fila = e.target.closest('tr.hr-clickable');
      if (fila) abrirPanel(fila.dataset.dni);
    };
    ['hrTablaDetalle', 'hrTablaResumen'].forEach((id) => {
      $(id).addEventListener('click', abrirDesdeFila);
      $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') abrirDesdeFila(e); });
    });

    $('hrDrawerCerrar').addEventListener('click', cerrarPanel);
    $('hrDrawerOverlay').addEventListener('click', cerrarPanel);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.panel.dni) cerrarPanel(); });
    $('hrDrawerFiltros').addEventListener('click', (e) => {
      const chip = e.target.closest('.hr-chip');
      if (!chip) return;
      state.panel.filtro = chip.dataset.f;
      renderPanel();
    });

    cargar(false);
    iniciarTiempoReal();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
