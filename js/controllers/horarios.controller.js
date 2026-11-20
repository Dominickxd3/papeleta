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
  // Vacaciones: registradas en SIGA o en una papeleta con rango de vacaciones.
  // Un dia de vacaciones no cuenta como falta, tardanza, salida ni tiempo extra.
  const esVacaciones = (r) => r.Vacaciones === 'SI';
  const esTarde = (r) => !esVacaciones(r) && num(r.MinutosTarde) > 0;
  // Ajuste manual (ADMIN / RRHH): falta justificada no cuenta como "sin marcas".
  const faltaJustificada = (r) => !esVacaciones(r) && r.SinMarcas === 'SI' && !!(r.Ajuste && r.Ajuste.NoContarFalta);
  const esSinMarca = (r) => !esVacaciones(r) && r.SinMarcas === 'SI' && !faltaJustificada(r);
  const tienePapeleta = (r) => num(r.CantidadPapeletas) > 0;
  const saleAntes = (r) => !esVacaciones(r) && num(r.MinutosSalidaAntes) > 0 && num(r.CantidadMarcas) > 1;

  const aMinutos = (hhmm) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(hora(hhmm));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };

  // Tiempo extra: minutos que se quedo despues de su hora de salida programada.
  function minutosExtra(r) {
    if (esVacaciones(r) || num(r.CantidadMarcas) < 2) return 0;
    if (r.Ajuste && r.Ajuste.NoContarExtra) return 0;
    const ultima = aMinutos(r.UltimaMarca);
    const salida = aMinutos(r.HoraSalidaProgramada);
    const entrada = aMinutos(r.HoraEntradaProgramada);
    if (ultima === null || salida === null) return 0;
    if (entrada !== null && salida <= entrada) return 0; // turnos que cruzan medianoche: no se calcula
    return Math.max(0, ultima - salida);
  }
  const tieneExtra = (r) => minutosExtra(r) > 0;

  // ---------- control de papeletas contra las marcas ----------
  // Minutos fuera del permiso que se perdonan (0 = sin tolerancia).
  const TOLERANCIA_PAPELETA = 0;
  const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const fueraTol = (min) => (min > TOLERANCIA_PAPELETA ? min : 0);

  function tramosPapeleta(r) {
    return String(r.TramosPermiso || '').split(';').map((t) => {
      const [a, b] = t.split('-');
      return { s: aMinutos(a), r: aMinutos(b) };
    }).filter((t) => t.s !== null);
  }

  // Devuelve cuanto se debe ese dia (tardanza, salida y permisos con retorno)
  // y notas que explican como se cumplio cada papeleta.
  function evaluarDia(r) {
    const tarde = esTarde(r) ? num(r.MinutosTarde) : 0;
    const antes = saleAntes(r) ? num(r.MinutosSalidaAntes) : 0;
    const ev = { tarde: tarde, salida: antes, permiso: 0, justificado: 0, notas: [] };
    if (!tienePapeleta(r) || esSinMarca(r) || esVacaciones(r)) return ev;

    const E = aMinutos(r.HoraEntradaProgramada);
    const S = aMinutos(r.HoraSalidaProgramada);
    const P = aMinutos(r.PrimeraMarca || r.Marca1);
    const U = num(r.CantidadMarcas) > 1 ? aMinutos(r.UltimaMarca) : null;
    const marcas = [r.Marca1, r.Marca2, r.Marca3, r.Marca4, r.Marca5, r.Marca6, r.Marca7, r.Marca8]
      .map(aMinutos).filter((m) => m !== null);
    const intermedias = marcas.slice(1, U !== null ? -1 : undefined);

    tramosPapeleta(r).forEach((t) => {
      const desde = E !== null && t.s <= E;
      const finTurno = t.r === null || (S !== null && t.r >= S);

      if (desde && finTurno) { // permiso de todo el dia
        ev.tarde = 0; ev.salida = 0;
        ev.notas.push({ ok: true, txt: `Permiso de todo el día (${hhmm(t.s)} a fin de turno)` });
      } else if (desde) { // permiso de entrada: puede llegar hasta t.r
        if (tarde) {
          ev.tarde = fueraTol(Math.max(0, P - Math.max(E, t.r)));
          ev.notas.push(ev.tarde
            ? { ok: false, txt: `Permiso hasta ${hhmm(t.r)}, pero entró ${hhmm(P)}: ${minutosTexto(ev.tarde)} después del permiso` }
            : { ok: true, txt: `Tardanza cubierta (permiso hasta ${hhmm(t.r)}, entró ${hhmm(P)})` });
        }
      } else if (finTurno) { // permiso de salida hasta fin de turno
        if (S !== null && t.s >= S) { // despues del turno: no cubre nada del horario
          ev.notas.push({ ok: false, txt: `Papeleta desde ${hhmm(t.s)}: es después de su salida (${hhmm(S)}), no cubre su horario` });
          return;
        }
        if (U === null) {
          if (!esHoy(r)) ev.notas.push({ ok: false, txt: `Permiso desde ${hhmm(t.s)}, pero no marcó su salida` });
          return;
        }
        if (U < t.s) {
          ev.salida = fueraTol(t.s - U);
          ev.notas.push(ev.salida
            ? { ok: false, txt: `Permiso desde ${hhmm(t.s)}, pero salió ${hhmm(U)}: ${minutosTexto(ev.salida)} antes de lo autorizado` }
            : { ok: true, txt: `Salió ${hhmm(U)} con permiso desde ${hhmm(t.s)}` });
        } else {
          ev.salida = 0;
          ev.notas.push({ ok: true, txt: `Salió ${hhmm(U)} con permiso desde ${hhmm(t.s)}` });
        }
      } else { // permiso con salida y retorno en medio del turno
        const candidatas = intermedias.filter((m) => m >= t.s - 60 && m <= t.r);
        if (!candidatas.length) {
          ev.notas.push({ ok: false, txt: `Permiso ${hhmm(t.s)} a ${hhmm(t.r)}: no marcó la salida ni el regreso` });
          return;
        }
        const out = candidatas.reduce((a, b) => (Math.abs(b - t.s) < Math.abs(a - t.s) ? b : a));
        const ret = marcas.find((m) => m > out);
        const salioAntes = fueraTol(Math.max(0, t.s - out));
        const volvioTarde = ret !== undefined ? fueraTol(Math.max(0, ret - t.r)) : 0;
        ev.permiso += salioAntes + volvioTarde;
        if (ret === undefined) {
          ev.notas.push({ ok: false, txt: `Permiso ${hhmm(t.s)} a ${hhmm(t.r)}: salió ${hhmm(out)} y no marcó el regreso` });
        } else if (salioAntes || volvioTarde) {
          const partes = [];
          if (salioAntes) partes.push(`salió ${minutosTexto(salioAntes)} antes`);
          if (volvioTarde) partes.push(`regresó ${minutosTexto(volvioTarde)} tarde`);
          ev.notas.push({ ok: false, txt: `Permiso ${hhmm(t.s)} a ${hhmm(t.r)}: marcó ${hhmm(out)} y ${hhmm(ret)} (${partes.join(', ')})` });
        } else {
          ev.notas.push({ ok: true, txt: `Permiso ${hhmm(t.s)} a ${hhmm(t.r)} cumplido (marcó ${hhmm(out)} y ${hhmm(ret)})` });
        }
      }
    });

    ev.justificado = Math.max(0, (tarde + antes) - (ev.tarde + ev.salida));
    return ev;
  }

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
      if (filtro === 'vacaciones' && !esVacaciones(r)) return false;
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
    if (esVacaciones(r)) return pill('Vacaciones', 'vac');
    if (faltaJustificada(r)) return pill('Justificado', 'vac');
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
    if (esVacaciones(r) && !num(r.CantidadMarcas)) return nota('Vacaciones');
    if (faltaJustificada(r)) return nota('Justificado');
    if (esSinMarca(r)) return nota('Sin marca');
    const clase = esTarde(r) ? 'late' : (hora(r.HoraEntradaProgramada) ? 'ok' : '');
    return `<span class="hr-time ${clase}" title="${marcasTitulo(r)}">${esc(hora(r.PrimeraMarca || r.Marca1))}</span>`;
  }

  function celdaSalida(r) {
    if (esVacaciones(r) && num(r.CantidadMarcas) < 2) return nota('Vacaciones');
    if (faltaJustificada(r)) return nota('Justificado');
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
    if (esSinMarca(r) || esVacaciones(r)) return nota('No aplica');
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
      if (esVacaciones(r)) s.vacaciones = (s.vacaciones || 0) + 1;
      else if (faltaJustificada(r)) s.faltasJustificadas = (s.faltasJustificadas || 0) + 1;
      else if (esSinMarca(r)) s.sinMarca += 1;
      else s.conMarca += 1;
      const tarde = esTarde(r) ? num(r.MinutosTarde) : 0;
      const antes = saleAntes(r) ? num(r.MinutosSalidaAntes) : 0;
      if (tarde) { s.diasTarde += 1; s.minTarde += tarde; }
      if (antes) { s.salidas += 1; s.minSalidas += antes; }
      // Con papeleta ese dia, la tardanza o la salida temprana estan justificadas: no se cobran.
      // La papeleta solo justifica el rango que autoriza; lo que queda fuera se cobra.
      const ev = evaluarDia(r);
      s.justificado += ev.justificado;
      s.debeTarde += ev.tarde;
      s.debeSalidas += ev.salida + ev.permiso;
      if (ev.tarde) s.diasDebeTarde = (s.diasDebeTarde || 0) + 1;
      if (ev.salida + ev.permiso) s.diasDebeSalida = (s.diasDebeSalida || 0) + 1;
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
      asistencia: !total && s.vacaciones
        ? bloque(nota('De vacaciones'), plural(s.vacaciones, 'día', 'días'))
        : bloque(
          `${numero(s.conMarca)} de ${plural(total, 'día', 'días')}`,
          [s.sinMarca ? `${plural(s.sinMarca, 'día', 'días')} sin marcar` : 'Marcó todos los días',
            s.vacaciones ? `${plural(s.vacaciones, 'día', 'días')} de vacaciones` : '',
            s.faltasJustificadas ? `${plural(s.faltasJustificadas, 'falta justificada', 'faltas justificadas')}` : ''].filter(Boolean).join(' · '),
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
    const enContra = s.debeTarde + s.debeSalidas;
    const total = s.conMarca + s.sinMarca;

    const detContra = [];
    if (s.debeTarde) detContra.push(`Tardanzas ${minutosTexto(s.debeTarde)} (${plural(s.diasDebeTarde || 0, 'día', 'días')})`);
    if (s.debeSalidas) detContra.push(`Salidas antes ${minutosTexto(s.debeSalidas)} (${plural(s.diasDebeSalida || 0, 'día', 'días')})`);

    let saldoTitulo; let saldoValor; let saldoTexto; let tono;
    if (s.balance > 0) {
      tono = 'ok'; saldoTitulo = 'Se le debe'; saldoValor = minutosTexto(s.balance);
      saldoTexto = 'Trabajó más de lo que debe. La empresa le debe este tiempo.';
    } else if (s.balance < 0) {
      tono = 'bad'; saldoTitulo = 'Le falta'; saldoValor = minutosTexto(-s.balance);
      saldoTexto = 'Sus tardanzas o salidas superan su tiempo extra. Debe este tiempo.';
    } else {
      tono = 'neutral'; saldoTitulo = 'Saldo'; saldoValor = '0 min';
      saldoTexto = 'Lo que debía quedó cubierto con su tiempo extra.';
    }

    const justificado = s.justificado
      ? `<p class="hr-cuenta__nota"><i class="fa-regular fa-file-lines"></i> No se descuentan ${minutosTexto(s.justificado)} porque tenía papeleta esos días.</p>`
      : '';

    return `
      <div class="hr-cuenta">
        <div class="hr-cuenta__box">
          <span class="hr-cuenta__label">Tiempo a favor</span>
          <strong class="hr-cuenta__num is-ok">${minutosTexto(s.minExtra)}</strong>
          <span class="hr-cuenta__det">${s.diasExtra ? `Se quedó después de hora ${plural(s.diasExtra, 'día', 'días')}` : 'No tuvo tiempo extra'}</span>
        </div>
        <span class="hr-cuenta__op" aria-hidden="true">−</span>
        <div class="hr-cuenta__box">
          <span class="hr-cuenta__label">Tiempo en contra</span>
          <strong class="hr-cuenta__num ${enContra ? 'is-bad' : ''}">${minutosTexto(enContra)}</strong>
          <span class="hr-cuenta__det">${detContra.length ? detContra.join(' · ') : 'Sin tardanzas ni salidas antes'}</span>
        </div>
        <span class="hr-cuenta__op" aria-hidden="true">=</span>
        <div class="hr-cuenta__box hr-cuenta__box--saldo is-${tono}">
          <span class="hr-cuenta__label">${saldoTitulo}</span>
          <strong class="hr-cuenta__num">${saldoValor}</strong>
          <span class="hr-cuenta__det">${saldoTexto}</span>
        </div>
      </div>
      ${justificado}
      <p class="hr-cuenta__pie">Asistencia ${numero(s.conMarca)} de ${plural(total, 'día', 'días')}${s.sinMarca ? ` · ${plural(s.sinMarca, 'día', 'días')} sin marcar` : ''}${s.vacaciones ? ` · ${plural(s.vacaciones, 'día', 'días')} de vacaciones (no cuentan)` : ''}${s.faltasJustificadas ? ` · ${plural(s.faltasJustificadas, 'falta justificada', 'faltas justificadas')}` : ''} · ${s.papeletas ? `${plural(s.papeletas, 'papeleta', 'papeletas')} (${numero(s.horas, 2)} h)` : 'Sin papeletas'}</p>`;
  }

  // ---------- historial de un trabajador (panel lateral) ----------
  function detalleDia(r) {
    const partes = [];
    if (esVacaciones(r)) {
      partes.push('<span class="hr-txt-vac"><i class="fa-solid fa-umbrella-beach"></i> De vacaciones</span>');
      if (num(r.CantidadMarcas)) partes.push(`<span class="hr-txt-warn">Marcó estando de vacaciones (${plural(num(r.CantidadMarcas), 'marca', 'marcas')})</span>`);
      return partes.join('<br>');
    }
    if (esSinMarca(r)) partes.push('<span class="hr-txt-bad">No marcó</span>');
    else if (num(r.CantidadMarcas) < 2 && !esHoy(r) && !faltaJustificada(r)) partes.push('<span class="hr-txt-warn">No marcó salida</span>');
    const ev = evaluarDia(r);
    if (!tienePapeleta(r)) {
      if (esTarde(r)) partes.push(`<span class="hr-txt-warn">Llegó ${minutosTexto(r.MinutosTarde)} tarde</span>`);
      if (saleAntes(r)) partes.push(`<span class="hr-txt-warn">Salió ${minutosTexto(r.MinutosSalidaAntes)} antes</span>`);
    } else {
      // Con papeleta: lo que no cubre el permiso se muestra aparte
      if (ev.tarde && !ev.notas.some((n) => !n.ok && /entró/.test(n.txt))) {
        partes.push(`<span class="hr-txt-warn">Llegó ${minutosTexto(ev.tarde)} tarde</span>`);
      }
      if (ev.salida && !ev.notas.some((n) => !n.ok && /salió .* antes de lo autorizado/.test(n.txt))) {
        partes.push(`<span class="hr-txt-warn">Salió ${minutosTexto(ev.salida)} antes</span>`);
      }
      ev.notas.forEach((n) => partes.push(n.ok
        ? `<span class="hr-txt-ok"><i class="fa-solid fa-check"></i> ${esc(n.txt)}</span>`
        : `<span class="hr-txt-bad"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(n.txt)}</span>`));
    }
    const extra = minutosExtra(r);
    if (extra) partes.push(`<span class="hr-txt-ok">Se quedó ${minutosTexto(extra)} más (tiempo extra)</span>`);
    if (tienePapeleta(r)) {
      const motivo = tipoOracion(r.MotivoPermiso);
      partes.push(`<span><i class="fa-regular fa-file-lines"></i> N° ${esc(r.NumeroPapeleta)} · ${esc(r.TipoPermiso || 'Papeleta')} · ${esc(r.HorarioPermiso)} (${numero(r.HorasPermiso, 2)} h)${motivo ? ` · ${esc(motivo)}` : ''}</span>`);
    }
    if (faltaJustificada(r)) partes.unshift('<span class="hr-txt-vac">Falta justificada</span>');
    if (!partes.length) partes.push(nota(esHoy(r) && num(r.CantidadMarcas) < 2 ? 'En turno' : 'Sin novedades'));
    if (r.Ajuste) partes.push(notaAjuste(r.Ajuste));
    return partes.join('<br>');
  }

  // ---------- reporte Excel ----------
  const EXCELJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';

  function cargarExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = EXCELJS_URL;
      s.onload = () => (window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('No se pudo cargar ExcelJS')));
      s.onerror = () => reject(new Error('No se pudo cargar la librería de Excel. Revisa tu conexión.'));
      document.head.appendChild(s);
    });
  }

  function estadoTexto(r) {
    if (esVacaciones(r)) return 'Vacaciones';
    if (faltaJustificada(r)) return 'Falta justificada';
    if (esSinMarca(r)) return 'Sin marcas';
    if (num(r.CantidadMarcas) < 2) return esHoy(r) ? 'En turno' : 'Sin salida';
    if (saleAntes(r)) return 'Salió antes';
    return 'Asistió';
  }

  function saldoTexto(min) {
    if (min > 0) return `Se le debe ${minutosTexto(min)}`;
    if (min < 0) return `Le falta ${minutosTexto(-min)}`;
    return 'Sin saldo';
  }

  function estilarHoja(ws) {
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    head.alignment = { vertical: 'middle', wrapText: true };
    head.height = 32;
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  }

  async function exportarExcel() {
    const rows = filasFiltradas();
    if (!rows.length) { alert('No hay datos para exportar con los filtros actuales.'); return; }
    const btn = $('btnHrExportar');
    btn.disabled = true;
    try {
      const ExcelJS = await cargarExcelJS();
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Sistema de Papeletas GP';
      wb.created = new Date();
      const desde = fechaPartes($('hrDesde').value).corta;
      const hasta = fechaPartes($('hrHasta').value).corta;

      // Hoja 1: resumen por trabajador
      const areaDe = new Map(rows.map((r) => [r.DNI, r.AreaERP || '']));
      const lista = resumir(rows).sort((a, b) => String(a.Trabajador).localeCompare(String(b.Trabajador), 'es'));
      const ws1 = wb.addWorksheet('Resumen');
      ws1.columns = [
        { header: 'Trabajador', key: 'trab', width: 36 },
        { header: 'DNI', key: 'dni', width: 11 },
        { header: 'Cargo', key: 'cargo', width: 30 },
        { header: 'Área', key: 'area', width: 32 },
        { header: 'Días trabajados', key: 'dias', width: 11 },
        { header: 'Días sin marcar', key: 'sin', width: 11 },
        { header: 'Faltas justificadas', key: 'fj', width: 12 },
        { header: 'Días de vacaciones', key: 'vac', width: 12 },
        { header: 'Días con tardanza', key: 'dt', width: 11 },
        { header: 'Tardanza a descontar (min)', key: 'mt', width: 14 },
        { header: 'Días con salida antes', key: 'ds', width: 11 },
        { header: 'Salida antes a descontar (min)', key: 'ms', width: 14 },
        { header: 'Tiempo extra (min)', key: 'ex', width: 12 },
        { header: 'Justificado con papeleta (min)', key: 'ju', width: 14 },
        { header: 'Saldo (min)', key: 'saldo', width: 11 },
        { header: 'Saldo', key: 'saldoTxt', width: 24 },
        { header: 'Papeletas', key: 'pap', width: 10 },
        { header: 'Horas de permiso', key: 'hp', width: 11 }
      ];
      lista.forEach((s) => {
        const row = ws1.addRow({
          trab: s.Trabajador, dni: s.DNI, cargo: tipoTitulo(s.Cargo), area: areaDe.get(s.DNI),
          dias: s.conMarca, sin: s.sinMarca, fj: s.faltasJustificadas || 0, vac: s.vacaciones || 0,
          dt: s.diasTarde, mt: s.debeTarde, ds: s.salidas, ms: s.debeSalidas,
          ex: s.minExtra, ju: s.justificado, saldo: s.balance, saldoTxt: saldoTexto(s.balance),
          pap: s.papeletas, hp: Number(s.horas.toFixed(2))
        });
        const c = row.getCell('saldoTxt');
        c.font = { bold: true, color: { argb: s.balance > 0 ? 'FF15803D' : s.balance < 0 ? 'FFDC2626' : 'FF334155' } };
      });
      estilarHoja(ws1);

      // Hoja 2: detalle por dia
      const ws2 = wb.addWorksheet('Detalle');
      ws2.columns = [
        { header: 'Fecha', key: 'fecha', width: 11 },
        { header: 'Día', key: 'dia', width: 10 },
        { header: 'Trabajador', key: 'trab', width: 36 },
        { header: 'DNI', key: 'dni', width: 11 },
        { header: 'Cargo', key: 'cargo', width: 28 },
        { header: 'Área', key: 'area', width: 30 },
        { header: 'Horario', key: 'horario', width: 14 },
        { header: 'Entrada', key: 'ent', width: 9 },
        { header: 'Salida', key: 'sal', width: 9 },
        { header: 'Marcas del día', key: 'marcas', width: 30 },
        { header: 'Estado', key: 'estado', width: 16 },
        { header: 'Tardanza (min)', key: 'mt', width: 10 },
        { header: 'Salida antes (min)', key: 'ms', width: 10 },
        { header: 'Tiempo extra (min)', key: 'ex', width: 10 },
        { header: 'A descontar (min)', key: 'desc', width: 11 },
        { header: 'Papeleta N°', key: 'np', width: 12 },
        { header: 'Tipo de permiso', key: 'tp', width: 18 },
        { header: 'Horario del permiso', key: 'hp', width: 24 },
        { header: 'Motivo', key: 'motivo', width: 34 },
        { header: 'Horas de permiso', key: 'horas', width: 10 },
        { header: 'Control de papeleta', key: 'control', width: 46 },
        { header: 'Ajuste manual', key: 'ajuste', width: 40 }
      ];
      rows.forEach((r) => {
        const f = fechaPartes(r.Fecha);
        const ev = evaluarDia(r);
        const marcas = [r.Marca1, r.Marca2, r.Marca3, r.Marca4, r.Marca5, r.Marca6, r.Marca7, r.Marca8].map(hora).filter(Boolean);
        const a = r.Ajuste;
        ws2.addRow({
          fecha: f.corta, dia: f.dia, trab: r.Trabajador, dni: r.DNI, cargo: tipoTitulo(r.Cargo), area: r.AreaERP || '',
          horario: hora(r.HoraEntradaProgramada) ? `${hora(r.HoraEntradaProgramada)} - ${hora(r.HoraSalidaProgramada)}` : '',
          ent: esSinMarca(r) ? '' : hora(r.PrimeraMarca || r.Marca1),
          sal: num(r.CantidadMarcas) > 1 ? hora(r.UltimaMarca) : '',
          marcas: marcas.join(', '),
          estado: estadoTexto(r),
          mt: esTarde(r) ? num(r.MinutosTarde) : 0,
          ms: saleAntes(r) ? num(r.MinutosSalidaAntes) : 0,
          ex: minutosExtra(r),
          desc: ev.tarde + ev.salida + ev.permiso,
          np: tienePapeleta(r) ? r.NumeroPapeleta : '',
          tp: tienePapeleta(r) ? r.TipoPermiso : '',
          hp: tienePapeleta(r) ? r.HorarioPermiso : '',
          motivo: tienePapeleta(r) ? tipoOracion(r.MotivoPermiso) : '',
          horas: tienePapeleta(r) ? num(r.HorasPermiso) : '',
          control: ev.notas.map((n) => `${n.ok ? 'OK' : 'REVISAR'}: ${n.txt}`).join(' | '),
          ajuste: a ? `${a.Usuario}: ${a.Motivo}` : ''
        });
      });
      estilarHoja(ws2);

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Horarios_${desde.replace(/\//g, '-')}_al_${hasta.replace(/\//g, '-')}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (error) {
      alert(error?.message || 'No se pudo generar el Excel.');
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- ajustes manuales ----------
  function notaAjuste(a) {
    const que = [];
    if (a.NoContarFalta) que.push('falta');
    if (a.NoContarTardanza) que.push('tardanza');
    if (a.NoContarSalida) que.push('salida antes');
    if (a.NoContarExtra) que.push('tiempo extra');
    const partes = [];
    if (que.length) partes.push(`no cuenta: ${que.join(', ')}`);
    if (a.HoraEntrada || a.HoraSalida) partes.push(`horario corregido ${a.HoraEntrada || '—'} – ${a.HoraSalida || '—'} (era ${a.HorarioOriginal.replace('-', ' – ')})`);
    return `<span class="hr-ajuste" title="${esc(a.Motivo)}"><i class="fa-solid fa-pen"></i> Ajustado por ${esc(a.Usuario)}: ${esc(partes.join(' · '))}<br><em>${esc(a.Motivo)}</em></span>`;
  }

  let ajusteEnEdicion = null;

  function abrirAjuste(dni, fecha) {
    const r = state.rows.find((x) => x.DNI === dni && x.Fecha === fecha);
    if (!r) return;
    ajusteEnEdicion = r;
    const a = r.Ajuste || {};
    const f = fechaPartes(fecha);
    const horario = a.HorarioOriginal || `${hora(r.HoraEntradaProgramada)}-${hora(r.HoraSalidaProgramada)}`;
    const marcas = [r.Marca1, r.Marca2, r.Marca3, r.Marca4, r.Marca5, r.Marca6].map(hora).filter(Boolean);
    $('hrAjTitulo').textContent = r.Ajuste ? 'Editar ajuste' : 'Ajustar día';
    $('hrAjSub').textContent = `${r.Trabajador} · ${f.dia} ${f.corta} · Horario SIGA ${horario.replace('-', ' – ') || 'sin horario'} · Marcas: ${marcas.length ? marcas.join(', ') : 'ninguna'}`;
    $('hrAjFalta').checked = !!a.NoContarFalta;
    $('hrAjTardanza').checked = !!a.NoContarTardanza;
    $('hrAjSalida').checked = !!a.NoContarSalida;
    $('hrAjExtra').checked = !!a.NoContarExtra;
    $('hrAjEntrada').value = a.HoraEntrada || '';
    $('hrAjSalidaHora').value = a.HoraSalida || '';
    $('hrAjMotivo').value = a.Motivo || '';
    $('hrAjQuitar').hidden = !r.Ajuste;
    $('hrAjError').hidden = true;
    $('hrAjModal').hidden = false;
    $('hrAjOverlay').hidden = false;
    $('hrAjMotivo').focus();
  }

  function cerrarAjuste() {
    ajusteEnEdicion = null;
    $('hrAjModal').hidden = true;
    $('hrAjOverlay').hidden = true;
  }

  function errorAjuste(msg) {
    $('hrAjError').textContent = msg;
    $('hrAjError').hidden = false;
  }

  async function guardarAjuste(e) {
    e.preventDefault();
    const r = ajusteEnEdicion;
    if (!r) return;
    const body = {
      dni: r.DNI,
      fecha: r.Fecha,
      noContarFalta: $('hrAjFalta').checked,
      noContarTardanza: $('hrAjTardanza').checked,
      noContarSalida: $('hrAjSalida').checked,
      noContarExtra: $('hrAjExtra').checked,
      horaEntrada: $('hrAjEntrada').value || null,
      horaSalida: $('hrAjSalidaHora').value || null,
      motivo: $('hrAjMotivo').value.trim()
    };
    if (!body.noContarFalta && !body.noContarTardanza && !body.noContarSalida && !body.noContarExtra && !body.horaEntrada && !body.horaSalida) {
      errorAjuste('Elige al menos una opción o corrige el horario.');
      return;
    }
    if (body.motivo.length < 5) {
      errorAjuste('Escribe el motivo del ajuste (mínimo 5 caracteres).');
      $('hrAjMotivo').focus();
      return;
    }
    $('hrAjGuardar').disabled = true;
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/horarios/ajustes`, {
        method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(body)
      });
      await handleResponse(response);
      cerrarAjuste();
      await cargar(true);
    } catch (error) {
      errorAjuste(error?.message || 'No se pudo guardar el ajuste.');
    } finally {
      $('hrAjGuardar').disabled = false;
    }
  }

  async function quitarAjuste() {
    const r = ajusteEnEdicion;
    if (!r || !r.Ajuste) return;
    if (!confirm('¿Quitar este ajuste? El día volverá a calcularse con las marcas y el horario de SIGA.')) return;
    $('hrAjQuitar').disabled = true;
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/horarios/ajustes/${r.Ajuste.IdAjuste}`, {
        method: 'DELETE', headers: getAuthHeaders()
      });
      await handleResponse(response);
      cerrarAjuste();
      await cargar(true);
    } catch (error) {
      errorAjuste(error?.message || 'No se pudo quitar el ajuste.');
    } finally {
      $('hrAjQuitar').disabled = false;
    }
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
      vacaciones: dias.filter(esVacaciones).length,
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
      if (f === 'vacaciones') return esVacaciones(r);
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
          ${state.puedeAjustar ? `<td class="hr-col-action"><button type="button" class="hr-btn hr-btn--sm" data-ajustar="${esc(r.DNI)}|${esc(r.Fecha)}"><i class="fa-solid fa-pen"></i> ${r.Ajuste ? 'Editar' : 'Ajustar'}</button></td>` : ''}
        </tr>`;
    }).join('') : `<tr><td colspan="${state.puedeAjustar ? 6 : 5}" class="hr-empty">No hay días con este filtro.</td></tr>`;
    $('hrDrawerColAccion').hidden = !state.puedeAjustar;
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
    if (state.vista === 'detalle') renderDetalle(rows);
    else renderResumen(rows);
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
      state.puedeAjustar = data?.puedeAjustar === true;
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
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('hrAjModal').hidden) cerrarAjuste();
      else if (state.panel.dni) cerrarPanel();
    });
    $('hrDrawerFiltros').addEventListener('click', (e) => {
      const chip = e.target.closest('.hr-chip');
      if (!chip) return;
      state.panel.filtro = chip.dataset.f;
      renderPanel();
    });

    $('btnHrExportar').addEventListener('click', exportarExcel);

    // Ajustes manuales
    $('hrDrawerTabla').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ajustar]');
      if (!btn) return;
      const [dni, fecha] = btn.dataset.ajustar.split('|');
      abrirAjuste(dni, fecha);
    });
    $('hrAjForm').addEventListener('submit', guardarAjuste);
    $('hrAjCerrar').addEventListener('click', cerrarAjuste);
    $('hrAjCancelar').addEventListener('click', cerrarAjuste);
    $('hrAjOverlay').addEventListener('click', cerrarAjuste);
    $('hrAjQuitar').addEventListener('click', quitarAjuste);
    ['hrAjFalta', 'hrAjTardanza', 'hrAjSalida', 'hrAjExtra', 'hrAjEntrada', 'hrAjSalidaHora', 'hrAjMotivo']
      .forEach((id) => $(id).addEventListener('input', () => { $('hrAjError').hidden = true; }));

    cargar(false);
    iniciarTiempoReal();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
