const { normalizeRole } = require('../middlewares/auth');

// Horario del personal: horario programado (SIGA), marcas del reloj y papeletas del dia.
// ADMIN / RRHH (o sw_nivel >= 3) ven a todos.
// Jefes (sw_nivel = 2) ven solo a los trabajadores de sus areas asignadas en
// TBL_USUARIO_ERP_AREA_APP (la misma regla que usa la bandeja de papeletas).
// El resto de usuarios no tiene acceso.

const PRIVILEGED_ROLES = new Set([
  'ADMIN',
  'ADMINISTRADOR',
  'ADMINISTRADOR DEL SISTEMA',
  'RRHH',
  'RR HH',
  'RECURSOS HUMANOS'
]);

const MAX_DIAS_RANGO = 62;

function parseFecha(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) return null;
  return d;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function registerHorariosRoutes(app, deps) {
  const { sql } = deps;
  const getPool = deps.getPool || (() => deps.pool);

  async function resolverAcceso(user) {
    const role = normalizeRole(user?.rol || user?.Rol || user?.role || '');
    const login = String(user?.usuario || user?.Usuario || '').trim();
    const tokenNivel = Number(user?.sw_nivel || 0) || 0;

    if (PRIVILEGED_ROLES.has(role) || tokenNivel >= 3) {
      return { todos: true, areas: [] };
    }
    if (!login) return { todos: false, areas: [], denegado: true };

    // Se lee el nivel y las areas en cada consulta: si RRHH cambia la
    // asignacion en Administrar, aplica sin volver a iniciar sesion.
    const userResult = await getPool().request()
      .input('UserLogon', sql.VarChar(80), login)
      .query(`
        SELECT TOP 1 sw_nivel, Activo
        FROM dbo.TBL_USUARIOS_ERP_APP
        WHERE UserLogon = @UserLogon
      `);
    const row = userResult.recordset?.[0];
    const activo = String(row?.Activo ?? '').trim();
    const nivel = Number(row?.sw_nivel || 0) || 0;
    if (!row || activo === '0' || activo === '2') return { todos: false, areas: [], denegado: true };
    if (nivel >= 3) return { todos: true, areas: [] };
    if (nivel !== 2) return { todos: false, areas: [], denegado: true };

    const areasResult = await getPool().request()
      .input('UserLogon', sql.VarChar(80), login)
      .query(`
        SELECT LTRIM(RTRIM(A.NombreAreaERP)) AS NombreAreaERP
        FROM dbo.TBL_USUARIO_ERP_AREA_APP UEA
        INNER JOIN dbo.TBL_AREAS_ERP_APP A ON A.IdAreaERP = UEA.IdAreaERP
        WHERE UEA.UserLogon = @UserLogon
          AND ISNULL(UEA.Activo, '1') = '1'
          AND ISNULL(A.Activo, '1') = '1'
      `);
    const areas = (areasResult.recordset || [])
      .map((r) => String(r.NombreAreaERP || '').trim())
      .filter(Boolean);
    return { todos: false, areas };
  }

  app.get('/api/horarios', async (req, res) => {
    try {
      const acceso = await resolverAcceso(req.user);
      if (acceso.denegado) {
        return res.status(403).json({ success: false, message: 'Acceso denegado' });
      }

      const hoy = new Date();
      const inicioMes = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), 1));
      const finHoy = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
      const desde = parseFecha(req.query?.desde) || inicioMes;
      const hasta = parseFecha(req.query?.hasta) || finHoy;

      if (hasta < desde) {
        return res.status(400).json({ success: false, message: 'La fecha "hasta" es menor que "desde"' });
      }
      const dias = Math.round((hasta - desde) / 86400000) + 1;
      if (dias > MAX_DIAS_RANGO) {
        return res.status(400).json({ success: false, message: `El rango máximo es de ${MAX_DIAS_RANGO} días` });
      }

      if (!acceso.todos && acceso.areas.length === 0) {
        return res.json({ success: true, desde: isoDate(desde), hasta: isoDate(hasta), areas: [], data: [] });
      }

      const reqDb = getPool().request()
        .input('Desde', sql.Date, isoDate(desde))
        .input('Hasta', sql.Date, isoDate(hasta));

      let areaSql = '';
      if (!acceso.todos) {
        const params = acceso.areas.map((areaName, idx) => {
          reqDb.input(`Area${idx}`, sql.NVarChar(150), areaName);
          return `@Area${idx}`;
        });
        areaSql = `AND H.AreaERP IN (${params.join(', ')})`;
      }

      const result = await reqDb.query(`
        SELECT
          H.AreaERP, H.Seccion, H.DNI, H.Trabajador, H.Cargo,
          CONVERT(char(10), H.Fecha, 23) AS Fecha,
          H.DiaSemana, H.Turno,
          H.HoraEntradaProgramada, H.HoraSalidaProgramada,
          H.Marca1, H.Marca2, H.Marca3, H.Marca4, H.CantidadMarcas,
          H.LugarEntrada, H.LugarSalida, H.MarcasManuales,
          H.MinutosTarde, H.MinutosSalidaAntes, H.HorasEntreMarcas,
          H.SinMarcas, H.Feriado,
          H.CantidadPapeletas, H.NumeroPapeleta, H.TipoPermiso,
          H.HorarioPermiso, H.MotivoPermiso, H.HorasPermiso
        FROM dbo.vw_Web_Horario_Personal H
        WHERE H.Fecha >= @Desde
          AND H.Fecha < DATEADD(day, 1, CAST(@Hasta AS datetime))
          ${areaSql}
        ORDER BY H.Fecha DESC, H.Trabajador
      `);

      return res.json({
        success: true,
        desde: isoDate(desde),
        hasta: isoDate(hasta),
        areas: acceso.todos ? null : acceso.areas,
        data: result.recordset || []
      });
    } catch (error) {
      console.error('Error consultando horarios:', error);
      return res.status(500).json({ success: false, message: 'No se pudo consultar el horario del personal' });
    }
  });
}

module.exports = { registerHorariosRoutes };
