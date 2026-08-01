// src/security/policy.js
// Capa de políticas de autorización. Cada política devuelve un decision:
//   { allowed: true } | { allowed: false, status, message }
// Sin lógica de base de datos: recibe (user, contexto) y decide.

const { isPrivilegedRole, isAdminRole } = require('./roles');

const allow = () => ({ allowed: true });
const deny = (message, status = 403) => ({ allowed: false, status, message });

// Cualquier usuario autenticado puede registrar su propia papeleta.
function canCreatePapeleta(user) {
  if (!user) return deny('No autorizado', 401);
  return allow();
}

// Editar: permitido salvo que la papeleta esté cerrada
// (anulada, aprobada o rechazada) y el usuario no tenga rol privilegiado.
function canEditPapeleta(user, papeleta) {
  if (!user) return deny('No autorizado', 401);
  if (!papeleta) return deny('Papeleta no encontrada', 404);

  const estado = String(papeleta.EstadoAprobacion || '').toUpperCase().trim();
  const activo = String(papeleta.ActivoPP || '1').trim();
  const isClosed = activo === '2' || ['APROBADO_RRHH', 'APROBADO_JEFE', 'RECHAZADO'].includes(estado);

  if (isClosed && !isPrivilegedRole(user?.rol || user?.Rol || user?.role)) {
    return deny('No se puede editar una papeleta aprobada, rechazada o anulada.');
  }
  return allow();
}

// Aprobar/rechazar/restaurar: solo roles privilegiados.
function canApprovePapeleta(user) {
  if (!user) return deny('No autorizado', 401);
  if (!isPrivilegedRole(user?.rol || user?.Rol || user?.role)) return deny('Acceso denegado');
  return allow();
}

// Descargar/imprimir PDF: requiere que la papeleta esté aprobada por RRHH.
function canDownloadDocument(user, papeleta) {
  if (!user) return deny('No autorizado', 401);
  const estado = String(papeleta?.EstadoAprobacion || 'PENDIENTE').toUpperCase();
  if (estado !== 'APROBADO_RRHH') {
    return deny('Solo se puede imprimir una papeleta aprobada por RRHH');
  }
  return allow();
}

// Gestión de usuarios ERP: solo roles ADMIN.
function canManageUsers(user) {
  if (!user) return deny('No autorizado', 401);
  if (!isAdminRole(user?.rol || '')) return deny('Solo ADMIN puede gestionar usuarios ERP');
  return allow();
}

module.exports = {
  canCreatePapeleta,
  canEditPapeleta,
  canApprovePapeleta,
  canDownloadDocument,
  canManageUsers
};
