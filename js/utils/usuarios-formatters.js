// ==========================================
// USUARIOS FORMATTERS - Formato y helpers del módulo
// ==========================================
// Helpers de texto/formato del módulo usuarios/administración.
// Se exponen como UsuariosFormatters para evitar colisiones globales
// (sidebar.js ya expone normalizeRole/readStoredUser globales).

function normalizeRole(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function readStoredUser() {
  const raw = localStorage.getItem('usuario');
  if (!raw || raw === 'undefined' || raw === 'null') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isAdminRole(role) {
  const r = normalizeRole(role);
  return r === 'ADMIN' || r === 'ADMINISTRADOR' || r === 'ADMINISTRADOR DEL SISTEMA';
}

function formatDateTime(v) {
  if (!v) return '--';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleString('es-PE');
}

function formatErpEstado(estado) {
  const e = normalizeRole(estado);
  if (!e) return 'N/D';
  if (e === '1' || e === 'A' || e === 'ACTIVO') return 'Activo';
  if (e === '0' || e === 'I' || e === 'INACTIVO') return 'Inactivo';
  if (e === 'B' || e === 'BLOQUEADO') return 'Bloqueado';
  return estado;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.UsuariosFormatters = {
  normalizeRole,
  readStoredUser,
  isAdminRole,
  formatDateTime,
  formatErpEstado,
  escapeHtml
};

console.log('✅ UsuariosFormatters loaded');
