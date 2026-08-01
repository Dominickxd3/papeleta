const timeToMinutes = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return (hh * 60) + mm;
};

const normalizeRangeMinutes = (startValue, endValue) => {
  const start = timeToMinutes(startValue);
  let end = timeToMinutes(endValue);
  if (start === null) return null;
  if (end === null || end === 0) end = 24 * 60;
  if (end < start) return null;
  return { start, end };
};

const parseDateTimeInput = (value, fieldName, { dateOnly = false } = {}) => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const raw = String(value).trim();
  if (!raw) return null;

  if (dateOnly) {
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]) - 1;
      const d = Number(m[3]);
      // Usar mediodia local evita corrimiento de fecha por zona horaria.
      return new Date(y, mo, d, 12, 0, 0, 0);
    }
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Fecha invalida en ${fieldName}`);
  }
  return parsed;
};

const extractVacacionesRange = (payload = {}) => {
  const parseIso = (v) => {
    const raw = String(v || '').trim();
    if (!raw) return null;
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return `${m[1]}-${m[2]}-${m[3]}`;
  };

  let desde = parseIso(payload.FechaVacDesdePP || payload.fechaVacDesdePP || payload.vacacionesDesde);
  let hasta = parseIso(payload.FechaVacHastaPP || payload.fechaVacHastaPP || payload.vacacionesHasta);

  if (!desde || !hasta) {
    const considerar = String(payload.ConsiderarPP || '').trim();
    const m = considerar.match(/^vacaciones\s*:\s*(\d{4}-\d{2}-\d{2})\s*a\s*(\d{4}-\d{2}-\d{2})$/i);
    if (m) {
      desde = desde || m[1];
      hasta = hasta || m[2];
    }
  }

  if (!desde || !hasta) return { desde: null, hasta: null };
  if (hasta < desde) return { desde: null, hasta: null };
  return { desde, hasta };
};

const getDateParts = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      return {
        year: Number(m[1]),
        month: Number(m[2]),
        day: Number(m[3])
      };
    }
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate()
  };
};

module.exports = {
  timeToMinutes,
  normalizeRangeMinutes,
  parseDateTimeInput,
  extractVacacionesRange,
  getDateParts
};
