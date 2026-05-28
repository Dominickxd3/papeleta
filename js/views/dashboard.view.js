let chartDias = null;
let chartEstados = null;
let rangeMode = "all"; // all | hoy | 7d | 30d
let refreshTimer = null;
let papeletasCache = { data: [], ts: 0 };
let trabajadoresCache = { data: [], ts: 0 };
let lastDashboardSnapshot = null;
const PAPELETAS_CACHE_MS = 60000;
const TRABAJADORES_CACHE_MS = 10 * 60000;

const barValueLabelsPlugin = {
  id: "barValueLabelsPlugin",
  afterDatasetsDraw(chart) {
    if (chart.config.type !== "bar") return;
    const { ctx } = chart;
    const dataset = chart.data.datasets?.[0];
    if (!dataset) return;
    const meta = chart.getDatasetMeta(0);
    ctx.save();
    ctx.fillStyle = "#334155";
    ctx.font = "700 11px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    meta.data.forEach((bar, i) => {
      const value = Number(dataset.data[i] || 0);
      if (value <= 0) return;
      ctx.fillText(String(value), bar.x, bar.y - 6);
    });
    ctx.restore();
  }
};

if (typeof Chart !== "undefined") {
  Chart.register(barValueLabelsPlugin);
}

function normalizarRol(rol) {
  return String(rol || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function esRolPrivilegiado(rol) {
  const r = normalizarRol(rol);
  return r === "ADMIN" || r === "RRHH";
}

function verificarAuth() {
  const raw = localStorage.getItem("usuario");
  if (!raw || raw === "undefined" || raw === "null") {
    localStorage.removeItem("usuario");
    localStorage.removeItem("token");
    window.location.href = "../index.html";
    return null;
  }

  try {
    const u = JSON.parse(raw);
    if (!u || typeof u !== "object") throw new Error("Usuario invalido");
    return u;
  } catch {
    localStorage.removeItem("usuario");
    localStorage.removeItem("token");
    window.location.href = "../index.html";
    return null;
  }
}

function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

function escHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setQuickLabels(mode) {
  let pend = "Pendientes totales";
  let aprob = "Aprobadas totales";
  let tiempo = "Tiempo utilizado";

  if (mode === "hoy") {
    pend = "Pendientes hoy";
    aprob = "Aprobadas hoy";
    tiempo = "Tiempo utilizado hoy";
  } else if (mode === "7d") {
    pend = "Pendientes (7 dias)";
    aprob = "Aprobadas (7 dias)";
    tiempo = "Tiempo utilizado (7 dias)";
  } else if (mode === "30d") {
    pend = "Pendientes (30 dias)";
    aprob = "Aprobadas (30 dias)";
    tiempo = "Tiempo utilizado (30 dias)";
  }

  // Prioriza IDs nuevos
  setText("quickPendLabel", pend);
  setText("quickAprobLabel", aprob);
  setText("quickTiempoLabel", tiempo);

  // Fallback: si el HTML viejo no tiene IDs
  const labels = document.querySelectorAll(".quick-strip .quick-pill .label");
  if (labels[0]) labels[0].textContent = pend;
  if (labels[1]) labels[1].textContent = aprob;
  if (labels[2]) labels[2].textContent = tiempo;
}

function fmtDate(d) {
  return d.toLocaleDateString("es-ES", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function fmtDateTime(d) {
  return d.toLocaleString("es-ES", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function localKey(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getFechaPapeleta(p) {
  const v = p?.FechaPermisoPP || p?.FECHA_PERMISO_PP || p?.FechaPermiso;
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getFechaRegistroPapeleta(p) {
  const v = p?.FechaRegistroPP || p?.FechaRegistro || p?.FechaEmisionPP || p?.FechaPermisoPP || p?.FechaPermiso;
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function inInterval(d, start, endExclusive) {
  return d >= start && d < endExclusive;
}

function getRangeInfo(mode) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);

  if (mode === "hoy") {
    return {
      label: "Hoy",
      hint: "Mostrando: Hoy",
      badge: `Rango: ${fmtDate(todayStart)}`,
      start: todayStart,
      end: tomorrowStart,
      compareStart: addDays(todayStart, -1),
      compareEnd: todayStart
    };
  }

  if (mode === "7d") {
    const start = addDays(todayStart, -6);
    return {
      label: "Ultimos 7 dias",
      hint: "Mostrando: Ultimos 7 dias",
      badge: `Rango: ${fmtDate(start)} - ${fmtDate(todayStart)}`,
      start,
      end: tomorrowStart,
      compareStart: addDays(start, -7),
      compareEnd: start
    };
  }

  if (mode === "30d") {
    const start = addDays(todayStart, -29);
    return {
      label: "Ultimos 30 dias",
      hint: "Mostrando: Ultimos 30 dias",
      badge: `Rango: ${fmtDate(start)} - ${fmtDate(todayStart)}`,
      start,
      end: tomorrowStart,
      compareStart: addDays(start, -30),
      compareEnd: start
    };
  }

  const start = addDays(todayStart, -29);
  return {
    label: "Todo",
    hint: "Mostrando: Todo el historial",
    badge: "Rango: Todo",
    start: null,
    end: null,
    compareStart: addDays(start, -30),
    compareEnd: start,
    fallbackCurrentStart: start,
    fallbackCurrentEnd: tomorrowStart
  };
}

function inCurrentRange(d, info) {
  if (!d) return false;
  if (!info.start || !info.end) return true;
  return inInterval(d, info.start, info.end);
}

function toMinutesFromTimeValue(v) {
  if (!v) return 0;
  const s = String(v).trim();
  const m = s.match(/(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return 0;
  return (Number(m[1] || 0) * 60) + Number(m[2] || 0);
}

function formatHoursMinutes(totalMinutes) {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return "0 h";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function renderTrend(id, currentValue, previousValue) {
  const el = document.getElementById(id);
  if (!el) return;

  const prev = Number(previousValue || 0);
  const cur = Number(currentValue || 0);
  const diff = cur - prev;
  el.classList.remove("up", "down", "flat");

  if (prev === 0 && cur === 0) {
    el.classList.add("flat");
    el.textContent = "Sin cambios vs periodo anterior";
    return;
  }

  if (prev === 0) {
    el.classList.add("up");
    el.textContent = `+${cur} vs periodo anterior`;
    return;
  }

  const pct = Math.round((diff / prev) * 100);
  if (diff > 0) {
    el.classList.add("up");
    el.textContent = `+${pct}% vs periodo anterior`;
  } else if (diff < 0) {
    el.classList.add("down");
    el.textContent = `${pct}% vs periodo anterior`;
  } else {
    el.classList.add("flat");
    el.textContent = "Sin cambios vs periodo anterior";
  }
}

function animarContador(id, valorFinal) {
  const el = document.getElementById(id);
  if (!el) return;

  const start = parseInt(el.textContent || "0", 10);
  const end = Number(valorFinal) || 0;
  const dur = 650;
  const t0 = performance.now();

  function step(now) {
    const t = Math.min(1, (now - t0) / dur);
    el.textContent = Math.floor(start + (end - start) * t);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function renderBars(points, titulo) {
  const c = document.getElementById("chartDias");
  if (!c || typeof Chart === "undefined") return;

  chartDias?.destroy();
  chartDias = new Chart(c, {
    type: "bar",
    data: {
      labels: points.map((p) => p.label),
      datasets: [{
        label: titulo,
        data: points.map((p) => p.count),
        backgroundColor: "rgba(59, 130, 246, 0.55)",
        borderColor: "rgba(37, 99, 235, 0.9)",
        borderWidth: 1,
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: {
            font: { size: 12, weight: "600" }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 }
        }
      }
    }
  });
}

function renderEstados(pendientes, aprobadas, otras, total) {
  const c = document.getElementById("chartEstados");
  if (!c || typeof Chart === "undefined") return;

  chartEstados?.destroy();
  chartEstados = new Chart(c, {
    type: "doughnut",
    data: {
      labels: ["Pendientes", "Aprobadas", "Otras"],
      datasets: [{
        data: [pendientes, aprobadas, otras],
        backgroundColor: ["#38bdf8", "#fb5a7d", "#fb9b36"],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "72%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            font: { size: 12, weight: "700" }
          }
        }
      }
    }
  });

  const pct = (n) => total ? Math.round((Number(n || 0) / total) * 100) : 0;
  setText("estadoLegend", `Pendientes: ${pendientes} (${pct(pendientes)}%) | Aprobadas: ${aprobadas} (${pct(aprobadas)}%) | Otras: ${otras} (${pct(otras)}%)`);
}
function timeAgo(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return "Sin fecha";
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return "Hace un momento";
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} d`;
}

function titleCaseLabel(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|\s)(\S)/g, (_, space, letter) => `${space}${letter.toUpperCase()}`);
}

function renderPendientesRevision(papeletas) {
  const el = document.getElementById("listaPendientesRevision");
  if (!el) return;

  const rows = papeletas
    .filter((p) => {
      const estado = String(p.EstadoAprobacion || p.EstadoPP || "PENDIENTE").toUpperCase();
      return String(p.ActivoPP || "1") === "1" && (estado === "PENDIENTE" || estado === "APROBADO_JEFE");
    })
    .sort((a, b) => {
      const da = getFechaRegistroPapeleta(a)?.getTime() || 0;
      const db = getFechaRegistroPapeleta(b)?.getTime() || 0;
      return da - db;
    })
    .slice(0, 8);

  setText("pendingSummary", rows.length ? `${rows.length} solicitud(es) esperando accion` : "Bandeja limpia");

  el.innerHTML = rows.length
    ? rows.map((p) => {
        const id = Number(p.IdPP || 0);
        const tipo = p.ConsiderarPP || p.MotivoPP || "Papeleta";
        const trabajador = p.TrabajadorPP || "Sin trabajador";
        const area = titleCaseLabel(p.AreaPP || "Sin area");
        const ago = timeAgo(p.FechaRegistroPP || p.FechaEmisionPP || p.FechaPermisoPP);
        return `
          <article class="pending-item">
            <div class="pending-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
            <div class="pending-main">
              <strong>${escHtml(tipo)}</strong>
              <span>${escHtml(trabajador)} | ${escHtml(area)} | ${escHtml(ago)}</span>
            </div>
            <a class="pending-action" href="permisos.html?focus=${id}">Revisar</a>
          </article>
        `;
      }).join("")
    : `<div class="pending-empty calm"><i class="fa-solid fa-circle-check"></i><strong>Sin pendientes por revisar</strong><span>No hay papeletas vencidas ni solicitudes esperando accion en este rango.</span></div>`;
}

function renderAreaBars(top) {
  const el = document.getElementById("areaBars");
  if (!el) return;
  const max = Math.max(1, ...top.map((row) => Number(row.total || 0)));

  el.innerHTML = top.length
    ? top.slice(0, 8).map((row) => {
        const pct = Math.max(5, Math.round((Number(row.total || 0) / max) * 100));
        const approvedPct = row.total ? Math.max(row.aprobadas ? 4 : 0, Math.round((row.aprobadas / row.total) * 100)) : 0;
        const pendingPct = row.total ? Math.max(row.pendientes ? 4 : 0, Math.round((row.pendientes / row.total) * 100)) : 0;
        const rejectedPct = row.total ? Math.max(row.rechazadas ? 4 : 0, Math.round((row.rechazadas / row.total) * 100)) : 0;
        const canceledPct = row.total ? Math.max(row.anuladas ? 4 : 0, Math.round((row.anuladas / row.total) * 100)) : 0;
        return `
          <div class="area-bar-row">
            <div class="area-bar-copy">
              <strong>${escHtml(titleCaseLabel(row.area))}</strong>
              <span>${Number(row.aprobadas || 0)} aprobadas / ${Number(row.pendientes || 0)} pendientes / ${Number(row.rechazadas || 0)} devueltas</span>
            </div>
            <div class="area-bar-value">${Number(row.total || 0)}</div>
            <div class="area-bar-track segmented" aria-hidden="true" style="--total-width:${pct}%">
              <span class="seg approved" style="width:${approvedPct}%"></span>
              <span class="seg pending" style="width:${pendingPct}%"></span>
              <span class="seg rejected" style="width:${rejectedPct}%"></span>
              <span class="seg canceled" style="width:${canceledPct}%"></span>
            </div>
          </div>
        `;
      }).join("")
    : `<div class="pending-empty">Sin datos de areas para el rango.</div>`;
}
function buildAreaStats(papeletas) {
  const areas = new Map();
  for (const p of papeletas) {
    const area = String(p.AreaPP || p.Area || "SIN AREA").trim() || "SIN AREA";
    const estado = getEstadoPapeleta(p);
    if (!areas.has(area)) {
      areas.set(area, { area, total: 0, aprobadas: 0, pendientes: 0, rechazadas: 0, anuladas: 0 });
    }
    const item = areas.get(area);
    item.total += 1;
    if (estado === "APROBADO_RRHH" || estado === "APROBADO_JEFE") item.aprobadas += 1;
    else if (estado === "RECHAZADO") item.rechazadas += 1;
    else if (estado === "ANULADO") item.anuladas += 1;
    else item.pendientes += 1;
  }
  return Array.from(areas.values()).sort((a, b) => b.total - a.total).slice(0, 10);
}

function getEstadoPapeleta(p) {
  const activo = String(p?.ActivoPP || "1");
  if (activo === "2") return "ANULADO";
  return String(p?.EstadoAprobacion || p?.EstadoPP || "PENDIENTE").toUpperCase();
}

function estadoUi(estado) {
  if (estado === "APROBADO_RRHH" || estado === "APROBADO_JEFE") {
    return { label: "Aprobado", cls: "aprobado" };
  }
  if (estado === "RECHAZADO") return { label: "Rechazado", cls: "rechazado" };
  if (estado === "ANULADO") return { label: "Anulado", cls: "anulado" };
  return { label: "Pendiente", cls: "pendiente" };
}

function initialsFromName(name) {
  const parts = String(name || "US").trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "U";
  const second = parts.length > 1 ? parts[1][0] : (parts[0]?.[1] || "S");
  return `${first}${second}`.toUpperCase();
}

function buildRankingUsuarios(papeletas) {
  const map = new Map();

  for (const p of papeletas) {
    const nombre = String(p.TrabajadorPP || p.UsuarioCreador || p.Usuario || "SIN USUARIO").trim() || "SIN USUARIO";
    const key = nombre.toUpperCase();
    const fecha = getFechaRegistroPapeleta(p)?.getTime() || 0;
    const area = String(p.AreaPP || p.Area || "SIN AREA").trim() || "SIN AREA";

    if (!map.has(key)) {
      map.set(key, {
        nombre,
        cantidad: 0,
        area,
        areas: {},
        aprobadas: 0,
        pendientes: 0,
        rechazadas: 0,
        ultimoEstado: getEstadoPapeleta(p),
        ultimoFecha: fecha
      });
    }

    const item = map.get(key);
    const estado = getEstadoPapeleta(p);
    item.cantidad += 1;
    item.areas[area] = (item.areas[area] || 0) + 1;
    if (estado === "APROBADO_RRHH" || estado === "APROBADO_JEFE") item.aprobadas += 1;
    else if (estado === "RECHAZADO") item.rechazadas += 1;
    else item.pendientes += 1;
    if (fecha >= item.ultimoFecha) {
      item.ultimoFecha = fecha;
      item.ultimoEstado = estado;
    }
  }

  return Array.from(map.values())
    .map((item) => ({
      ...item,
      area: Object.entries(item.areas).sort((a, b) => b[1] - a[1])[0]?.[0] || item.area
    }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 10);
}

function renderRankingUsuarios(topUsuarios) {
  const tbodyUsuarios = document.querySelector("#tablaUsuarios tbody");
  if (!tbodyUsuarios) return;

  tbodyUsuarios.innerHTML = topUsuarios.length
    ? topUsuarios.map((row) => {
        const estado = estadoUi(row.ultimoEstado);
        return `
          <tr>
            <td>
              <div class="user-cell">
                <span class="user-avatar-mini">${escHtml(initialsFromName(row.nombre))}</span>
                <span>
                  <strong>${escHtml(titleCaseLabel(row.nombre))}</strong>
                  <small>${Number(row.aprobadas || 0)} aprob. / ${Number(row.pendientes || 0)} pend. / ${Number(row.rechazadas || 0)} dev.</small>
                </span>
              </div>
            </td>
            <td><span class="area-pill">${escHtml(titleCaseLabel(row.area))}</span></td>
            <td><b>${Number(row.cantidad || 0)}</b></td>
            <td><span class="status-pill ${estado.cls}">${estado.label}</span></td>
            <td class="row-go"><a href="permisos.html"><i class="fa-solid fa-chevron-right"></i></a></td>
          </tr>
        `;
      }).join("")
    : `<tr><td colspan="5">Sin datos para el rango.</td></tr>`;
}

function renderAttention(papeletas) {
  const text = document.getElementById("attentionText");
  const box = document.getElementById("attentionBox");
  if (!text) return;

  const now = Date.now();
  const pendientes = papeletas.filter((p) => {
    const estado = getEstadoPapeleta(p);
    return String(p.ActivoPP || "1") === "1" && (estado === "PENDIENTE" || estado === "APROBADO_JEFE");
  });
  const vencidas = pendientes.filter((p) => {
    const fecha = getFechaRegistroPapeleta(p);
    return fecha && ((now - fecha.getTime()) / 3600000) >= 48;
  });

  box?.classList.toggle("ok", vencidas.length === 0 && pendientes.length === 0);
  box?.classList.toggle("warn", vencidas.length > 0 || pendientes.length > 0);

  if (vencidas.length) {
    const areas = {};
    for (const p of vencidas) {
      const area = String(p.AreaPP || p.Area || "SIN AREA").trim() || "SIN AREA";
      areas[area] = (areas[area] || 0) + 1;
    }
    const [area, cantidad] = Object.entries(areas).sort((a, b) => b[1] - a[1])[0];
    setText("attentionTitle", "Bandeja RRHH");
    setText("summaryStatus", `${vencidas.length} papeleta(s) vencidas`);
    text.textContent = `El foco esta en ${titleCaseLabel(area)}: ${cantidad} solicitud(es) superan las 48 horas sin revision.`;
    return;
  }

  if (pendientes.length) {
    setText("attentionTitle", "Bandeja RRHH");
    setText("summaryStatus", `${pendientes.length} papeleta(s) requieren revision`);
    text.textContent = "Prioriza la lista accionable para cerrar las solicitudes en espera.";
    return;
  }

  setText("attentionTitle", "Bandeja RRHH");
  setText("summaryStatus", "Bandeja limpia");
  text.textContent = "No hay papeletas vencidas ni solicitudes esperando accion en este rango.";
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => {
    const value = String(cell ?? "");
    return `"${value.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportDashboard() {
  if (!lastDashboardSnapshot) return;
  const s = lastDashboardSnapshot;
  const rows = [
    ["Metrica", "Valor"],
    ["Rango", s.rango],
    ["Total papeletas", s.total],
    ["Pendientes", s.pendientes],
    ["Aprobadas", s.aprobadas],
    ["Hoy", s.hoy],
    ["Pendientes RRHH", s.pendientesRRHH],
    ["Rechazadas", s.rechazadas],
    ["Anuladas", s.anuladas],
    ["Trabajadores activos", s.trabajadores],
    [],
    ["Top areas", "Cantidad"],
    ...s.topAreas.map((row) => [row.area || "SIN AREA", row.total || 0]),
    [],
    ["Top usuarios", "Cantidad"],
    ...s.topUsuarios.map((u) => [u.nombre || u.usuario || "SIN USUARIO", u.cantidad || 0])
  ];
  downloadCsv(`dashboard_papeletas_${localKey(new Date())}.csv`, rows);
}

async function cargarInfoUsuario() {
  const u = verificarAuth();
  if (!u) return;

  const nombre = u.nombre || u.NombreCompleto || u.Usuario || "Usuario";
  const rol = u.rol || u.Rol || "ROL";
  const ultimoRaw = u.ultimoAcceso || u.UltimoAcceso;
  const ultimoDate = ultimoRaw ? new Date(ultimoRaw) : null;
  const ultimoValido = !!(ultimoDate && !Number.isNaN(ultimoDate.getTime()));

  setText("userName", nombre);
  setText("userRole", rol);
  setText("sbUserName", nombre);
  setText("sbUserRole", rol);
  setText("currentDate", fmtDate(new Date()));
  setText("lastAccess", ultimoValido ? fmtDateTime(ultimoDate) : fmtDateTime(new Date()));
}

async function cargarDatos(force = false) {
  const t0 = Date.now();
  try {
    const info = getRangeInfo(rangeMode);
    const usuarioActual = verificarAuth();
    if (!usuarioActual) return;

    const rolActual = usuarioActual.rol || usuarioActual.Rol;
    const isPrivilegiado = esRolPrivilegiado(rolActual);
    const idUsuarioActual = Number(usuarioActual.id ?? usuarioActual.IdUsuario ?? usuarioActual.ID ?? 0) || 0;

    const now = Date.now();
    const needPapeletas = force || (now - papeletasCache.ts) > PAPELETAS_CACHE_MS;
    const needTrabajadores = force || (now - trabajadoresCache.ts) > TRABAJADORES_CACHE_MS;

    if (needPapeletas) {
      const rawPapeletas = window.PapeletaPermisoAPI
        ? await PapeletaPermisoAPI.listar()
        : await fetch(`${API_CONFIG.baseURL}/papeletas/listar`).then((r) => r.json());
      papeletasCache = { data: rawPapeletas, ts: now };
    }

    if (needTrabajadores) {
      const rawTrabajadores = window.TrabajadoresAPI
        ? await TrabajadoresAPI.listar()
        : await fetch(`${API_CONFIG.baseURL}/trabajadores/listar`).then((r) => r.json());
      trabajadoresCache = { data: rawTrabajadores, ts: now };
    }

    const papeletas = papeletasCache.data;
    const trabajadores = trabajadoresCache.data;

    const all = Array.isArray(papeletas) ? papeletas : [];
    const trab = Array.isArray(trabajadores) ? trabajadores : [];
    const visibles = isPrivilegiado ? all : all.filter((p) => Number(p?.IdUsuarioCreador || 0) === idUsuarioActual);

    const filtered = visibles.filter((p) => inCurrentRange(getFechaPapeleta(p), info));
    const total = filtered.length;
    const pendientes = filtered.filter((p) => String(p.EstadoAprobacion || p.EstadoPP || "PENDIENTE") === "PENDIENTE").length;
    const aprobadas = filtered.filter((p) => String(p.EstadoAprobacion || p.EstadoPP || "") === "APROBADO_RRHH").length;
    const otras = Math.max(0, total - pendientes - aprobadas);
    const hoy = visibles.filter((p) => {
      const d = getFechaRegistroPapeleta(p);
      return d && localKey(d) === localKey(new Date());
    }).length;
    const pendientesRRHH = filtered.filter((p) => {
      const estado = String(p.EstadoAprobacion || p.EstadoPP || "PENDIENTE").toUpperCase();
      return estado === "PENDIENTE" || estado === "APROBADO_JEFE";
    }).length;
    const rechazadas = filtered.filter((p) => String(p.ActivoPP || "1") === "1" && String(p.EstadoAprobacion || p.EstadoPP || "").toUpperCase() === "RECHAZADO").length;
    const anuladas = filtered.filter((p) => String(p.ActivoPP || "1") === "2").length;
    animarContador("statTotal", total);
    animarContador("statPendientes", pendientes);
    animarContador("statAprobadas", aprobadas);
    animarContador("statTrabajadores", trab.length);
    animarContador("statHoy", hoy);
    animarContador("statPendientesRRHH", pendientesRRHH);
    animarContador("statRechazadas", rechazadas);
    animarContador("statAnuladas", anuladas);
    renderEstados(pendientes, aprobadas, otras, total);

    // Tendencias: compara periodo actual vs periodo previo equivalente.
    const prevSource = rangeMode === "all"
      ? visibles.filter((p) => {
          const d = getFechaPapeleta(p);
          if (!d) return false;
          return inInterval(d, info.compareStart, info.compareEnd);
        })
      : visibles.filter((p) => {
          const d = getFechaPapeleta(p);
          if (!d) return false;
          return inInterval(d, info.compareStart, info.compareEnd);
        });
    const currSource = rangeMode === "all"
      ? visibles.filter((p) => {
          const d = getFechaPapeleta(p);
          if (!d) return false;
          return inInterval(d, info.fallbackCurrentStart, info.fallbackCurrentEnd);
        })
      : filtered;

    const prevTotal = prevSource.length;
    const prevPend = prevSource.filter((p) => String(p.EstadoAprobacion || p.EstadoPP || "PENDIENTE") === "PENDIENTE").length;
    const prevAprob = prevSource.filter((p) => String(p.EstadoAprobacion || p.EstadoPP || "") === "APROBADO_RRHH").length;
    const currPend = currSource.filter((p) => String(p.EstadoAprobacion || p.EstadoPP || "PENDIENTE") === "PENDIENTE").length;
    const currAprob = currSource.filter((p) => String(p.EstadoAprobacion || p.EstadoPP || "") === "APROBADO_RRHH").length;
    const prevRech = prevSource.filter((p) => String(p.ActivoPP || "1") === "1" && String(p.EstadoAprobacion || p.EstadoPP || "").toUpperCase() === "RECHAZADO").length;
    const prevAnul = prevSource.filter((p) => String(p.ActivoPP || "1") === "2").length;
    const currRech = currSource.filter((p) => String(p.ActivoPP || "1") === "1" && String(p.EstadoAprobacion || p.EstadoPP || "").toUpperCase() === "RECHAZADO").length;
    const currAnul = currSource.filter((p) => String(p.ActivoPP || "1") === "2").length;
    const prevPendRRHH = prevSource.filter((p) => {
      const estado = String(p.EstadoAprobacion || p.EstadoPP || "PENDIENTE").toUpperCase();
      return estado === "PENDIENTE" || estado === "APROBADO_JEFE";
    }).length;
    const currPendRRHH = currSource.filter((p) => {
      const estado = String(p.EstadoAprobacion || p.EstadoPP || "PENDIENTE").toUpperCase();
      return estado === "PENDIENTE" || estado === "APROBADO_JEFE";
    }).length;

    renderTrend("statTotalTrend", currSource.length, prevTotal);
    renderTrend("statPendientesTrend", currPend, prevPend);
    renderTrend("statAprobadasTrend", currAprob, prevAprob);
    renderTrend("statTrabajadoresTrend", trab.length, trab.length);
    renderTrend("statHoyTrend", hoy, 0);
    renderTrend("statPendientesRRHHTrend", currPendRRHH, prevPendRRHH);
    renderTrend("statRechazadasTrend", currRech, prevRech);
    renderTrend("statAnuladasTrend", currAnul, prevAnul);

    // Quick metrics (dependen del rango activo)
    const pendientesRango = filtered.filter((p) => String(p.EstadoAprobacion || p.EstadoPP || "PENDIENTE") === "PENDIENTE").length;
    const aprobadasRango = filtered.filter((p) => String(p.EstadoAprobacion || p.EstadoPP || "") === "APROBADO_RRHH").length;
    const minutosTotal = filtered.reduce((acc, p) => acc + toMinutesFromTimeValue(p.TiempoPP), 0);
    const minutosProm = filtered.length ? Math.round(minutosTotal / filtered.length) : 0;

    setQuickLabels(rangeMode);

    setText("quickPendHoy", pendientesRango);
    setText("quickAprobHoy", aprobadasRango);
    setText("quickTiempo", formatHoursMinutes(minutosTotal));
    setText("quickTiempoSub", `Promedio: ${formatHoursMinutes(minutosProm)}`);

    const days = rangeMode === "30d" ? 30 : 7;
    const base = startOfDay(new Date());
    const buckets = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = addDays(base, -i);
      buckets.push({
        key: localKey(d),
        label: d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }),
        count: 0
      });
    }

    for (const p of visibles) {
      const d = getFechaPapeleta(p);
      if (!d) continue;
      if (rangeMode !== "all" && !inCurrentRange(d, info)) continue;
      const bucket = buckets.find((x) => x.key === localKey(d));
      if (bucket) bucket.count++;
    }

    const titulo = rangeMode === "30d" ? "Papeletas (ultimos 30 dias)" : "Papeletas (ultimos 7 dias)";
    setText("tituloBarras", titulo);
    renderBars(buckets, titulo);

    const top = buildAreaStats(filtered);
    renderPendientesRevision(filtered);
    renderAreaBars(top);

    const tbody = document.querySelector("#tablaAreas tbody");
    if (tbody) {
      tbody.innerHTML = top.length
        ? top.map((row) => `<tr><td>${escHtml(row.area)}</td><td style="text-align:right;"><b>${row.total}</b></td></tr>`).join("")
        : `<tr><td colspan="2">Sin datos para el rango.</td></tr>`;
    }

    const topUsuarios = buildRankingUsuarios(filtered);
    renderRankingUsuarios(topUsuarios);
    renderAttention(filtered);

    lastDashboardSnapshot = {
      rango: info.label,
      total,
      pendientes,
      aprobadas,
      hoy,
      pendientesRRHH,
      rechazadas,
      anuladas,
      trabajadores: trab.length,
      topAreas: top,
      topUsuarios
    };

    const ms = Date.now() - t0;
    setText("lastUpdate", `Actualizado ${new Date().toLocaleTimeString("es-ES")} (${ms} ms)`);
    setText("rangeBadge", info.badge);
  } catch (e) {
    console.error("Dashboard error:", e);
    setText("lastUpdate", "Error al cargar datos (ver consola).");
  }
}

function setRange(mode) {
  rangeMode = mode;
  document.getElementById("chipAll")?.classList.toggle("active", mode === "all");
  document.getElementById("chipHoy")?.classList.toggle("active", mode === "hoy");
  document.getElementById("chip7d")?.classList.toggle("active", mode === "7d");
  document.getElementById("chip30d")?.classList.toggle("active", mode === "30d");

  const info = getRangeInfo(mode);
  setText("hintRange", info.hint);
  setText("rangeBadge", info.badge);
  setQuickLabels(mode);
  cargarDatos(true);
}

function init() {
  cargarInfoUsuario();
  document.getElementById("chipAll")?.addEventListener("click", () => setRange("all"));
  document.getElementById("chipHoy")?.addEventListener("click", () => setRange("hoy"));
  document.getElementById("chip7d")?.addEventListener("click", () => setRange("7d"));
  document.getElementById("chip30d")?.addEventListener("click", () => setRange("30d"));
  document.getElementById("btnExportDashboard")?.addEventListener("click", exportDashboard);

  // Refrescar cuando el usuario vuelve al dashboard.
  window.addEventListener("focus", () => cargarDatos(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") cargarDatos(true);
  });

  setRange("all");
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => cargarDatos(false), 60000);
}

window.addEventListener("DOMContentLoaded", init);





