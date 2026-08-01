// ==========================================
// DASHBOARD SERVICE - Lógica pura del dashboard
// ==========================================
// Sin fetch(), sin manipulación de DOM. Depende de utils/formatters.js
// (formatearFecha) y de utils/dashboard-formatters.js.
//
// normalizarRol/esRolPrivilegiado se mantienen locales a propósito:
// el comportamiento legado del dashboard es ADMIN/RRHH exactos, distinto
// del normalizeRole/canAccessTrabajadores de sidebar.js.

class DashboardService {
  static normalizarRol(rol) {
    return String(rol || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .trim();
  }

  static esRolPrivilegiado(rol) {
    const r = this.normalizarRol(rol);
    return r === "ADMIN" || r === "RRHH";
  }

  static getFechaPapeleta(p) {
    const v = p?.FechaPermisoPP || p?.FECHA_PERMISO_PP || p?.FechaPermiso;
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  static getFechaRegistroPapeleta(p) {
    const v = p?.FechaRegistroPP || p?.FechaRegistro || p?.FechaEmisionPP || p?.FechaPermisoPP || p?.FechaPermiso;
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  static getEstadoPapeleta(p) {
    const activo = String(p?.ActivoPP || "1");
    if (activo === "2") return "ANULADO";
    return String(p?.EstadoAprobacion || p?.EstadoPP || "PENDIENTE").toUpperCase();
  }

  static startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  static addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  static inInterval(d, start, endExclusive) {
    return d >= start && d < endExclusive;
  }

  static inCurrentRange(d, info) {
    if (!d) return false;
    if (!info.start || !info.end) return true;
    return this.inInterval(d, info.start, info.end);
  }

  static localKey(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  static getRangeInfo(mode) {
    const now = new Date();
    const todayStart = this.startOfDay(now);
    const tomorrowStart = this.addDays(todayStart, 1);

    if (mode === "hoy") {
      return {
        label: "Hoy",
        hint: "Mostrando: Hoy",
        badge: `Rango: ${formatearFecha(todayStart)}`,
        start: todayStart,
        end: tomorrowStart,
        compareStart: this.addDays(todayStart, -1),
        compareEnd: todayStart
      };
    }

    if (mode === "7d") {
      const start = this.addDays(todayStart, -6);
      return {
        label: "Ultimos 7 dias",
        hint: "Mostrando: Ultimos 7 dias",
        badge: `Rango: ${formatearFecha(start)} - ${formatearFecha(todayStart)}`,
        start,
        end: tomorrowStart,
        compareStart: this.addDays(start, -7),
        compareEnd: start
      };
    }

    if (mode === "30d") {
      const start = this.addDays(todayStart, -29);
      return {
        label: "Ultimos 30 dias",
        hint: "Mostrando: Ultimos 30 dias",
        badge: `Rango: ${formatearFecha(start)} - ${formatearFecha(todayStart)}`,
        start,
        end: tomorrowStart,
        compareStart: this.addDays(start, -30),
        compareEnd: start
      };
    }

    const start = this.addDays(todayStart, -29);
    return {
      label: "Todo",
      hint: "Mostrando: Todo el historial",
      badge: "Rango: Todo",
      start: null,
      end: null,
      compareStart: this.addDays(start, -30),
      compareEnd: start,
      fallbackCurrentStart: start,
      fallbackCurrentEnd: tomorrowStart
    };
  }

  static toMinutesFromTimeValue(v) {
    if (!v) return 0;
    const s = String(v).trim();
    const m = s.match(/(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return 0;
    return (Number(m[1] || 0) * 60) + Number(m[2] || 0);
  }

  static getPendientesRevision(papeletas) {
    return papeletas
      .filter((p) => {
        const estado = String(p.EstadoAprobacion || p.EstadoPP || "PENDIENTE").toUpperCase();
        return String(p.ActivoPP || "1") === "1" && (estado === "PENDIENTE" || estado === "APROBADO_JEFE");
      })
      .sort((a, b) => {
        const da = this.getFechaRegistroPapeleta(a)?.getTime() || 0;
        const db = this.getFechaRegistroPapeleta(b)?.getTime() || 0;
        return da - db;
      })
      .slice(0, 8);
  }

  static getAttentionSummary(papeletas) {
    const now = Date.now();
    const pendientes = papeletas.filter((p) => {
      const estado = this.getEstadoPapeleta(p);
      return String(p.ActivoPP || "1") === "1" && (estado === "PENDIENTE" || estado === "APROBADO_JEFE");
    });
    const vencidas = pendientes.filter((p) => {
      const fecha = this.getFechaRegistroPapeleta(p);
      return fecha && ((now - fecha.getTime()) / 3600000) >= 48;
    });

    let area = null;
    let cantidad = 0;
    if (vencidas.length) {
      const areas = {};
      for (const p of vencidas) {
        const a = String(p.AreaPP || p.Area || "SIN AREA").trim() || "SIN AREA";
        areas[a] = (areas[a] || 0) + 1;
      }
      const [topArea, topCantidad] = Object.entries(areas).sort((a, b) => b[1] - a[1])[0];
      area = topArea;
      cantidad = topCantidad;
    }

    return { pendientes, vencidas, area, cantidad };
  }

  static buildAreaStats(papeletas) {
    const areas = new Map();
    for (const p of papeletas) {
      const area = String(p.AreaPP || p.Area || "SIN AREA").trim() || "SIN AREA";
      const estado = this.getEstadoPapeleta(p);
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

  static buildRankingUsuarios(papeletas) {
    const map = new Map();

    for (const p of papeletas) {
      const nombre = String(p.TrabajadorPP || p.UsuarioCreador || p.Usuario || "SIN USUARIO").trim() || "SIN USUARIO";
      const key = nombre.toUpperCase();
      const fecha = this.getFechaRegistroPapeleta(p)?.getTime() || 0;
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
          ultimoEstado: this.getEstadoPapeleta(p),
          ultimoFecha: fecha
        });
      }

      const item = map.get(key);
      const estado = this.getEstadoPapeleta(p);
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
}

window.DashboardService = DashboardService;
console.log("DashboardService loaded + exposed");
