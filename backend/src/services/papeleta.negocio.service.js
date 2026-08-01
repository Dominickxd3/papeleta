// src/services/papeleta.negocio.service.js
// Reglas de negocio puras (sin I/O): cruce horario, calculo de rangos,
// construccion de visibilidad y aislamiento por rol/area/creador.
// Logica identica a la embebida en routes/papeletas.routes.js.

const { normalizeRangeMinutes } = require('../validators/papeleta.validator');
const { getFriendlySqlErrorMessage } = require('../validators/papeleta.error.service');
const { isPrivilegedRole } = require('../security/roles');

function createPapeletaNegocioService() {
  const extraerContextoUsuario = (user = {}) => ({
    userRole: user?.rol || user?.Rol || user?.role || '',
    userId: Number(user?.id || user?.IdUsuario || user?.idUsuario || 0) || null,
    userLogin: String(user?.usuario || user?.Usuario || '').trim(),
    userOrigen: String(user?.origen || '').trim().toUpperCase(),
    tokenSwNivel: Number(user?.sw_nivel || 0) || 0,
    userDoi: String(user?.doi || user?.DOI || user?.dni || user?.DNI || '').trim(),
    userNombre: String(user?.nombre || user?.Nombre || user?.NombreCompleto || user?.usuario || user?.Usuario || '').trim()
  });

  const esUsuarioErp = ({ userOrigen, userId, userLogin }) =>
    userOrigen === 'ERP' || (!userId && !!userLogin);

  const construirVisibilidad = ({
    userRole,
    userId,
    userLogin,
    userOrigen,
    tokenSwNivel,
    userDoi,
    userNombre,
    isErpUser,
    erpAccess,
    hasCreatorCol
  }) => {
    const effectiveSwNivel = tokenSwNivel || (erpAccess?.swNivel || 0) || 0;
    const privileged = isPrivilegedRole(userRole) || effectiveSwNivel >= 3;
    const esErpNivel2 = !privileged && isErpUser && effectiveSwNivel === 2;
    return {
      privileged,
      esErpNivel2,
      areasAcceso: esErpNivel2 ? (erpAccess?.areas || []) : [],
      hasCreatorCol: !!hasCreatorCol,
      userId,
      userDoi,
      userNombre,
      userLogin
    };
  };

  const calcularRangoMinutos = (startValue, endValue) => normalizeRangeMinutes(startValue, endValue);

  const evaluarCruceHorario = (rows, { horaSalida, horaRetorno }) => {
    const nuevo = normalizeRangeMinutes(horaSalida, horaRetorno);
    if (!nuevo) return null;
    const conflicto = (rows || []).find((row) => {
      const existente = normalizeRangeMinutes(row.HSalidaPP, row.HRetornoPP);
      if (!existente) return false;
      return nuevo.start < existente.end && nuevo.end > existente.start;
    });
    return conflicto || null;
  };

  return {
    extraerContextoUsuario,
    esUsuarioErp,
    construirVisibilidad,
    calcularRangoMinutos,
    evaluarCruceHorario,
    getFriendlySqlErrorMessage
  };
}

module.exports = { createPapeletaNegocioService };
