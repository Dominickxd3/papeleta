// ==========================================
// DASHBOARD VIEW - Solo renderizado (sin fetch, sin lógica de negocio)
// ==========================================
// Depende de: utils/formatters.js, utils/dashboard-formatters.js,
// services/dashboard.service.js y Chart.js (CDN).

let chartDias = null;
let chartEstados = null;

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

class DashboardView {
  static setText(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  }

  static setQuickLabels(mode) {
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
    this.setText("quickPendLabel", pend);
    this.setText("quickAprobLabel", aprob);
    this.setText("quickTiempoLabel", tiempo);

    // Fallback: si el HTML viejo no tiene IDs
    const labels = document.querySelectorAll(".quick-strip .quick-pill .label");
    if (labels[0]) labels[0].textContent = pend;
    if (labels[1]) labels[1].textContent = aprob;
    if (labels[2]) labels[2].textContent = tiempo;
  }

  static renderTrend(id, currentValue, previousValue) {
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

  static animarContador(id, valorFinal) {
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

  static renderBars(points, titulo) {
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

  static renderEstados(pendientes, aprobadas, otras, total) {
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
    this.setText("estadoLegend", `Pendientes: ${pendientes} (${pct(pendientes)}%) | Aprobadas: ${aprobadas} (${pct(aprobadas)}%) | Otras: ${otras} (${pct(otras)}%)`);
  }

  static estadoUi(estado) {
    if (estado === "APROBADO_RRHH" || estado === "APROBADO_JEFE") {
      return { label: "Aprobado", cls: "aprobado" };
    }
    if (estado === "RECHAZADO") return { label: "Rechazado", cls: "rechazado" };
    if (estado === "ANULADO") return { label: "Anulado", cls: "anulado" };
    return { label: "Pendiente", cls: "pendiente" };
  }

  static renderPendientesRevision(papeletas) {
    const el = document.getElementById("listaPendientesRevision");
    if (!el) return;

    const rows = DashboardService.getPendientesRevision(papeletas);

    this.setText("pendingSummary", rows.length ? `${rows.length} solicitud(es) esperando accion` : "Bandeja limpia");

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

  static renderAreaBars(top) {
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

  static renderRankingUsuarios(topUsuarios) {
    const tbodyUsuarios = document.querySelector("#tablaUsuarios tbody");
    if (!tbodyUsuarios) return;

    tbodyUsuarios.innerHTML = topUsuarios.length
      ? topUsuarios.map((row) => {
          const estado = this.estadoUi(row.ultimoEstado);
          return `
          <tr>
            <td>
              <div class="user-cell">
                <span class="user-avatar-mini">${escHtml(obtenerIniciales(row.nombre))}</span>
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

  static renderAttention(papeletas) {
    const text = document.getElementById("attentionText");
    const box = document.getElementById("attentionBox");
    if (!text) return;

    const summary = DashboardService.getAttentionSummary(papeletas);
    const { pendientes, vencidas, area, cantidad } = summary;

    box?.classList.toggle("ok", vencidas.length === 0 && pendientes.length === 0);
    box?.classList.toggle("warn", vencidas.length > 0 || pendientes.length > 0);

    if (vencidas.length) {
      this.setText("attentionTitle", "Bandeja RRHH");
      this.setText("summaryStatus", `${vencidas.length} papeleta(s) vencidas`);
      text.textContent = `El foco esta en ${titleCaseLabel(area)}: ${cantidad} solicitud(es) superan las 48 horas sin revision.`;
      return;
    }

    if (pendientes.length) {
      this.setText("attentionTitle", "Bandeja RRHH");
      this.setText("summaryStatus", `${pendientes.length} papeleta(s) requieren revision`);
      text.textContent = "Prioriza la lista accionable para cerrar las solicitudes en espera.";
      return;
    }

    this.setText("attentionTitle", "Bandeja RRHH");
    this.setText("summaryStatus", "Bandeja limpia");
    text.textContent = "No hay papeletas vencidas ni solicitudes esperando accion en este rango.";
  }

  static renderTablaAreas(top) {
    const tbody = document.querySelector("#tablaAreas tbody");
    if (!tbody) return;

    tbody.innerHTML = top.length
      ? top.map((row) => `<tr><td>${escHtml(row.area)}</td><td class="num"><b>${row.total}</b></td></tr>`).join("")
      : `<tr><td colspan="2">Sin datos para el rango.</td></tr>`;
  }

  static downloadCsv(filename, rows) {
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
}

window.DashboardView = DashboardView;
console.log("DashboardView loaded + exposed");
