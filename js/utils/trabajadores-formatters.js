// ==========================================
// TRABAJADORES FORMATTERS - Formato del módulo
// ==========================================
// Helpers de texto/formato del módulo trabajadores.
// Se mantienen aquí (no en utils/formatters.js) porque su comportamiento
// legado difiere del de las funciones compartidas (p. ej. obtenerIniciales
// de formatters.js devuelve 'AN' para un solo nombre; la versión de
// trabajadores devuelve 'A').

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildTrabajadorSearchText(t) {
  return normalizeText([
    t.Trabajador,
    t.TRABAJADOR,
    t.NombreCompletoT,
    t.NOMBRECOMPLETOT,
    t.DOI,
    t.DOI_T,
    t.DOIT,
    t.Ocupacion,
    t.OCUPACION,
    t.Cargo,
    t.CARGO,
    t.Area,
    t.AREA,
    t.Estado,
    t.ESTADO
  ].filter(Boolean).join(' '));
}

function obtenerInicialesTrabajador(nombre) {
  const p = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '--';
  return (p[0][0] + (p[1]?.[0] || '')).toUpperCase();
}

function formatearFechaHoraLocal(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

console.log('✅ TrabajadoresFormatters loaded');
