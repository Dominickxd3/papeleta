// src/repositories/papeleta.repository.js
// Acceso a datos de lectura de papeletas. SQL/SP identicos al original
// (routes/papeletas.routes.js). Sin logica de negocio: recibe contexto
// ya decidido (visibilidad) y devuelve filas crudas.

const { parseDateTimeInput } = require('../validators/papeleta.validator');

class PapeletaRepository {
  constructor(getPool, sql) {
    this.getPool = getPool;
    this.sql = sql;
  }

  async mostrar() {
    const result = await this.getPool().request().execute('mostrar_PapeletaPermiso_gp');
    return result.recordset;
  }

  async listar({ filtros = {}, visibilidad = {}, paginacion = {} } = {}) {
    const {
      texto = '',
      area = '',
      estado = '',
      mostrarAnulados = ''
    } = filtros;
    const {
      privileged = false,
      esErpNivel2 = false,
      areasAcceso = [],
      hasCreatorCol = false,
      userId = null,
      userDoi = '',
      userNombre = '',
      userLogin = ''
    } = visibilidad;
    const {
      page = 1,
      pageSize = 20,
      paginated = false
    } = paginacion;
    const offset = (page - 1) * pageSize;

    const creatorColSql = hasCreatorCol ? 'IdUsuarioCreador,' : 'CAST(NULL AS INT) AS IdUsuarioCreador,';
    const whereParts = ['1 = 1'];
    const reqDb = this.getPool().request();

    if (area) {
      whereParts.push('ISNULL(P.AreaPP, \'\') = @Area');
      reqDb.input('Area', this.sql.NVarChar(80), area);
    }

    if (texto) {
      whereParts.push(`
        (
          P.TrabajadorPP LIKE @TextoLike
          OR P.DOIPP LIKE @TextoLike
          OR P.CargoPP LIKE @TextoLike
          OR P.AreaPP LIKE @TextoLike
          OR P.MotivoPP LIKE @TextoLike
          OR P.ConsiderarPP LIKE @TextoLike
          OR CONVERT(varchar(20), P.NumeroPP) LIKE @TextoLike
        )
      `);
      reqDb.input('TextoLike', this.sql.NVarChar(260), `%${texto}%`);
    }

    if (estado === 'pendientes') {
      whereParts.push(`ISNULL(P.EstadoAprobacion, 'PENDIENTE') = 'PENDIENTE'`);
    } else if (estado === 'aprobadas') {
      whereParts.push(`ISNULL(P.EstadoAprobacion, 'PENDIENTE') IN ('APROBADO_JEFE', 'APROBADO_RRHH')`);
    } else if (estado === 'rechazadas') {
      whereParts.push(`ISNULL(P.EstadoAprobacion, 'PENDIENTE') = 'RECHAZADO'`);
    }

    if (mostrarAnulados === 'true') {
      whereParts.push(`ISNULL(P.ActivoPP, '1') = '2'`);
    } else if (mostrarAnulados === 'false') {
      whereParts.push(`ISNULL(P.ActivoPP, '1') = '1'`);
    }

    if (!privileged && esErpNivel2) {
      if (areasAcceso.length > 0) {
        const areaClauses = [];
        areasAcceso.forEach((areaName, idx) => {
          const param = `AreaAcceso${idx}`;
          areaClauses.push(`LTRIM(RTRIM(ISNULL(P.AreaPP, ''))) = @${param}`);
          reqDb.input(param, this.sql.NVarChar(150), areaName);
        });
        whereParts.push(`(${areaClauses.join(' OR ')})`);
      } else {
        whereParts.push('1 = 0');
      }
    } else if (!privileged) {
      if (hasCreatorCol && userId) {
        whereParts.push('P.IdUsuarioCreador = @IdUsuarioCreador');
        reqDb.input('IdUsuarioCreador', this.sql.Int, userId);
      } else {
        whereParts.push(`
          (
            (@DOI <> '' AND P.DOIPP = @DOI)
            OR
            (@TrabajadorDoiLike <> '' AND P.TrabajadorPP LIKE @TrabajadorDoiLike)
            OR
            (
              @UsuarioLogin <> ''
              AND EXISTS (
                SELECT 1
                FROM TBL_AUDITORIA A
                WHERE A.Tabla = 'TBL_GGHH_PapeletaPermiso'
                  AND A.IdRegistro = P.IdPP
                  AND A.Accion = 'CREAR'
                  AND (A.Usuario = @UsuarioLogin OR A.NombreUsuario = @UsuarioLogin)
              )
            )
          )
        `);
        reqDb.input('DOI', this.sql.NVarChar(20), userDoi);
        reqDb.input('TrabajadorDoiLike', this.sql.NVarChar(220), userNombre ? `%${userNombre}%` : '');
        reqDb.input('UsuarioLogin', this.sql.NVarChar(80), userLogin);
      }
    }

    const whereSql = whereParts.join(' AND ');

    const countResult = await reqDb.query(`
      SELECT COUNT(1) AS total
      FROM TBL_GGHH_PapeletaPermiso P
      WHERE ${whereSql}
    `);
    const total = Number(countResult.recordset?.[0]?.total || 0);

    const reqData = this.getPool().request();
    if (area) reqData.input('Area', this.sql.NVarChar(80), area);
    if (texto) reqData.input('TextoLike', this.sql.NVarChar(260), `%${texto}%`);
    if (!privileged && esErpNivel2) {
      areasAcceso.forEach((areaName, idx) => {
        reqData.input(`AreaAcceso${idx}`, this.sql.NVarChar(150), areaName);
      });
    } else if (!privileged) {
      if (hasCreatorCol && userId) {
        reqData.input('IdUsuarioCreador', this.sql.Int, userId);
      } else {
        reqData.input('DOI', this.sql.NVarChar(20), userDoi);
        reqData.input('TrabajadorDoiLike', this.sql.NVarChar(220), userNombre ? `%${userNombre}%` : '');
        reqData.input('UsuarioLogin', this.sql.NVarChar(80), userLogin);
      }
    }
    reqData.input('OffsetRows', this.sql.Int, offset);
    reqData.input('FetchRows', this.sql.Int, pageSize);

    const dataQuery = `
      SELECT
        P.IdPP, P.NumeroPP, P.FechaPermisoPP, P.DOIPP, P.TrabajadorPP, P.CargoPP, P.AreaPP, P.MotivoPP,
        P.ConsiderarPP, P.ObservacionesPP, P.HSalidaPP, P.HRetornoPP, P.TiempoPP, P.ActivoPP,
        ${creatorColSql}
        ISNULL(P.EstadoAprobacion, 'PENDIENTE') AS EstadoAprobacion,
        CASE
          WHEN ISNULL(P.ActivoPP,'1') = '2'                               THEN 'Rechazado'
          WHEN ISNULL(P.EstadoAprobacion,'PENDIENTE') = 'PENDIENTE'       THEN 'Pendiente'
          WHEN ISNULL(P.EstadoAprobacion,'PENDIENTE') = 'APROBADO_JEFE'   THEN 'Aprobado por Jefe'
          WHEN ISNULL(P.EstadoAprobacion,'PENDIENTE') = 'APROBADO_RRHH'   THEN 'Aprobado por RRHH'
          WHEN ISNULL(P.EstadoAprobacion,'PENDIENTE') = 'RECHAZADO'       THEN 'Rechazado'
          ELSE ISNULL(P.EstadoAprobacion,'Pendiente')
        END AS EstadoPP
      FROM TBL_GGHH_PapeletaPermiso P
      WHERE ${whereSql}
      ORDER BY COALESCE(P.FechaModificacionPP, P.FechaRegistroPP, P.FechaPermisoPP) DESC, P.IdPP DESC
      ${paginated ? 'OFFSET @OffsetRows ROWS FETCH NEXT @FetchRows ROWS ONLY' : ''}
    `;

    const result = await reqData.query(dataQuery);

    return {
      rows: result.recordset,
      total,
      paginated
    };
  }

