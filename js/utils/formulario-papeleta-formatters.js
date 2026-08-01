// ==========================================
// FORMULARIO PAPELETA - Formatters
// Utilidades puras del módulo (sin acceso a DOM).
// Namespaced en window.FormularioFormatters para evitar
// colisiones con otros formatters globales del sistema.
// ==========================================

const FormularioFormatters = {
  MOTIVO_MAX_LEN: 120,
  SOLO_LETRAS_REGEX: /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$/,

  normalizarTexto(v) {
    return String(v || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .toLowerCase();
  },

  sanitizeDni(v) {
    return String(v || "").replace(/\D/g, "").slice(0, 8);
  },

  // Acepta "YYYY-MM-DD..." o cualquier fecha parseable.
  formatearFechaInput(fechaISO) {
    if (!fechaISO) return '';
    const raw = String(fechaISO).trim();
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const d = new Date(fechaISO);
    if (isNaN(d.getTime())) return fechaISO;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },

  // Acepta "13:00:00" => "13:00"
  formatearHoraParaInput(h) {
    if (!h) return "";
    const s = String(h);
    const m = s.match(/^(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : s;
  },

  esValorSinRetorno(raw) {
    const s = String(raw || "").trim();
    if (!s) return false;
    return s === "00:00" || s === "00:00:00" || /T00:00(?::00)?/.test(s);
  },

  // Normaliza la respuesta del endpoint ultimo-numero a un número.
  extraerNumeroUltimo(raw) {
    if (typeof raw === "number") return raw;

    // {ultimoNumero:n}
    if (raw && typeof raw === "object" && raw.ultimoNumero != null) return raw.ultimoNumero;

    // {status:"OK", data:n}
    if (raw && typeof raw === "object" && typeof raw.data === "number") return raw.data;

    // {status:"OK", data:{ultimoNumero:n}}
    if (raw && typeof raw === "object" && raw.data && typeof raw.data === "object" && raw.data.ultimoNumero != null) {
      return raw.data.ultimoNumero;
    }

    return 0;
  },

  calcularTiempo(hs, hr) {
    if (!hs || !hr) return "";
    const [h1, m1] = hs.split(":").map(Number);
    const [h2, m2] = hr.split(":").map(Number);
    if ([h1, m1, h2, m2].some(n => Number.isNaN(n))) return "";

    const a = h1 * 60 + m1;
    const b = h2 * 60 + m2;
    if (b <= a) return "";

    const diff = b - a;
    const hh = String(Math.floor(diff / 60)).padStart(2, "0");
    const mm = String(diff % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  },

  // Normalización trabajadores (por si los nombres cambian)
  getIdTrabajador(t) {
    return t?.IdT ?? t?.IdTra ?? t?.IdTrabajador ?? t?.Id ?? t?.id ?? "";
  },
  getDni(t) {
    return t?.DOI ?? t?.DOIT ?? t?.DniTra ?? t?.DNI ?? t?.dni ?? t?.Doi ?? t?.Dni ?? "";
  },
  getNombreTrabajador(t) {
    return t?.NombreCompletoT ?? t?.NombreCompleto ?? t?.TrabajadorT ?? t?.Trabajador ?? t?.NombreT ?? t?.nombre ?? t?.Nombres ?? (() => {
      const n = `${t?.NombresTra ?? t?.Nombres ?? ""} ${t?.ApellidosTra ?? t?.Apellidos ?? ""}`.trim();
      return n || "";
    })();
  },
  getCargo(t) {
    return t?.CargoT ?? t?.CargoTra ?? t?.Ocupacion ?? t?.cargo ?? t?.Cargo ?? "";
  },
  getArea(t) {
    return t?.AreaT ?? t?.AreaTra ?? t?.area ?? t?.Area ?? "";
  }
};

window.FormularioFormatters = FormularioFormatters;
