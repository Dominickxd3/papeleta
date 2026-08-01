// src/security/roles.js
// Fuente única de verdad para normalización de roles y mapeo de niveles ERP.
// Extraído de middlewares/auth.js, papeletas.routes.js y usuarios.routes.js.

function normalizeRole(role) {
  return String(role || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

const PRIVILEGED_ROLES = new Set([
  'ADMIN',
  'ADMINISTRADOR',
  'ADMINISTRADOR DEL SISTEMA',
  'RRHH',
  'RR HH',
  'RECURSOS HUMANOS'
]);

const ADMIN_ROLES = new Set([
  'ADMIN',
  'ADMINISTRADOR',
  'ADMINISTRADOR DEL SISTEMA'
]);

function isPrivilegedRole(role) {
  return PRIVILEGED_ROLES.has(normalizeRole(role));
}

function isAdminRole(role) {
  return ADMIN_ROLES.has(normalizeRole(role));
}

// Mapeo sw_nivel del ERP a rol de la app.
// nivel >= 4 -> ADMIN, = 3 -> RRHH, resto -> USUARIO
function roleFromSwNivel(swNivel) {
  const nivel = Number(swNivel || 0);
  if (nivel >= 4) return 'ADMIN';
  if (nivel === 3) return 'RRHH';
  return 'USUARIO';
}

function isUserActive(estadoRaw) {
  const estado = String(estadoRaw ?? '').trim().toUpperCase();
  if (!estado) return true;
  const inactiveStates = new Set(['INACTIVO', 'I', 'BLOQUEADO', 'B', 'NO', 'N', '2', '9']);
  return !inactiveStates.has(estado);
}

module.exports = {
  normalizeRole,
  isPrivilegedRole,
  isAdminRole,
  roleFromSwNivel,
  isUserActive,
  PRIVILEGED_ROLES,
  ADMIN_ROLES
};