  async ultimoNumero() {
    const result = await this.getPool().request().query(`
      SELECT TOP 1 NumeroPP
      FROM TBL_GGHH_PapeletaPermiso
      ORDER BY NumeroPP DESC
    `);
    return result.recordset.length > 0 ? result.recordset[0].NumeroPP : 0;
  }

  async reporte(id) {
    const result = await this.getPool().request().input('IdPP', this.sql.Int, id).execute('reporte_PapeletaPermiso_gp');
    return result.recordset[0] || null;
  }

  async porEstado() {
    const result = await this.getPool().request().query(`
      SELECT ISNULL(EstadoAprobacion, 'PENDIENTE') AS estado, COUNT(*) AS cantidad
      FROM TBL_GGHH_PapeletaPermiso
      WHERE ActivoPP = '1'
      GROUP BY EstadoAprobacion
      ORDER BY COUNT(*) DESC
    `);
    return result.recordset || [];
  }

  async buscarPapeletasActivasFecha({ doi, fechaPermiso, excludeId = null, tx = null } = {}) {
    const request = tx ? new this.sql.Request(tx) : this.getPool().request();
    request
      .input('DOIPP', this.sql.VarChar(20), String(doi).trim())
      .input('FechaPermisoPP', this.sql.Date, parseDateTimeInput(fechaPermiso, 'FechaPermisoPP', { dateOnly: true }))
      .input('ExcludeIdPP', this.sql.Int, excludeId ? Number(excludeId) : null);

    const result = await request.query(`
      SELECT
        P.IdPP,
        P.NumeroPP,
        P.HSalidaPP,
        P.HRetornoPP
      FROM TBL_GGHH_PapeletaPermiso P
      WHERE P.DOIPP = @DOIPP
        AND P.FechaPermisoPP = @FechaPermisoPP
        AND ISNULL(P.ActivoPP, '1') = '1'
        AND (@ExcludeIdPP IS NULL OR P.IdPP <> @ExcludeIdPP)
    `);

    return result.recordset || [];
  }

