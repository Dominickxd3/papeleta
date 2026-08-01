const ExcelJS = require('exceljs');
const { isPrivilegedRole } = require('../src/security/roles');
const { canEditPapeleta, canDownloadDocument } = require('../src/security/policy');
const { assertPolicy } = require('../src/middlewares/authorize');

function registerPapeletasRoutes(app, deps) {
  const {
        sql,
    requireAprobacionRole,
    convertirHoraSQL,
    registrarAuditoria,
    crearNotificacionUsuario,
    crearNotificacionRRHH,
    getClientIp,
    PDFDocument,
    fs,
    path,
    backendDir
  } = deps;
  const getPool = deps.getPool || (() => deps.pool);
  const schemaCache = {
    hasIdUsuarioCreador: null,
    checkedAt: 0
  };
  const vacacionesSchemaCache = {
    hasFechaVacDesdePP: null,
    hasFechaVacHastaPP: null,
    checkedAt: 0
  };
  const porEstadoCache = {
    data: null,
    expiresAt: 0
  };

  const getFriendlySqlErrorMessage = (error) => {
    const raw = String(error?.message || '').trim();
    if (!raw) return 'Ocurrio un error inesperado.';

    const isDuplicateKey =
      Number(error?.number) === 2601 ||
      Number(error?.number) === 2627 ||
      /Cannot insert duplicate key row/i.test(raw);

    if (isDuplicateKey && /UX_Papeleta_Trabajador_Fecha_Activa/i.test(raw)) {
      return 'Ya existe una papeleta activa para este trabajador en la fecha seleccionada.';
    }

    return raw;
  };

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

  const findHorarioConflict = async ({ tx = null, doi, fechaPermiso, horaSalida, horaRetorno, excludeId = null }) => {
    const nuevo = normalizeRangeMinutes(horaSalida, horaRetorno);
    if (!doi || !fechaPermiso || !nuevo) return null;

    const request = tx ? new sql.Request(tx) : getPool().request();
    request
      .input('DOIPP', sql.VarChar(20), String(doi).trim())
      .input('FechaPermisoPP', sql.Date, parseDateTimeInput(fechaPermiso, 'FechaPermisoPP', { dateOnly: true }))
      .input('ExcludeIdPP', sql.Int, excludeId ? Number(excludeId) : null);

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

    const conflicto = (result.recordset || []).find((row) => {
      const existente = normalizeRangeMinutes(row.HSalidaPP, row.HRetornoPP);
      if (!existente) return false;
      return nuevo.start < existente.end && nuevo.end > existente.start;
    });

    return conflicto || null;
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

  const hasIdUsuarioCreadorColumn = async () => {
    const now = Date.now();
    if ((now - schemaCache.checkedAt) < 300000 && schemaCache.hasIdUsuarioCreador !== null) {
      return schemaCache.hasIdUsuarioCreador;
    }

    const colCheck = await getPool().request().query(`
      SELECT COL_LENGTH('TBL_GGHH_PapeletaPermiso', 'IdUsuarioCreador') AS ColLen
    `);
    schemaCache.hasIdUsuarioCreador = !!(colCheck.recordset?.[0]?.ColLen);
    schemaCache.checkedAt = now;
    return schemaCache.hasIdUsuarioCreador;
  };

  const getVacacionesColumnsAvailability = async () => {
    const now = Date.now();
    if ((now - vacacionesSchemaCache.checkedAt) < 300000
      && vacacionesSchemaCache.hasFechaVacDesdePP !== null
      && vacacionesSchemaCache.hasFechaVacHastaPP !== null) {
      return {
        hasFechaVacDesdePP: vacacionesSchemaCache.hasFechaVacDesdePP,
        hasFechaVacHastaPP: vacacionesSchemaCache.hasFechaVacHastaPP
      };
    }

    const cols = await getPool().request().query(`
      SELECT
        COL_LENGTH('TBL_GGHH_PapeletaPermiso', 'FechaVacDesdePP') AS ColDesde,
        COL_LENGTH('TBL_GGHH_PapeletaPermiso', 'FechaVacHastaPP') AS ColHasta
    `);
    vacacionesSchemaCache.hasFechaVacDesdePP = !!(cols.recordset?.[0]?.ColDesde);
    vacacionesSchemaCache.hasFechaVacHastaPP = !!(cols.recordset?.[0]?.ColHasta);
    vacacionesSchemaCache.checkedAt = now;
    return {
      hasFechaVacDesdePP: vacacionesSchemaCache.hasFechaVacDesdePP,
      hasFechaVacHastaPP: vacacionesSchemaCache.hasFechaVacHastaPP
    };
  };

  const getErpAreaAccess = async (userLogon) => {
    const login = String(userLogon || '').trim();
    if (!login) {
      return { swNivel: 1, areas: [] };
    }

    try {
      const result = await getPool().request()
        .input('UserLogon', sql.VarChar(80), login)
        .query(`
          SELECT TOP 1
            sw_nivel,
            Activo
          FROM dbo.TBL_USUARIOS_ERP_APP
          WHERE UserLogon = @UserLogon
        `);

      const user = result.recordset?.[0] || null;
      const activo = String(user?.Activo ?? '1').trim();
      if (activo === '0' || activo === '2') {
        return { swNivel: 1, areas: [] };
      }

      const swNivel = Number(user?.sw_nivel || 1) || 1;
      if (swNivel !== 2) {
        return { swNivel, areas: [] };
      }

      const areasResult = await getPool().request()
        .input('UserLogon', sql.VarChar(80), login)
        .query(`
          SELECT A.NombreAreaERP
          FROM dbo.TBL_USUARIO_ERP_AREA_APP UEA
          INNER JOIN dbo.TBL_AREAS_ERP_APP A
            ON A.IdAreaERP = UEA.IdAreaERP
          WHERE UEA.UserLogon = @UserLogon
            AND ISNULL(UEA.Activo, '1') = '1'
            AND ISNULL(A.Activo, '1') = '1'
        `);

      return {
        swNivel,
        areas: (areasResult.recordset || [])
          .map((row) => String(row.NombreAreaERP || '').trim())
          .filter(Boolean)
      };
    } catch {
      return { swNivel: 1, areas: [] };
    }
  };

  app.get('/api/papeletas/mostrar', async (req, res) => {
    try {
      console.log('Consultando papeletas de permiso');
      const result = await getPool().request().execute('mostrar_PapeletaPermiso_gp');
      console.log(`${result.recordset.length} papeletas encontradas`);
      res.json(result.recordset);
    } catch (err) {
      console.error('Error:', err.message);
      const friendlyMessage = getFriendlySqlErrorMessage(err);
      const statusCode = friendlyMessage === err.message ? 500 : 409;
      res.status(statusCode).json({ success: false, message: friendlyMessage });
    }
  });

  app.get('/api/papeletas/listar', async (req, res) => {
    try {
      const pageRaw = Number(req.query?.page);
      const pageSizeRaw = Number(req.query?.pageSize);
      const paginated = Number.isInteger(pageRaw) || Number.isInteger(pageSizeRaw);
      const page = Math.max(1, Number.isInteger(pageRaw) ? pageRaw : 1);
      const pageSize = Math.min(100, Math.max(1, Number.isInteger(pageSizeRaw) ? pageSizeRaw : 20));
      const offset = (page - 1) * pageSize;

      const texto = String(req.query?.texto || '').trim();
      const area = String(req.query?.area || '').trim();
      const estado = String(req.query?.estado || '').trim().toLowerCase();
      const mostrarAnulados = String(req.query?.mostrarAnulados || '').trim().toLowerCase();
      const userRole = req.user?.rol || req.user?.Rol || req.user?.role || '';
      const userId = Number(req.user?.id || req.user?.IdUsuario || req.user?.idUsuario || 0) || null;
      const userLogin = String(
        req.user?.usuario ||
        req.user?.Usuario ||
        ''
      ).trim();
      const userOrigen = String(req.user?.origen || '').trim().toUpperCase();
      const tokenSwNivel = Number(req.user?.sw_nivel || 0) || 0;
      const userDoi = String(
        req.user?.doi ||
        req.user?.DOI ||
        req.user?.dni ||
        req.user?.DNI ||
        ''
      ).trim();
      const userNombre = String(
        req.user?.nombre ||
        req.user?.Nombre ||
        req.user?.NombreCompleto ||
        req.user?.usuario ||
        req.user?.Usuario ||
        ''
      ).trim();

      const hasCreatorCol = await hasIdUsuarioCreadorColumn();
      const creatorColSql = hasCreatorCol ? 'IdUsuarioCreador,' : 'CAST(NULL AS INT) AS IdUsuarioCreador,';
      const isErpUser = userOrigen === 'ERP' || (!userId && !!userLogin);
      const erpAccess = isErpUser ? await getErpAreaAccess(userLogin) : { swNivel: 0, areas: [] };
      const effectiveSwNivel = tokenSwNivel || erpAccess.swNivel || 0;
      const privileged = isPrivilegedRole(userRole) || effectiveSwNivel >= 3;

      const whereParts = ['1 = 1'];
      const reqDb = getPool().request();

      if (area) {
        whereParts.push('ISNULL(P.AreaPP, \'\') = @Area');
        reqDb.input('Area', sql.NVarChar(80), area);
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
        reqDb.input('TextoLike', sql.NVarChar(260), `%${texto}%`);
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

      if (!privileged && isErpUser && effectiveSwNivel === 2) {
        if (erpAccess.areas.length > 0) {
          const areaClauses = [];
          erpAccess.areas.forEach((areaName, idx) => {
            const param = `AreaAcceso${idx}`;
            areaClauses.push(`LTRIM(RTRIM(ISNULL(P.AreaPP, ''))) = @${param}`);
            reqDb.input(param, sql.NVarChar(150), areaName);
          });
          whereParts.push(`(${areaClauses.join(' OR ')})`);
        } else {
          whereParts.push('1 = 0');
        }
      } else if (!privileged) {
        if (hasCreatorCol && userId) {
          whereParts.push('P.IdUsuarioCreador = @IdUsuarioCreador');
          reqDb.input('IdUsuarioCreador', sql.Int, userId);
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
          reqDb.input('DOI', sql.NVarChar(20), userDoi);
          reqDb.input('TrabajadorDoiLike', sql.NVarChar(220), userNombre ? `%${userNombre}%` : '');
          reqDb.input('UsuarioLogin', sql.NVarChar(80), userLogin);
        }
      }

      const whereSql = whereParts.join(' AND ');

      const countResult = await reqDb.query(`
        SELECT COUNT(1) AS total
        FROM TBL_GGHH_PapeletaPermiso P
        WHERE ${whereSql}
      `);
      const total = Number(countResult.recordset?.[0]?.total || 0);

      const reqData = getPool().request();
      if (area) reqData.input('Area', sql.NVarChar(80), area);
      if (texto) reqData.input('TextoLike', sql.NVarChar(260), `%${texto}%`);
      if (!privileged && isErpUser && effectiveSwNivel === 2) {
        erpAccess.areas.forEach((areaName, idx) => {
          reqData.input(`AreaAcceso${idx}`, sql.NVarChar(150), areaName);
        });
      } else if (!privileged) {
        if (hasCreatorCol && userId) {
          reqData.input('IdUsuarioCreador', sql.Int, userId);
        } else {
          reqData.input('DOI', sql.NVarChar(20), userDoi);
          reqData.input('TrabajadorDoiLike', sql.NVarChar(220), userNombre ? `%${userNombre}%` : '');
          reqData.input('UsuarioLogin', sql.NVarChar(80), userLogin);
        }
      }
      reqData.input('OffsetRows', sql.Int, offset);
      reqData.input('FetchRows', sql.Int, pageSize);

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
      if (!paginated) {
        return res.json(result.recordset);
      }

      return res.json({
        success: true,
        data: result.recordset,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize))
        }
      });
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/papeletas/exportar-excel', async (req, res) => {
    try {
      const mes = Number(req.query?.mes);
      const anio = Number(req.query?.anio);
      const area = String(req.query?.area || '').trim();
      const texto = String(req.query?.texto || '').trim();
      const estado = String(req.query?.estado || 'todas').trim().toLowerCase();
      const mostrarAnulados = String(req.query?.mostrarAnulados || '').trim().toLowerCase() === 'true';
      const userRole = req.user?.rol || req.user?.Rol || req.user?.role || '';
      const userId = Number(req.user?.id || req.user?.IdUsuario || req.user?.idUsuario || 0) || null;
      const userLogin = String(
        req.user?.usuario ||
        req.user?.Usuario ||
        ''
      ).trim();
      const userOrigen = String(req.user?.origen || '').trim().toUpperCase();
      const tokenSwNivel = Number(req.user?.sw_nivel || 0) || 0;
      const isErpUser = userOrigen === 'ERP' || (!userId && !!userLogin);
      const erpAccess = isErpUser ? await getErpAreaAccess(userLogin) : { swNivel: 1, areas: [] };
      const effectiveSwNivel = tokenSwNivel || erpAccess.swNivel || 0;
      // Re-evaluar privileged con el effectiveSwNivel
      const privileged = isPrivilegedRole(userRole) || effectiveSwNivel >= 3;
      const userDoi = String(
        req.user?.doi ||
        req.user?.DOI ||
        req.user?.dni ||
        req.user?.DNI ||
        ''
      ).trim();
      const userNombre = String(
        req.user?.nombre ||
        req.user?.Nombre ||
        req.user?.NombreCompleto ||
        req.user?.usuario ||
        req.user?.Usuario ||
        ''
      ).trim();

      if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
        return res.status(400).json({ success: false, message: 'Mes invÃ¡lido. Use valores del 1 al 12.' });
      }
      if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
        return res.status(400).json({ success: false, message: 'AÃ±o invÃ¡lido.' });
      }

      const hasCreatorCol = await hasIdUsuarioCreadorColumn();
      let roleSql = '';
      let estadoSql = '';
      let activoSql = '';
      const request = getPool().request()
        .input('Mes', sql.Int, mes)
        .input('Anio', sql.Int, anio)
        .input('Area', sql.NVarChar(60), area)
        .input('TextoLike', sql.NVarChar(260), texto ? `%${texto}%` : '');

      if (mostrarAnulados) {
        activoSql = ` AND ISNULL(P.ActivoPP, '1') = '2'`;
      } else {
        activoSql = ` AND ISNULL(P.ActivoPP, '1') = '1'`;
      }

      if (estado === 'pendientes') {
        estadoSql = ` AND ISNULL(P.EstadoAprobacion, 'PENDIENTE') = 'PENDIENTE'`;
      } else if (estado === 'aprobadas') {
        estadoSql = ` AND ISNULL(P.EstadoAprobacion, 'PENDIENTE') IN ('APROBADO_JEFE', 'APROBADO_RRHH')`;
      } else if (estado === 'rechazadas') {
        estadoSql = ` AND ISNULL(P.EstadoAprobacion, 'PENDIENTE') = 'RECHAZADO'`;
      }

      if (!privileged) {
        if (isErpUser && effectiveSwNivel === 2) {
          if (erpAccess.areas.length > 0) {
            const areaClauses = [];
            erpAccess.areas.forEach((areaName, idx) => {
              const param = `AreaAcceso${idx}`;
              areaClauses.push(`LTRIM(RTRIM(ISNULL(P.AreaPP, ''))) = @${param}`);
              request.input(param, sql.NVarChar(150), areaName);
            });
            roleSql = ` AND (${areaClauses.join(' OR ')})`;
          } else {
            roleSql = ' AND 1 = 0'; // No areas, no access
          }
        } else if (hasCreatorCol && userId) {
          roleSql = ' AND P.IdUsuarioCreador = @IdUsuarioCreador';
          request.input('IdUsuarioCreador', sql.Int, userId);
        } else {
          roleSql = `
            AND (
              (@DOI <> '' AND P.DOIPP = @DOI)
              OR
              (@TrabajadorDoiLike <> '' AND P.TrabajadorPP LIKE @TrabajadorDoiLike)
              OR
              (
                @UsuarioLogin <> ''
                AND EXISTS (
                  SELECT 1
                  FROM TBL_AUDITORIA A0
                  WHERE A0.Tabla = 'TBL_GGHH_PapeletaPermiso'
                    AND A0.IdRegistro = P.IdPP
                    AND A0.Accion = 'CREAR'
                    AND (A0.Usuario = @UsuarioLogin OR A0.NombreUsuario = @UsuarioLogin)
                )
              )
            )
          `;
          request.input('DOI', sql.NVarChar(20), userDoi);
          request.input('TrabajadorDoiLike', sql.NVarChar(220), userNombre ? `%${userNombre}%` : '');
          request.input('UsuarioLogin', sql.NVarChar(80), userLogin);
        }
      }

      const result = await request
        .query(`
          DECLARE @Desde DATE = DATEFROMPARTS(@Anio, @Mes, 1);
          DECLARE @Hasta DATE = DATEADD(MONTH, 1, @Desde);

          SELECT
            P.IdPP,
            P.FechaRegistroPP,
            UsuarioRegistro = COALESCE(NULLIF(AC.NombreUsuario, ''), NULLIF(AC.Usuario, ''), 'SIN USUARIO'),
            P.FechaModificacionPP,
            UsuarioModificacion = COALESCE(
              NULLIF(AU.NombreUsuario, ''),
              NULLIF(AU.Usuario, ''),
              COALESCE(NULLIF(AC.NombreUsuario, ''), NULLIF(AC.Usuario, ''), 'SIN USUARIO')
            ),
            P.FechaEmisionPP,
            P.FechaPermisoPP,
            P.NumeroPP,
            P.DOIPP,
            P.TrabajadorPP,
            P.CargoPP,
            P.AreaPP,
            P.MotivoPP,
            P.ConsiderarPP,
            P.HSalidaPP,
            P.HRetornoPP,
            P.TiempoPP,
            P.ObservacionesPP,
            P.ActivoPP,
            ISNULL(P.EstadoAprobacion, 'PENDIENTE') AS EstadoAprobacion
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
          OUTER APPLY (
            SELECT TOP 1
              A.Usuario,
              A.NombreUsuario
            FROM TBL_AUDITORIA A
            WHERE A.Tabla = 'TBL_GGHH_PapeletaPermiso'
              AND A.IdRegistro = P.IdPP
              AND A.Accion = 'EDITAR'
            ORDER BY A.IdAuditoria DESC
          ) AU
          WHERE P.FechaPermisoPP >= @Desde
            AND P.FechaPermisoPP < @Hasta
            ${activoSql}
            ${estadoSql}
            AND (@Area = '' OR P.AreaPP = @Area)
            AND (
              @TextoLike = ''
              OR P.TrabajadorPP LIKE @TextoLike
              OR P.DOIPP LIKE @TextoLike
              OR P.CargoPP LIKE @TextoLike
              OR P.AreaPP LIKE @TextoLike
              OR P.MotivoPP LIKE @TextoLike
              OR P.ConsiderarPP LIKE @TextoLike
            )
            ${roleSql}
          ORDER BY P.FechaPermisoPP DESC, P.NumeroPP DESC
        `);

      // Segunda barrera: garantizar filtro mes/aÃ±o en memoria (evita fugas por datos/plantilla).
      const rowsFiltradas = (result.recordset || []).filter((row) => {
        const parts = getDateParts(row.FechaPermisoPP);
        const isActive = String(row?.ActivoPP ?? '1') === '1';
        const isAnulado = String(row?.ActivoPP ?? '1') === '2';
        const matchesActivo = mostrarAnulados ? isAnulado : isActive;

        const rowEstado = String(row?.EstadoAprobacion || 'PENDIENTE').toUpperCase();
        let matchesEstado = true;
        if (estado === 'pendientes') matchesEstado = rowEstado === 'PENDIENTE';
        else if (estado === 'aprobadas') matchesEstado = rowEstado === 'APROBADO_JEFE' || rowEstado === 'APROBADO_RRHH';
        else if (estado === 'rechazadas') matchesEstado = rowEstado === 'RECHAZADO';

        const rowArea = String(row?.AreaPP || '').trim();
        const matchesArea = !area || rowArea === area;

        const blob = [
          row?.TrabajadorPP, row?.DOIPP, row?.CargoPP, row?.AreaPP,
          row?.MotivoPP, row?.ConsiderarPP
        ].map((x) => String(x || '').toLowerCase()).join(' | ');
        const matchesTexto = !texto || blob.includes(texto.toLowerCase());

        return !!parts
          && parts.year === anio
          && parts.month === mes
          && matchesActivo
          && matchesEstado
          && matchesArea
          && matchesTexto;
      });

      const workbook = new ExcelJS.Workbook();
      const templateCandidates = [
        process.env.EXCEL_TEMPLATE_PATH,
        path.join(backendDir, 'templates', 'PAPELETA DE PERMISO FORMATO.xlsx'),
        path.join(backendDir, '..', 'templates', 'PAPELETA DE PERMISO FORMATO.xlsx')
      ].filter(Boolean);

      const templatePath = templateCandidates.find((p) => fs.existsSync(p));
      let ws = null;

      if (templatePath) {
        await workbook.xlsx.readFile(templatePath);
        ws = workbook.getWorksheet('Hoja2') || workbook.worksheets[0];

        // Evita exportar hojas antiguas del template con datos históricos.
        // Dejamos solo la hoja de salida seleccionada.
        for (const sh of [...workbook.worksheets]) {
          if (sh.id !== ws.id) workbook.removeWorksheet(sh.id);
        }
      } else {
        ws = workbook.addWorksheet('Reporte');
        ws.columns = [
          { header: 'ITEM', key: 'ITEM', width: 8 },
          { header: 'ID_PP', key: 'ID_PP', width: 10 },
          { header: 'FECHA_REGISTRO', key: 'FECHA_REGISTRO', width: 14 },
          { header: 'USUARIO_REGISTRO', key: 'USUARIO_REGISTRO', width: 24 },
          { header: 'FECHA_MODIFICACION', key: 'FECHA_MODIFICACION', width: 16 },
          { header: 'USUARIO_MODIFICACION', key: 'USUARIO_MODIFICACION', width: 24 },
          { header: 'FECHA_EMISION', key: 'FECHA_EMISION', width: 14 },
          { header: 'FECHA_PERMISO', key: 'FECHA_PERMISO', width: 14 },
          { header: 'NUMERO_PP', key: 'NUMERO_PP', width: 10 },
          { header: 'DOI', key: 'DOI', width: 12 },
          { header: 'TRABAJADOR', key: 'TRABAJADOR', width: 36 },
          { header: 'CARGO', key: 'CARGO', width: 30 },
          { header: 'AREA', key: 'AREA', width: 30 },
          { header: 'MOTIVO', key: 'MOTIVO', width: 40 },
          { header: 'CONSIDERAR', key: 'CONSIDERAR', width: 34 },
          { header: 'SALIDA', key: 'SALIDA', width: 10 },
          { header: 'RETORNO', key: 'RETORNO', width: 10 },
          { header: 'TIEMPO', key: 'TIEMPO', width: 10 },
          { header: 'OBSERVACIONES', key: 'OBSERVACIONES', width: 42 },
          { header: 'ACTIVO', key: 'ACTIVO', width: 8 }
        ];
      }

      const header1 = String(ws.getRow(1).getCell(1).value || '').trim().toUpperCase();
      const header2 = String(ws.getRow(1).getCell(2).value || '').trim().toUpperCase();
      const header3 = String(ws.getRow(1).getCell(3).value || '').trim().toUpperCase();
      if (header1 === 'ELIMINAR' && header2 === 'EDITAR' && header3 === 'IMPRIMIR') {
        ws.spliceColumns(1, 3);
      }
      // Asegurar encabezados de usuario aunque el template tenga columnas antiguas "PC_*"
      ws.getRow(1).getCell(4).value = 'USUARIO_REGISTRO';
      ws.getRow(1).getCell(6).value = 'USUARIO_MODIFICACION';
      ws.getRow(1).getCell(14).value = 'MOTIVO_DESCRIPTIVO';
      ws.getRow(1).getCell(15).value = 'CONSIDERAR_DESCRIPTIVO';

      const templateStyles = [];
      const styleSourceRow = ws.getRow(2);
      for (let col = 1; col <= 20; col++) {
        templateStyles[col] = JSON.parse(JSON.stringify(styleSourceRow.getCell(col).style || {}));
      }

      const fmtDate = (v) => {
        if (!v) return '';
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return '';
        return d;
      };

      const fmtTime = (v) => {
        if (!v) return '';

        if (v instanceof Date && !Number.isNaN(v.getTime())) {
          // Time-only values from SQL can shift if read in local TZ.
          // Use UTC components to keep exact HH:mm:ss.
          const hh = String(v.getUTCHours()).padStart(2, '0');
          const mm = String(v.getUTCMinutes()).padStart(2, '0');
          const ss = String(v.getUTCSeconds()).padStart(2, '0');
          return `${hh}:${mm}:${ss}`;
        }

        const s = String(v).trim();
        const m = s.match(/(\d{2}):(\d{2})(?::(\d{2}))?/);
        if (!m) return s;
        const hh = String(Number(m[1] || 0)).padStart(2, '0');
        const mm = String(Number(m[2] || 0)).padStart(2, '0');
        const ss = String(Number(m[3] || 0)).padStart(2, '0');
        return `${hh}:${mm}:${ss}`;
      };

      const fmtUser = (v) => {
        const s = String(v || '').trim();
        if (!s) return 'SIN USUARIO';
        // Evitar mostrar identificador de mÃ¡quina en el Excel
        if (/^PC[\-_ ]/i.test(s)) return 'SIN USUARIO';
        return s;
      };
      const fmtMotivo = (v) => String(v || '').replace(/\s+/g, ' ').trim();

      const fmtConsiderar = (v) => {
        const raw = String(v || '').trim();
        if (!raw) return '';

        const match = raw.match(/^([^:]+):\s*(.+)$/);
        if (match) {
          const tipo = String(match[1] || '').trim();
          const detalle = String(match[2] || '').trim();
          return detalle ? `${tipo}: ${detalle}` : tipo;
        }

        if (/^(?:1\/2\s*dia\s*)?a cuenta de vacaciones$/i.test(raw)) return '1/2 dia a cuenta de vacaciones';
        if (/^vacaciones$/i.test(raw)) return 'Vacaciones';
        if (/^compensaci[oó]n$/i.test(raw)) return 'Compensacion';
        return raw;
      };
      if (ws.rowCount > 1) {
        ws.spliceRows(2, ws.rowCount - 1);
      }
      // Si el template trae tablas/rangos con datos antiguos, se limpian.
      if (ws.model && Array.isArray(ws.model.tables) && ws.model.tables.length > 0) {
        ws.model.tables = [];
      }

      let item = 1;
      for (const row of rowsFiltradas) {
        const newRow = ws.addRow([
          item++,
          row.IdPP || '',
          fmtDate(row.FechaRegistroPP),
          fmtUser(row.UsuarioRegistro),
          fmtDate(row.FechaModificacionPP),
          fmtUser(row.UsuarioModificacion),
          fmtDate(row.FechaEmisionPP),
          fmtDate(row.FechaPermisoPP),
          row.NumeroPP || '',
          row.DOIPP || '',
          row.TrabajadorPP || '',
          row.CargoPP || '',
          row.AreaPP || '',
          fmtMotivo(row.MotivoPP),
          fmtConsiderar(row.ConsiderarPP),
          fmtTime(row.HSalidaPP),
          fmtTime(row.HRetornoPP),
          fmtTime(row.TiempoPP),
          row.ObservacionesPP || '',
          String(row.ActivoPP || '') === '1' ? 'SI' : 'NO'
        ]);

        for (let col = 1; col <= 20; col++) {
          if (templateStyles[col]) {
            newRow.getCell(col).style = JSON.parse(JSON.stringify(templateStyles[col]));
          }
        }
        // Forzar formato de hora visible en Excel (evita 01/01/1970).
        [16, 17, 18].forEach((timeCol) => {
          const cell = newRow.getCell(timeCol);
          cell.numFmt = '@';
          cell.value = String(cell.value || '');
        });
      }

      ws.getRow(1).font = ws.getRow(1).font || { bold: true };
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: 20 }
      };

      const nombreArchivo = `reporte_papeletas_${anio}_${String(mes).padStart(2, '0')}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Error exportando Excel de papeletas:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: error.message });
      }
    }
  });

  app.get('/api/papeletas/ultimo-numero', async (req, res) => {
    try {
      const result = await getPool().request().query(`
        SELECT TOP 1 NumeroPP
        FROM TBL_GGHH_PapeletaPermiso
        ORDER BY NumeroPP DESC
      `);
      const ultimo = result.recordset.length > 0 ? result.recordset[0].NumeroPP : 0;
      res.json({ ultimoNumero: ultimo });
    } catch (error) {
      console.error('âŒ Error obteniendo Ãºltimo nÃºmero:', error);
      res.status(500).json({ success: false, message: 'Error obteniendo Ãºltimo nÃºmero: ' + error.message });
    }
  });

  app.post('/api/papeletas/insertar', async (req, res) => {
    const p = req.body;
    try {
      let horaSalida, horaRetorno, tiempo;
      try {
        horaSalida = convertirHoraSQL(p.HSalidaPP, 'HSalidaPP');
        horaRetorno = convertirHoraSQL(p.HRetornoPP, 'HRetornoPP');
        tiempo = convertirHoraSQL(p.TiempoPP, 'TiempoPP');
      } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
      }
      if (!horaSalida) {
        return res.status(400).json({ success: false, message: "Validation failed for parameter 'HSalidaPP'. La hora de salida es obligatoria." });
      }

      let numeroCorrelativo = 0;
      let inserted = {};
      const userIdToken = Number(req.user?.id || req.user?.IdUsuario || req.user?.idUsuario || 0) || null;
      const userLogin = String(req.user?.usuario || req.user?.Usuario || '').trim();
      let idUsuarioCreador = userIdToken;
      let idInsertado = null;
      const tx = new sql.Transaction(getPool());

      try {
        await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const conflictoHorario = await findHorarioConflict({
          tx,
          doi: p.DOIPP,
          fechaPermiso: p.FechaPermisoPP,
          horaSalida,
          horaRetorno
        });
        if (conflictoHorario) {
          throw new Error(`Ya existe una papeleta activa para este trabajador con cruce de horario en la fecha seleccionada. Papeleta N° ${conflictoHorario.NumeroPP || conflictoHorario.IdPP}.`);
        }

        const seqResult = await new sql.Request(tx).query(`
          SELECT ISNULL(MAX(NumeroPP), 0) + 1 AS NextNumero
          FROM TBL_GGHH_PapeletaPermiso WITH (UPDLOCK, HOLDLOCK)
        `);
        numeroCorrelativo = Number(seqResult.recordset?.[0]?.NextNumero || 1);

        const result = await new sql.Request(tx)
          .input('FechaRegistroPP', sql.DateTime, parseDateTimeInput(p.FechaRegistroPP, 'FechaRegistroPP'))
          .input('PcRegistroPP', sql.VarChar(50), String(p.PcRegistroPP || '').trim())
          .input('FechaModificacionPP', sql.DateTime, parseDateTimeInput(p.FechaModificacionPP, 'FechaModificacionPP'))
          .input('PcModificacionPP', sql.VarChar(50), String(p.PcModificacionPP || '').trim())
          .input('FechaEmisionPP', sql.DateTime, parseDateTimeInput(p.FechaEmisionPP, 'FechaEmisionPP'))
          .input('FechaPermisoPP', sql.Date, parseDateTimeInput(p.FechaPermisoPP, 'FechaPermisoPP', { dateOnly: true }))
          .input('NumeroPP', sql.Int, numeroCorrelativo)
          .input('DOIPP', sql.VarChar(20), String(p.DOIPP || '').trim())
          .input('TrabajadorPP', sql.VarChar(150), String(p.TrabajadorPP || '').trim())
          .input('CargoPP', sql.VarChar(100), String(p.CargoPP || '').trim())
          .input('AreaPP', sql.VarChar(100), String(p.AreaPP || '').trim())
          .input('MotivoPP', sql.VarChar(sql.MAX), String(p.MotivoPP || '').trim())
          .input('ConsiderarPP', sql.VarChar(100), String(p.ConsiderarPP || '').trim())
          .input('HSalidaPP', sql.Time(7), horaSalida)
          .input('HRetornoPP', sql.Time(7), horaRetorno)
          .input('TiempoPP', sql.Time(7), tiempo)
          .input('ObservacionesPP', sql.VarChar(sql.MAX), String(p.ObservacionesPP || '').trim())
          .input('ActivoPP', sql.Char(1), String(p.ActivoPP || '1').trim().slice(0, 1))
          .execute('insertar_PapeletaPermiso_gp');

        inserted = result?.recordset?.[0] || {};

        if (!idUsuarioCreador && userLogin) {
          const userLookup = await new sql.Request(tx)
            .input('Usuario', sql.NVarChar(80), userLogin)
            .query(`
              SELECT TOP 1 IdUsuario
              FROM TBL_USUARIOS
              WHERE Usuario = @Usuario
            `);
          idUsuarioCreador = Number(userLookup.recordset?.[0]?.IdUsuario || 0) || null;
        }

        if (idUsuarioCreador) {
          const hasCreatorCol = await hasIdUsuarioCreadorColumn();
          if (hasCreatorCol) {
            idInsertado = Number(inserted.IdPP || 0) || null;
            if (!idInsertado && numeroCorrelativo > 0) {
              const qLast = await new sql.Request(tx)
                .input('NumeroPP', sql.Int, numeroCorrelativo)
                .input('DOIPP', sql.NVarChar(8), String(p.DOIPP || '').trim())
                .query(`
                  SELECT TOP 1 IdPP
                  FROM TBL_GGHH_PapeletaPermiso
                  WHERE NumeroPP = @NumeroPP
                    AND DOIPP = @DOIPP
                  ORDER BY IdPP DESC
                `);
              idInsertado = Number(qLast.recordset?.[0]?.IdPP || 0) || null;
            }

            if (idInsertado) {
              await new sql.Request(tx)
                .input('IdPP', sql.Int, idInsertado)
                .input('IdUsuarioCreador', sql.Int, idUsuarioCreador)
                .query(`UPDATE TBL_GGHH_PapeletaPermiso SET IdUsuarioCreador = @IdUsuarioCreador WHERE IdPP = @IdPP`);
            }
          }
        }

        idInsertado = idInsertado || Number(inserted.IdPP || 0) || null;
        if (idInsertado) {
          const { hasFechaVacDesdePP, hasFechaVacHastaPP } = await getVacacionesColumnsAvailability();
          if (hasFechaVacDesdePP && hasFechaVacHastaPP) {
            const { desde, hasta } = extractVacacionesRange(p);
            await new sql.Request(tx)
              .input('IdPP', sql.Int, idInsertado)
              .input('FechaVacDesdePP', sql.Date, desde)
              .input('FechaVacHastaPP', sql.Date, hasta)
              .query(`
                UPDATE TBL_GGHH_PapeletaPermiso
                SET FechaVacDesdePP = @FechaVacDesdePP,
                    FechaVacHastaPP = @FechaVacHastaPP
                WHERE IdPP = @IdPP
              `);
          }
        }

        if (idInsertado) {
          const registroNuevoAuditoria = {
            IdPP: idInsertado,
            NumeroPP: inserted.NumeroPP || numeroCorrelativo || null,
            DOIPP: p.DOIPP || '',
            TrabajadorPP: p.TrabajadorPP || '',
            FechaPermisoPP: p.FechaPermisoPP || null,
            EstadoAprobacion: 'PENDIENTE'
          };

          await registrarAuditoria(() => new sql.Request(tx), {
            tabla: 'TBL_GGHH_PapeletaPermiso',
            idRegistro: idInsertado,
            accion: 'CREAR',
            usuario: req.user?.usuario || null,
            nombreUsuario: req.user?.nombre || null,
            ip: getClientIp(req),
            navegador: req.headers['user-agent'] || null,
            datosNuevos: JSON.stringify(registroNuevoAuditoria),
            observaciones: 'Registro de papeleta'
          });

          await crearNotificacionRRHH(() => new sql.Request(tx), {
            titulo: 'Nueva papeleta pendiente',
            mensaje: `Papeleta N° ${registroNuevoAuditoria.NumeroPP || ''} registrada por ${p.TrabajadorPP || req.user?.nombre || req.user?.usuario || 'usuario'}.`,
            tipo: 'INFO',
            idPapeleta: idInsertado,
            url: '/HTML/permisos.html'
          });
        }

        await tx.commit();
        porEstadoCache.expiresAt = 0;
      } catch (txErr) {
        try { await tx.rollback(); } catch {}
        throw txErr;
      }

      res.json({
        success: true,
        message: 'Papeleta registrada correctamente',
        id: inserted.IdPP || null,
        numero: inserted.NumeroPP || numeroCorrelativo || null
      });
    } catch (err) {
      console.error('Error:', err.message);
      const friendlyMessage = getFriendlySqlErrorMessage(err);
      const statusCode = friendlyMessage === err.message ? 500 : 409;
      res.status(statusCode).json({ success: false, message: friendlyMessage });
    }
  });

  app.put('/api/papeletas/editar', async (req, res) => {
    const p = req.body;
    try {
      const previoResult = await getPool().request()
        .input('IdPP', sql.Int, Number(p.IdPP))
        .query(`SELECT TOP 1 * FROM TBL_GGHH_PapeletaPermiso WHERE IdPP = @IdPP`);
      const previo = previoResult.recordset?.[0] || null;
      if (!previo) {
        return res.status(404).json({ success: false, message: 'Papeleta no encontrada' });
      }

      if (!assertPolicy(canEditPapeleta(req.user, previo), res)) {
        return;
      }

      let horaSalida, horaRetorno, tiempo;
      try {
        horaSalida = convertirHoraSQL(p.HSalidaPP, 'HSalidaPP');
        horaRetorno = convertirHoraSQL(p.HRetornoPP, 'HRetornoPP');
        tiempo = convertirHoraSQL(p.TiempoPP, 'TiempoPP');
      } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
      }
      if (!horaSalida) {
        return res.status(400).json({ success: false, message: "Validation failed for parameter 'HSalidaPP'. La hora de salida es obligatoria." });
      }

      const conflictoHorario = await findHorarioConflict({
        doi: p.DOIPP,
        fechaPermiso: p.FechaPermisoPP,
        horaSalida,
        horaRetorno,
        excludeId: p.IdPP
      });
      if (conflictoHorario) {
        return res.status(409).json({
          success: false,
          message: `Ya existe una papeleta activa para este trabajador con cruce de horario en la fecha seleccionada. Papeleta N° ${conflictoHorario.NumeroPP || conflictoHorario.IdPP}.`
        });
      }

      await getPool().request()
        .input('IdPP', sql.Int, p.IdPP)
        .input('FechaModificacionPP', sql.DateTime, parseDateTimeInput(p.FechaModificacionPP, 'FechaModificacionPP'))
        .input('PcModificacionPP', sql.VarChar(50), String(p.PcModificacionPP || '').trim())
        .input('FechaPermisoPP', sql.Date, parseDateTimeInput(p.FechaPermisoPP, 'FechaPermisoPP', { dateOnly: true }))
        .input('NumeroPP', sql.Int, p.NumeroPP)
        .input('DOIPP', sql.VarChar(20), String(p.DOIPP || '').trim())
        .input('TrabajadorPP', sql.VarChar(150), String(p.TrabajadorPP || '').trim())
        .input('CargoPP', sql.VarChar(100), String(p.CargoPP || '').trim())
        .input('AreaPP', sql.VarChar(100), String(p.AreaPP || '').trim())
        .input('MotivoPP', sql.VarChar(sql.MAX), String(p.MotivoPP || '').trim())
        .input('ConsiderarPP', sql.VarChar(100), String(p.ConsiderarPP || '').trim())
        .input('HSalidaPP', sql.Time(7), horaSalida)
        .input('HRetornoPP', sql.Time(7), horaRetorno)
        .input('TiempoPP', sql.Time(7), tiempo)
        .input('ObservacionesPP', sql.VarChar(sql.MAX), String(p.ObservacionesPP || '').trim())
        .input('ActivoPP', sql.Char(1), String(p.ActivoPP || '1').trim().slice(0, 1))
        .execute('editar_PapeletaPermiso_gp');

      const { hasFechaVacDesdePP, hasFechaVacHastaPP } = await getVacacionesColumnsAvailability();
      if (hasFechaVacDesdePP && hasFechaVacHastaPP) {
        const { desde, hasta } = extractVacacionesRange(p);
        await getPool().request()
          .input('IdPP', sql.Int, Number(p.IdPP))
          .input('FechaVacDesdePP', sql.Date, desde)
          .input('FechaVacHastaPP', sql.Date, hasta)
          .query(`
            UPDATE TBL_GGHH_PapeletaPermiso
            SET FechaVacDesdePP = @FechaVacDesdePP,
                FechaVacHastaPP = @FechaVacHastaPP
            WHERE IdPP = @IdPP
          `);
      }

      const actualizadoResult = await getPool().request()
        .input('IdPP', sql.Int, Number(p.IdPP))
        .query(`SELECT TOP 1 * FROM TBL_GGHH_PapeletaPermiso WHERE IdPP = @IdPP`);
      const actualizado = actualizadoResult.recordset?.[0] || null;

      await registrarAuditoria(() => getPool().request(), {
        tabla: 'TBL_GGHH_PapeletaPermiso',
        idRegistro: Number(p.IdPP),
        accion: 'EDITAR',
        usuario: req.user?.usuario || null,
        nombreUsuario: req.user?.nombre || null,
        ip: getClientIp(req),
        navegador: req.headers['user-agent'] || null,
        datosAnteriores: previo ? JSON.stringify(previo) : null,
        datosNuevos: actualizado ? JSON.stringify(actualizado) : JSON.stringify(p),
        observaciones: 'Actualización de papeleta'
      });
      porEstadoCache.expiresAt = 0;

      res.json({ success: true, message: 'Papeleta editada correctamente' });
    } catch (err) {
      console.error('Error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.delete('/api/papeletas/eliminar', async (req, res) => {
    const { IdPP } = req.body;
    try {
      const previoResult = await getPool().request()
        .input('IdPP', sql.Int, Number(IdPP))
        .query(`SELECT TOP 1 * FROM TBL_GGHH_PapeletaPermiso WHERE IdPP = @IdPP`);
      const previo = previoResult.recordset?.[0] || null;

      await getPool().request().input('IdPP', sql.Int, IdPP).execute('eliminar_PapeletaPermiso_gp');
      await getPool().request()
        .input('IdPP', sql.Int, Number(IdPP))
        .input('UsuarioRRHH', sql.NVarChar(50), req.user?.usuario || null)
        .query(`
          UPDATE TBL_GGHH_PapeletaPermiso
          SET EstadoAprobacion = 'RECHAZADO',
              AprobadoPorRRHH = COALESCE(AprobadoPorRRHH, @UsuarioRRHH),
              FechaAprobacionRRHH = COALESCE(FechaAprobacionRRHH, GETDATE()),
              RazonRechazo = COALESCE(RazonRechazo, 'Anulada desde el sistema')
          WHERE IdPP = @IdPP
        `);

      const actualizadoResult = await getPool().request()
        .input('IdPP', sql.Int, Number(IdPP))
        .query(`SELECT TOP 1 * FROM TBL_GGHH_PapeletaPermiso WHERE IdPP = @IdPP`);
      const actualizado = actualizadoResult.recordset?.[0] || null;

      await registrarAuditoria(() => getPool().request(), {
        tabla: 'TBL_GGHH_PapeletaPermiso',
        idRegistro: Number(IdPP),
        accion: 'ANULAR',
        usuario: req.user?.usuario || null,
        nombreUsuario: req.user?.nombre || null,
        ip: getClientIp(req),
        navegador: req.headers['user-agent'] || null,
        datosAnteriores: previo ? JSON.stringify(previo) : null,
        datosNuevos: actualizado ? JSON.stringify(actualizado) : null,
        observaciones: 'Papeleta marcada como inactiva'
      });
      porEstadoCache.expiresAt = 0;

      res.json({ success: true, message: 'Estado cambiado correctamente' });
    } catch (err) {
      console.error('âŒ Error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.patch('/api/papeletas/restaurar', requireAprobacionRole, async (req, res) => {
    const { IdPP } = req.body;
    try {
      const previoResult = await getPool().request()
        .input('IdPP', sql.Int, Number(IdPP))
        .query(`SELECT TOP 1 * FROM TBL_GGHH_PapeletaPermiso WHERE IdPP = @IdPP`);
      const previo = previoResult.recordset?.[0] || null;

      if (!previo) {
        return res.status(404).json({ success: false, message: 'Papeleta no encontrada' });
      }

      await getPool().request()
        .input('IdPP', sql.Int, Number(IdPP))
        .query(`
          UPDATE TBL_GGHH_PapeletaPermiso
          SET ActivoPP = '1',
              EstadoAprobacion = 'PENDIENTE',
              AprobadoPorRRHH = NULL,
              FechaAprobacionRRHH = NULL,
              RazonRechazo = NULL,
              FechaModificacionPP = GETDATE()
          WHERE IdPP = @IdPP
        `);

      const actualizadoResult = await getPool().request()
        .input('IdPP', sql.Int, Number(IdPP))
        .query(`SELECT TOP 1 * FROM TBL_GGHH_PapeletaPermiso WHERE IdPP = @IdPP`);
      const actualizado = actualizadoResult.recordset?.[0] || null;

      await registrarAuditoria(() => getPool().request(), {
        tabla: 'TBL_GGHH_PapeletaPermiso',
        idRegistro: Number(IdPP),
        accion: 'RESTAURAR',
        usuario: req.user?.usuario || null,
        nombreUsuario: req.user?.nombre || null,
        ip: getClientIp(req),
        navegador: req.headers['user-agent'] || null,
        datosAnteriores: previo ? JSON.stringify(previo) : null,
        datosNuevos: actualizado ? JSON.stringify(actualizado) : null,
        observaciones: 'Papeleta restaurada a pendiente'
      });
      porEstadoCache.expiresAt = 0;

      res.json({ success: true, message: 'Papeleta restaurada correctamente' });
    } catch (err) {
      console.error('Error al restaurar:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/papeletas/:id/historial', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ success: false, message: 'Id de papeleta invalido' });
      }

      const result = await getPool().request()
        .input('IdPP', sql.Int, id)
        .query(`
          SELECT
            IdAuditoria,
            Accion,
            Usuario,
            NombreUsuario,
            FechaHora,
            IP,
            Navegador,
            DatosAnteriores,
            DatosNuevos,
            Observaciones
          FROM TBL_AUDITORIA
          WHERE Tabla = 'TBL_GGHH_PapeletaPermiso'
            AND IdRegistro = @IdPP
          ORDER BY FechaHora DESC, IdAuditoria DESC
        `);

      return res.json({ success: true, data: result.recordset || [] });
    } catch (error) {
      console.error('Error cargando historial de papeleta:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/papeletas/reporte/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const result = await getPool().request().input('IdPP', sql.Int, id).execute('reporte_PapeletaPermiso_gp');
      res.json(result.recordset[0] || null);
    } catch (err) {
      console.error('âŒ Error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/papeletas/:id/pdf', async (req, res) => {
    const { id } = req.params;
    try {
      const paperRaw = String(req.query?.paper || 'A4').toUpperCase();
      const allowedPapers = new Set(['A4', 'A5']);
      const paper = allowedPapers.has(paperRaw) ? paperRaw : 'A4';

      const estadoResult = await getPool().request()
        .input('IdPP', sql.Int, id)
        .query(`
          SELECT TOP 1 ISNULL(EstadoAprobacion, 'PENDIENTE') AS EstadoAprobacion
          FROM TBL_GGHH_PapeletaPermiso
          WHERE IdPP = @IdPP
        `);
      const estadoActual = String(estadoResult.recordset?.[0]?.EstadoAprobacion || 'PENDIENTE').toUpperCase();
      if (!assertPolicy(canDownloadDocument(req.user, { EstadoAprobacion: estadoActual }), res)) {
        return;
      }

      const result = await getPool().request().input('IdPP', sql.Int, id).execute('reporte_PapeletaPermiso_gp');
      const reporte = result.recordset && result.recordset[0];
      if (!reporte) return res.status(404).json({ success: false, message: 'No se encontro la papeleta para generar PDF' });
      let vacacionesDesdePP = null;
      let vacacionesHastaPP = null;
      try {
        const { hasFechaVacDesdePP, hasFechaVacHastaPP } = await getVacacionesColumnsAvailability();
        if (hasFechaVacDesdePP && hasFechaVacHastaPP) {
          const vacResult = await getPool().request()
            .input('IdPP', sql.Int, id)
            .query(`
              SELECT TOP 1 FechaVacDesdePP, FechaVacHastaPP
              FROM TBL_GGHH_PapeletaPermiso
              WHERE IdPP = @IdPP
            `);
          vacacionesDesdePP = vacResult.recordset?.[0]?.FechaVacDesdePP || null;
          vacacionesHastaPP = vacResult.recordset?.[0]?.FechaVacHastaPP || null;
        }
      } catch (_) {}
      let creadorPapeletaNombre = '';
      try {
        const creadorResult = await getPool().request()
          .input('IdPP', sql.Int, id)
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
        creadorPapeletaNombre = String(creadorResult.recordset?.[0]?.Creador || '').trim();
      } catch (_) {
        const creadorFallback = await getPool().request()
          .input('IdPP', sql.Int, id)
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
        creadorPapeletaNombre = String(creadorFallback.recordset?.[0]?.Creador || '').trim();
      }

      const formatDate = (value, { useUTC = false } = {}) => {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
        const dd = String(useUTC ? date.getUTCDate() : date.getDate()).padStart(2, '0');
        const mm = String((useUTC ? date.getUTCMonth() : date.getMonth()) + 1).padStart(2, '0');
        const yy = useUTC ? date.getUTCFullYear() : date.getFullYear();
        return `${dd}/${mm}/${yy}`;
      };

      const formatTime = (value) => {
        if (!value) return '';
        const raw = String(value).trim();
        const match = raw.match(/(\d{2}:\d{2}:\d{2})/);
        return match ? match[1] : raw;
      };

      const normalizeMotivo = (value) => String(value || '').replace(/\s+/g, ' ').trim();

      const normalizeConsiderar = (value, vacDesde = null, vacHasta = null) => {
        const raw = String(value || '').trim();
        if (!raw) return '';
        const toDateParts = (v) => {
          const s = String(v || '').trim().replace(/\//g, '-');
          const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (!m) return null;
          return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
        };
        const diasInclusivos = (a, b) => {
          const ap = toDateParts(a);
          const bp = toDateParts(b);
          if (!ap || !bp) return null;
          const da = Date.UTC(ap.y, ap.m - 1, ap.d);
          const db = Date.UTC(bp.y, bp.m - 1, bp.d);
          if (Number.isNaN(da) || Number.isNaN(db) || db < da) return null;
          return Math.floor((db - da) / 86400000) + 1;
        };
        if (vacDesde && vacHasta) {
          const desdeTxt = formatDate(vacDesde, { useUTC: true });
          const hastaTxt = formatDate(vacHasta, { useUTC: true });
          const dias = diasInclusivos(desdeTxt.split('/').reverse().join('-'), hastaTxt.split('/').reverse().join('-'));
          if (dias) return `Vacaciones ${dias} dia${dias === 1 ? '' : 's'}`;
          return `Vacaciones del ${desdeTxt} al ${hastaTxt}`;
        }
        const fmtIso = (iso) => {
          const s = String(iso || '').trim().replace(/\//g, '-');
          const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (!m) return String(iso || '').trim();
          return `${m[3]}/${m[2]}/${m[1]}`;
        };
        const matchVacRange = raw.match(
          /vacaciones\s*:?\s*(\d{4}[-/]\d{2}[-/]\d{2}).*?(\d{4}[-/]\d{2}[-/]\d{2})/i
        );
        if (matchVacRange) {
          const dias = diasInclusivos(matchVacRange[1], matchVacRange[2]);
          if (dias) return `Vacaciones ${dias} dia${dias === 1 ? '' : 's'}`;
          return `Vacaciones del ${fmtIso(matchVacRange[1])} al ${fmtIso(matchVacRange[2])}`;
        }
        if (/^(?:1\/2\s*dia\s*)?a cuenta de vacaciones$/i.test(raw)) return '1/2 dia a cuenta de vacaciones';
        if (/^vacaciones$/i.test(raw)) return 'Vacaciones';
        if (/^compensaci[oó]n$/i.test(raw)) return 'Compensacion';
        return raw;
      };

      const pickFirstNonEmpty = (...values) => {
        for (const value of values) {
          const text = String(value || '').trim();
          if (text) return text;
        }
        return '';
      };

      const normalizeSignatureName = (value) => {
        const text = String(value || '').trim();
        if (!text) return '';
        if (text.includes('\\') || text.includes('@')) return '';
        if (!/\s/.test(text)) return '';
        return text;
      };

      const numero = reporte.NumeroPP || id;
      const data = {
        numero,
        doi: reporte.DOIPP || reporte.DOI || '',
        trabajador: reporte.TrabajadorPP || reporte.Trabajador || '',
        cargo: reporte.CargoPP || reporte.Cargo || reporte.Ocupacion || '',
        area: reporte.AreaPP || reporte.Area || '',
        motivo: normalizeMotivo(reporte.MotivoPP),
        considerar: normalizeConsiderar(reporte.ConsiderarPP, vacacionesDesdePP, vacacionesHastaPP),
        fechaEmision: formatDate(reporte.FechaEmisionPP || reporte.FechaRegistroPP || new Date()),
        // FechaPermisoPP es DATE en SQL; se formatea en UTC para evitar desfase por zona horaria.
        fechaPermiso: formatDate(reporte.FechaPermisoPP, { useUTC: true }),
        salida: formatTime(reporte.HSalidaPP),
        retorno: formatTime(reporte.HRetornoPP),
        tiempo: formatTime(reporte.TiempoPP),
        jefeFirmaNombre: normalizeSignatureName(pickFirstNonEmpty(
          creadorPapeletaNombre,
          reporte.JefeInmediato,
          reporte.NombreJefeInmediato,
          reporte.JefeInmediatoPP,
          reporte.NombreJefe,
          reporte.AprobadoPorJefe,
          reporte.UsuarioJefe
        ))
      };

      const copyLabels = ['Copia para Colaborador', 'Copia para Vigilancia'];

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="Papeleta_${numero}.pdf"`);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-PDF-Paper', paper);

      const sizeByPaper = {
        A4: 'A4',
        A5: 'A5'
      };
      const doc = new PDFDocument({
        size: sizeByPaper[paper] || 'A4',
        // Formato clasico amplio como el ejemplo.
        layout: 'landscape',
        margin: 14
      });
      doc.pipe(res);

      const page = doc.page;
      const pageW = page.width;
      const pageH = page.height;

      const sectionX = 14;
      const sectionW = pageW - (sectionX * 2);
      const sectionH = 184;
      const sectionGap = 10;

      const logoPath = path.join(backendDir, '..', 'img', 'logo-gp.png');
      const hasLogo = fs.existsSync(logoPath);

      const drawField = (label, value, x, y, labelW, lineW, fontSize = 8.5) => {
        const fitSingleLine = (input, maxWidth) => {
          let text = String(input || '').replace(/\s+/g, ' ').trim();
          if (!text) return '';
          if (doc.widthOfString(text) <= maxWidth) return text;
          const ellipsis = '...';
          while (text.length > 0 && (doc.widthOfString(text + ellipsis) > maxWidth)) {
            text = text.slice(0, -1);
          }
          return text ? `${text}${ellipsis}` : '';
        };
        doc.font('Helvetica-Bold').fontSize(fontSize).text(label, x, y, {
          width: labelW,
          lineBreak: false,
          ellipsis: true
        });
        const valueX = x + labelW;
        doc.font('Helvetica').fontSize(fontSize);
        const safeValue = fitSingleLine(value, Math.max(20, lineW - 6));
        doc.text(safeValue, valueX + 2, y, {
          width: Math.max(20, lineW - 4),
          lineBreak: false,
          height: fontSize + 2
        });
        doc.moveTo(valueX, y + 12).lineTo(valueX + lineW, y + 12).lineWidth(0.5).stroke();
      };

      const drawBox = (label, value, x, y, labelW, boxW, fontSize = 8.5, boxH = 14) => {
        doc.font('Helvetica-Bold').fontSize(fontSize).text(label, x, y, {
          width: labelW,
          lineBreak: false,
          ellipsis: true
        });
        const boxX = x + labelW;
        const boxY = y + 4;
        doc.rect(boxX, boxY, boxW, boxH).lineWidth(0.6).stroke();
        doc.font('Helvetica').fontSize(fontSize).text(value || '', boxX, boxY + 3, {
          width: boxW,
          align: 'center'
        });
      };

      const drawSection = (idx, yTop, labels, copiesCount) => {
        const titleFs = 12;
        const labelFs = 10;
        const fieldFs = 8.5;
        const signFs = 7;

        const leftX = sectionX + 2;

        const gap = Math.floor(sectionW * 0.02);
        const rightColW = Math.min(190, Math.max(160, Math.floor(sectionW * 0.30)));
        const leftColW = sectionW - rightColW - gap;
        const rightX = sectionX + leftColW + gap;

        const leftLabelW = Math.min(115, Math.floor(leftColW * 0.32));
        const leftLineW = Math.max(80, leftColW - leftLabelW - 6);

        const rightLabelW = Math.floor(rightColW * 0.46);
        const rightBoxW = Math.max(60, rightColW - rightLabelW);

        doc.font('Helvetica-Bold').fontSize(titleFs).text(
          `PAPELETA DE PERMISO N° ${String(data.numero).padStart(4, '0')}`,
          sectionX,
          yTop + 2,
          { width: leftColW, align: 'center', ellipsis: true }
        );
        doc.font('Helvetica-Bold').fontSize(labelFs).text('Fecha Emision:', rightX, yTop + 2, {
          width: rightLabelW,
          lineBreak: false,
          ellipsis: true
        });
        doc.rect(rightX + rightLabelW, yTop, rightBoxW, 16).lineWidth(0.7).stroke();
        doc.font('Helvetica').fontSize(labelFs).text(data.fechaEmision, rightX + rightLabelW, yTop + 4, { width: rightBoxW, align: 'center' });

        let y = yTop + 32;
        drawField('DOI:', data.doi, leftX, y, leftLabelW, leftLineW, fieldFs); y += 17;
        drawField('Nombres y Apellidos:', data.trabajador, leftX, y, leftLabelW, leftLineW, fieldFs); y += 17;
        drawField('Cargo:', data.cargo, leftX, y, leftLabelW, leftLineW, fieldFs); y += 17;
        drawField('Area:', data.area, leftX, y, leftLabelW, leftLineW, fieldFs); y += 17;
        drawField('Motivo del permiso:', data.motivo, leftX, y, leftLabelW, leftLineW, fieldFs); y += 17;
        drawField('A considerar:', data.considerar, leftX, y, leftLabelW, leftLineW, fieldFs);

        doc.font('Helvetica-Bold').fontSize(labelFs).text('Fecha Permiso:', rightX, yTop + 38, {
          width: rightLabelW,
          lineBreak: false,
          ellipsis: true
        });
        doc.rect(rightX + rightLabelW, yTop + 36, rightBoxW, 16).lineWidth(0.7).stroke();
        doc.font('Helvetica').fontSize(labelFs).text(data.fechaPermiso, rightX + rightLabelW, yTop + 40, { width: rightBoxW, align: 'center' });
        doc.font('Helvetica-Bold').fontSize(labelFs).text('Duracion del Permiso:', rightX, yTop + 58, {
          width: rightColW,
          lineBreak: false,
          ellipsis: true
        });

        drawBox('Salida:', data.salida, rightX, yTop + 78, rightLabelW, rightBoxW, fieldFs);
        drawBox('Retorno:', data.retorno, rightX, yTop + 98, rightLabelW, rightBoxW, fieldFs);
        drawBox('Tiempo:', data.tiempo, rightX, yTop + 118, rightLabelW, rightBoxW, fieldFs);

        const sigY = yTop + sectionH - 22;
        const sigGap = Math.floor(sectionW * 0.05);
        const sigLeft = sectionX + 10;
        const sigRight = sectionX + sectionW - 10;
        const sigTotalW = sigRight - sigLeft;
        const sigW = Math.floor((sigTotalW - sigGap * 2) / 3);
        const s1 = sigLeft;
        const s2 = s1 + sigW + sigGap;
        const s3 = s2 + sigW + sigGap;

        if (hasLogo) {
          const logoW = 26;
          const logoH = 26;
          // Mantener el logo dentro de la zona de firmas para que no invada "A considerar"
          const logoX = s1 + 6;
          const logoY = sigY - logoH - 4;
          doc.image(logoPath, logoX, logoY, { width: logoW, height: logoH });
        }

        doc.moveTo(s1, sigY).lineTo(s1 + sigW, sigY).lineWidth(0.7).stroke();
        doc.moveTo(s2, sigY).lineTo(s2 + sigW, sigY).lineWidth(0.7).stroke();
        doc.moveTo(s3, sigY).lineTo(s3 + sigW, sigY).lineWidth(0.7).stroke();

        if (data.jefeFirmaNombre) {
          doc.font('Helvetica').fontSize(Math.max(6.2, signFs + 0.2)).text(data.jefeFirmaNombre, s1, sigY - 9, { width: sigW, align: 'center', ellipsis: true });
        }
        doc.font('Helvetica').fontSize(signFs).text('V°B° Jefe Inmediato', s1, sigY + 3, { width: sigW, align: 'center' });
        doc.font('Helvetica').fontSize(signFs).text('V°B° Gestion Humana', s2, sigY + 3, { width: sigW, align: 'center' });
        doc.font('Helvetica').fontSize(signFs).text('Colaborador', s3, sigY + 3, { width: sigW, align: 'center' });
        doc.font('Helvetica-Bold').fontSize(signFs + 0.2).text(labels[idx] || labels[0], rightX, yTop + 142, { width: rightColW, align: 'right' });

        if (idx < copiesCount - 1) {
          const sepY = yTop + sectionH + 2;
          doc.moveTo(sectionX, sepY).lineTo(sectionX + sectionW, sepY).lineWidth(1.3).stroke();
        }
      };

      const labels = copyLabels;
      const copies = labels.length;
      const baseW = sectionW;
      const baseTotalH = (copies * sectionH) + ((copies - 1) * sectionGap);
      const availableW = pageW - (sectionX * 2);
      const availableH = pageH - 28;
      const scale = Math.min(availableW / baseW, availableH / baseTotalH);

      const drawX = (pageW - (baseW * scale)) / 2 - (sectionX * scale);
      const freeHUnscaled = Math.max(0, (availableH / scale) - baseTotalH);
      // Evitar huecos gigantes en vertical: solo expandir ligeramente el separador.
      const extraGapUnscaled = (copies > 1 && freeHUnscaled > 0)
        ? Math.min(26, freeHUnscaled / (copies - 1))
        : 0;
      const sectionStep = sectionH + sectionGap + extraGapUnscaled;
      const totalDrawUnscaled = (copies * sectionH) + ((copies - 1) * (sectionGap + extraGapUnscaled));
      const drawY = (pageH - (totalDrawUnscaled * scale)) / 2;

      for (let i = 0; i < copies; i++) {
        const y = i * sectionStep;
        doc.save();
        doc.translate(drawX, drawY + (y * scale));
        doc.scale(scale, scale);
        drawSection(i, 0, labels, copies);
        doc.restore();
      }

      doc.end();
    } catch (err) {
      console.error('? Error generando PDF inline:', err.message);
      if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
    }
  });


  app.get('/api/papeletas/por-estado', async (req, res) => {
    try {
      const now = Date.now();
      if (porEstadoCache.data && now < porEstadoCache.expiresAt) {
        return res.json(porEstadoCache.data);
      }

      const result = await getPool().request().query(`
        SELECT ISNULL(EstadoAprobacion, 'PENDIENTE') AS estado, COUNT(*) AS cantidad
        FROM TBL_GGHH_PapeletaPermiso
        WHERE ActivoPP = '1'
        GROUP BY EstadoAprobacion
        ORDER BY COUNT(*) DESC
      `);
      porEstadoCache.data = result.recordset || [];
      porEstadoCache.expiresAt = now + 10000;
      res.json(porEstadoCache.data);
    } catch (error) {
      console.error('âŒ Error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post('/api/papeletas/gestionar', requireAprobacionRole, async (req, res) => {
    const { IdPP, nuevoEstado, observacionesAdmin } = req.body;
    try {
      const estadosValidos = ['APROBADO_RRHH', 'RECHAZADO'];
      if (!estadosValidos.includes(nuevoEstado)) {
        return res.status(400).json({ success: false, message: 'Estado de aprobación no valido' });
      }

      const previoResult = await getPool().request()
        .input('IdPP', sql.Int, Number(IdPP))
        .query(`SELECT TOP 1 * FROM TBL_GGHH_PapeletaPermiso WHERE IdPP = @IdPP`);
      const previo = previoResult.recordset?.[0] || null;

      await getPool().request()
        .input('IdPP', sql.Int, Number(IdPP))
        .input('Estado', sql.NVarChar(20), nuevoEstado)
        .input('Obs', sql.NVarChar(sql.MAX), observacionesAdmin || '')
        .input('UsuarioRRHH', sql.NVarChar(50), req.user?.usuario || null)
        .query(`
          UPDATE TBL_GGHH_PapeletaPermiso
          SET EstadoAprobacion = @Estado,
              AprobadoPorRRHH = @UsuarioRRHH,
              FechaAprobacionRRHH = GETDATE(),
              RazonRechazo = CASE WHEN @Estado = 'RECHAZADO' THEN NULLIF(@Obs, '') ELSE NULL END,
              ObservacionesPP = CONCAT(
                ISNULL(ObservacionesPP,''),
                CASE WHEN LEN(ISNULL(@Obs,'')) > 0 THEN CONCAT(' | Nota RRHH: ', @Obs) ELSE '' END
              )
          WHERE IdPP = @IdPP
        `);

      const actualizadoResult = await getPool().request()
        .input('IdPP', sql.Int, Number(IdPP))
        .query(`SELECT TOP 1 * FROM TBL_GGHH_PapeletaPermiso WHERE IdPP = @IdPP`);
      const actualizado = actualizadoResult.recordset?.[0] || null;

      await registrarAuditoria(() => getPool().request(), {
        tabla: 'TBL_GGHH_PapeletaPermiso',
        idRegistro: Number(IdPP),
        accion: nuevoEstado === 'APROBADO_RRHH' ? 'APROBAR_RRHH' : 'RECHAZAR_RRHH',
        usuario: req.user?.usuario || null,
        nombreUsuario: req.user?.nombre || null,
        ip: getClientIp(req),
        navegador: req.headers['user-agent'] || null,
        datosAnteriores: previo ? JSON.stringify(previo) : null,
        datosNuevos: actualizado ? JSON.stringify(actualizado) : null,
        observaciones: observacionesAdmin || null
      });

      const destinoResult = await getPool().request()
        .input('IdPP', sql.Int, Number(IdPP))
        .query(`
          SELECT TOP 1 U.Usuario
          FROM TBL_GGHH_PapeletaPermiso P
          LEFT JOIN TBL_USUARIOS U ON U.IdUsuario = P.IdUsuarioCreador
          WHERE P.IdPP = @IdPP
        `);
      const usuarioDestino = destinoResult.recordset?.[0]?.Usuario || null;
      if (usuarioDestino) {
        const estadoTxt = nuevoEstado === 'APROBADO_RRHH' ? 'aprobada' : 'rechazada';
        await crearNotificacionUsuario(() => getPool().request(), {
          usuarioDestino,
          titulo: `Tu papeleta fue ${estadoTxt}`,
          mensaje: `La papeleta #${actualizado?.NumeroPP || IdPP} fue ${estadoTxt} por RRHH.`,
          tipo: nuevoEstado === 'APROBADO_RRHH' ? 'SUCCESS' : 'WARNING',
          idPapeleta: Number(IdPP),
          url: '/HTML/permisos.html'
        });
      }
      porEstadoCache.expiresAt = 0;

      res.json({
        success: true,
        message: `Papeleta ${nuevoEstado === 'APROBADO_RRHH' ? 'aprobada' : 'rechazada'} con exito`
      });
    } catch (error) {
      console.error('Error al gestionar papeleta:', error);
      res.status(500).json({ success: false, message: 'Error interno: ' + error.message });
    }
  });
}

module.exports = { registerPapeletasRoutes };
