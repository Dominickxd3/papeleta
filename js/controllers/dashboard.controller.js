// ==========================================
// DASHBOARD CONTROLLER - Orquestación del módulo
// ==========================================
// Sin fetch() directo: usa PapeletaPermisoAPI/TrabajadoresAPI,
// DashboardService (lógica) y DashboardView (render).

class DashboardController {
  static rangeMode = "all"; // all | hoy | 7d | 30d
  static refreshTimer = null;
  static papeletasCache = { data: [], ts: 0 };
  static trabajadoresCache = { data: [], ts: 0 };
  static lastDashboardSnapshot = null;
  static PAPELETAS_CACHE_MS = 60000;
  static TRABAJADORES_CACHE_MS = 10 * 60000;

  static _usuarioActual() {
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

  static async cargarInfoUsuario() {
    const u = this._usuarioActual();
    if (!u) return;

    const nombre = u.nombre || u.NombreCompleto || u.Usuario || "Usuario";
    const rol = u.rol || u.Rol || "ROL";
    const ultimoRaw = u.ultimoAcceso || u.UltimoAcceso;
    const ultimoDate = ultimoRaw ? new Date(ultimoRaw) : null;
    const ultimoValido = !!(ultimoDate && !Number.isNaN(ultimoDate.getTime()));

    DashboardView.setText("userName", nombre);
    DashboardView.setText("userRole", rol);
    DashboardView.setText("sbUserName", nombre);
    DashboardView.setText("sbUserRole", rol);
    DashboardView.setText("currentDate", formatearFecha(new Date()));
    DashboardView.setText("lastAccess", ultimoValido ? fmtDateTime(ultimoDate) : fmtDateTime(new Date()));
  }

  static async cargarDatos(force = false) {
    const t0 = Date.now();
    try {
      const info = DashboardService.getRangeInfo(this.rangeMode);
      const usuarioActual = this._usuarioActual();
      if (!usuarioActual) return;

      const rolActual = usuarioActual.rol || usuarioActual.Rol;
      const isPrivilegiado = DashboardService.esRolPrivilegiado(rolActual);
      const idUsuarioActual = Number(usuarioActual.id ?? usuarioActual.IdUsuario ?? usuarioActual.ID ?? 0) || 0;

      const now = Date.now();
      const needPapeletas = force || (now - this.papeletasCache.ts) > this.PAPELETAS_CACHE_MS;
      const needTrabajadores = force || (now - this.trabajadoresCache.ts) > this.TRABAJADORES_CACHE_MS;

      if (needPapeletas) {
        const rawPapeletas = await PapeletaPermisoAPI.listar();
        this.papeletasCache = { data: rawPapeletas, ts: now };
      }

      if (needTrabajadores) {
        const rawTrabajadores = await TrabajadoresAPI.listar();
        this.trabajadoresCache = { data: rawTrabajadores, ts: now };
      }

      const papeletas = this.papeletasCache.data;
      const trabajadores = this.trabajadoresCache.data;

      const all = Array.isArray(papeletas) ? papeletas : [];
      const trab = Array.isArray(trabajadores) ? trabajadores : [];
      const visibles = isPrivilegiado ? all : all.filter((p) => Number(p?.IdUsuarioCreador || 0) === idUsuarioActual);

      const filtered = visibles.filter((p) => DashboardService.inCurrentRange(DashboardService.getFechaPapeleta(p), info));
      const total = filtered.length;
      const pendientes = filtered.filter((p) => String(p.EstadoAprobacion || p.EstadoPP || "PENDIENTE") === "PENDIENTE").length;
      const aprobadas = filtered.filter((p) => String(p.EstadoAprobacion || p.EstadoPP || "") === "APROBADO_RRHH").length;
      const otras = Math.max(0, total - pendientes - aprobadas);
      const hoy = visibles.filter((p) => {
        const d = DashboardService.getFechaRegistroPapeleta(p);
        return d && DashboardService.localKey(d) === DashboardService.localKey(new Date());
      }).length;
      const pendientesRRHH = filtered.filter((p) => {
        const estado = String(p.EstadoAprobacion || p.EstadoPP || "PENDIENTE").toUpperCase();
        return estado === "PENDIENTE" || estado === "APROBADO_JEFE";
      }).length;
      const rechazadas = filtered.filter((p) => String(p.ActivoPP || "1") === "1" && String(p.EstadoAprobacion || p.EstadoPP || "").toUpperCase() === "RECHAZADO").length;
      const anuladas = filtered.filter((p) => String(p.ActivoPP || "1") === "2").length;
      DashboardView.animarContador("statTotal", total);
      DashboardView.animarContador("statPendientes", pendientes);
      DashboardView.animarContador("statAprobadas", aprobadas);
      DashboardView.animarContador("statTrabajadores", trab.length);
      DashboardView.animarContador("statHoy", hoy);
      DashboardView.animarContador("statPendientesRRHH", pendientesRRHH);
      DashboardView.animarContador("statRechazadas", rechazadas);
      DashboardView.animarContador("statAnuladas", anuladas);
      DashboardView.renderEstados(pendientes, aprobadas, otras, total);

      // Tendencias: compara periodo actual vs periodo previo equivalente.
      const prevSource = visibles.filter((p) => {
        const d = DashboardService.getFechaPapeleta(p);
        if (!d) return false;
        return DashboardService.inInterval(d, info.compareStart, info.compareEnd);
      });
      const currSource = this.rangeMode === "all"
        ? visibles.filter((p) => {
            const d = DashboardService.getFechaPapeleta(p);
            if (!d) return false;
            return DashboardService.inInterval(d, info.fallbackCurrentStart, info.fallbackCurrentEnd);
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

      DashboardView.renderTrend("statTotalTrend", currSource.length, prevTotal);
      DashboardView.renderTrend("statPendientesTrend", currPend, prevPend);
      DashboardView.renderTrend("statAprobadasTrend", currAprob, prevAprob);
      DashboardView.renderTrend("statTrabajadoresTrend", trab.length, trab.length);
      DashboardView.renderTrend("statHoyTrend", hoy, 0);
      DashboardView.renderTrend("statPendientesRRHHTrend", currPendRRHH, prevPendRRHH);
      DashboardView.renderTrend("statRechazadasTrend", currRech, prevRech);
      DashboardView.renderTrend("statAnuladasTrend", currAnul, prevAnul);

      // Quick metrics (dependen del rango activo)
      const pendientesRango = filtered.filter((p) => String(p.EstadoAprobacion || p.EstadoPP || "PENDIENTE") === "PENDIENTE").length;
      const aprobadasRango = filtered.filter((p) => String(p.EstadoAprobacion || p.EstadoPP || "") === "APROBADO_RRHH").length;
      const minutosTotal = filtered.reduce((acc, p) => acc + DashboardService.toMinutesFromTimeValue(p.TiempoPP), 0);
      const minutosProm = filtered.length ? Math.round(minutosTotal / filtered.length) : 0;

      DashboardView.setQuickLabels(this.rangeMode);

      DashboardView.setText("quickPendHoy", pendientesRango);
      DashboardView.setText("quickAprobHoy", aprobadasRango);
      DashboardView.setText("quickTiempo", formatHoursMinutes(minutosTotal));
      DashboardView.setText("quickTiempoSub", `Promedio: ${formatHoursMinutes(minutosProm)}`);

      const days = this.rangeMode === "30d" ? 30 : 7;
      const base = DashboardService.startOfDay(new Date());
      const buckets = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = DashboardService.addDays(base, -i);
        buckets.push({
          key: DashboardService.localKey(d),
          label: d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }),
          count: 0
        });
      }

      for (const p of visibles) {
        const d = DashboardService.getFechaPapeleta(p);
        if (!d) continue;
        if (this.rangeMode !== "all" && !DashboardService.inCurrentRange(d, info)) continue;
        const bucket = buckets.find((x) => x.key === DashboardService.localKey(d));
        if (bucket) bucket.count++;
      }

      const titulo = this.rangeMode === "30d" ? "Papeletas (ultimos 30 dias)" : "Papeletas (ultimos 7 dias)";
      DashboardView.setText("tituloBarras", titulo);
      DashboardView.renderBars(buckets, titulo);

      const top = DashboardService.buildAreaStats(filtered);
      DashboardView.renderPendientesRevision(filtered);
      DashboardView.renderAreaBars(top);
      DashboardView.renderTablaAreas(top);

      const topUsuarios = DashboardService.buildRankingUsuarios(filtered);
      DashboardView.renderRankingUsuarios(topUsuarios);
      DashboardView.renderAttention(filtered);

      this.lastDashboardSnapshot = {
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
      DashboardView.setText("lastUpdate", `Actualizado ${new Date().toLocaleTimeString("es-ES")} (${ms} ms)`);
      DashboardView.setText("rangeBadge", info.badge);
    } catch (e) {
      console.error("Dashboard error:", e);
      DashboardView.setText("lastUpdate", "Error al cargar datos (ver consola).");
    }
  }

  static setRango(mode) {
    this.rangeMode = mode;
    document.getElementById("chipAll")?.classList.toggle("active", mode === "all");
    document.getElementById("chipHoy")?.classList.toggle("active", mode === "hoy");
    document.getElementById("chip7d")?.classList.toggle("active", mode === "7d");
    document.getElementById("chip30d")?.classList.toggle("active", mode === "30d");

    const info = DashboardService.getRangeInfo(mode);
    DashboardView.setText("hintRange", info.hint);
    DashboardView.setText("rangeBadge", info.badge);
    DashboardView.setQuickLabels(mode);
    this.cargarDatos(true);
  }

  static exportarDashboard() {
    if (!this.lastDashboardSnapshot) return;
    const s = this.lastDashboardSnapshot;
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
    DashboardView.downloadCsv(`dashboard_papeletas_${DashboardService.localKey(new Date())}.csv`, rows);
  }

  static inicializar() {
    this.cargarInfoUsuario();
    document.getElementById("chipAll")?.addEventListener("click", () => this.setRango("all"));
    document.getElementById("chipHoy")?.addEventListener("click", () => this.setRango("hoy"));
    document.getElementById("chip7d")?.addEventListener("click", () => this.setRango("7d"));
    document.getElementById("chip30d")?.addEventListener("click", () => this.setRango("30d"));
    document.getElementById("btnExportDashboard")?.addEventListener("click", () => this.exportarDashboard());

    // Refrescar cuando el usuario vuelve al dashboard.
    window.addEventListener("focus", () => this.cargarDatos(true));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.cargarDatos(true);
    });

    this.setRango("all");
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(() => this.cargarDatos(false), 60000);
  }
}

window.DashboardController = DashboardController;
console.log("DashboardController loaded + exposed");