  async obtenerPrevio(id, { tx = null } = {}) {
    const request = tx ? new this.sql.Request(tx) : this.getPool().request();
    const previoResult = await request
      .input('IdPP', this.sql.Int, Number(id))
      .query(`SELECT TOP 1 * FROM TBL_GGHH_PapeletaPermiso WHERE IdPP = @IdPP`);
    return previoResult.recordset?.[0] || null;
  }

  async obtenerActualizado(id) {
    const actualizadoResult = await this.getPool().request()
      .input('IdPP', this.sql.Int, Number(id))
      .query(`SELECT TOP 1 * FROM TBL_GGHH_PapeletaPermiso WHERE IdPP = @IdPP`);
    return actualizadoResult.recordset?.[0] || null;
  }

  async obtenerEstadoPapeleta(id) {
    const estadoResult = await this.getPool().request()
      .input('IdPP', this.sql.Int, id)
      .query(`
        SELECT TOP 1 ISNULL(EstadoAprobacion, 'PENDIENTE') AS EstadoAprobacion
        FROM TBL_GGHH_PapeletaPermiso
        WHERE IdPP = @IdPP
      `);
    return String(estadoResult.recordset?.[0]?.EstadoAprobacion || 'PENDIENTE').toUpperCase();
  }

  async obtenerVacacionesPP(id) {
    const vacResult = await this.getPool().request()
      .input('IdPP', this.sql.Int, id)
      .query(`
        SELECT TOP 1 FechaVacDesdePP, FechaVacHastaPP
        FROM TBL_GGHH_PapeletaPermiso
        WHERE IdPP = @IdPP
      `);
    return {
      desde: vacResult.recordset?.[0]?.FechaVacDesdePP || null,
      hasta: vacResult.recordset?.[0]?.FechaVacHastaPP || null
    };
  }

  async obtenerCreadorPapeleta(id) {
    try {
      const creadorResult = await this.getPool().request()
        .input('IdPP', this.sql.Int, id)
        .query(`
          SELECT TOP 1
            Creador = COALESCE(
              NULLIF(U.NombreUsuario, ''),
              NULLIF(U.NombreCompleto, ''),
              NULLIF(U.Nombre, ''),
              NULLIF(AC.NombreUsuario, ''),
              NULLIF(AC.Usuario, ''),
              ''
            )
          FROM TBL_GGHH_PapeletaPermiso P
          LEFT JOIN TBL_USUARIOS U ON U.IdUsuario = P.IdUsuarioCreador
          OUTER APPLY (
            SELECT TOP 1
              A.Usuario,
              A.NombreUsuario
            FROM TBL_AUDITORIA A
            WHERE A.Tabla = 'TBL_GGHH_PapeletaPermiso'
              AND A.IdRegistro = P.IdPP
              AND A.Accion = 'CREAR'
            ORDER BY A.IdAuditoria DESC
          ) AC
          WHERE P.IdPP = @IdPP
        `);
      return String(creadorResult.recordset?.[0]?.Creador || '').trim();
    } catch {
      const creadorFallback = await this.getPool().request()
        .input('IdPP', this.sql.Int, id)
        .query(`
          SELECT TOP 1
            Creador = COALESCE(
              NULLIF(AC.NombreUsuario, ''),
              NULLIF(AC.Usuario, ''),
              ''
            )
          FROM TBL_GGHH_PapeletaPermiso P
          OUTER APPLY (
            SELECT TOP 1
              A.Usuario,
              A.NombreUsuario
            FROM TBL_AUDITORIA A
            WHERE A.Tabla = 'TBL_GGHH_PapeletaPermiso'
              AND A.IdRegistro = P.IdPP
              AND A.Accion = 'CREAR'
            ORDER BY A.IdAuditoria DESC
          ) AC
          WHERE P.IdPP = @IdPP
        `);
      return String(creadorFallback.recordset?.[0]?.Creador || '').trim();
    }
  }

  async lookupIdUsuarioPorLogin(login, { tx = null } = {}) {
    const request = tx ? new this.sql.Request(tx) : this.getPool().request();
    const userLookup = await request
      .input('Usuario', this.sql.NVarChar(80), login)
      .query(`
        SELECT TOP 1 IdUsuario
        FROM TBL_USUARIOS
        WHERE Usuario = @Usuario
      `);
    return Number(userLookup.recordset?.[0]?.IdUsuario || 0) || null;
  }

  async lookupIdPPUltimoInsertado(numero, doi, { tx = null } = {}) {
    const request = tx ? new this.sql.Request(tx) : this.getPool().request();
    const qLast = await request
      .input('NumeroPP', this.sql.Int, numero)
      .input('DOIPP', this.sql.NVarChar(8), String(doi || '').trim())
      .query(`
        SELECT TOP 1 IdPP
        FROM TBL_GGHH_PapeletaPermiso
        WHERE NumeroPP = @NumeroPP
          AND DOIPP = @DOIPP
        ORDER BY IdPP DESC
      `);
    return Number(qLast.recordset?.[0]?.IdPP || 0) || null;
  }
}

module.exports = { PapeletaRepository };
