function registerSystemRoutes(app, deps) {
  const { sql } = deps;
  const getPool = deps.getPool || (() => deps.pool);

  app.get('/api/estadisticas/general', async (req, res) => {
    try {
      const result = await getPool().request().query(`
        SELECT
          total = COUNT(1),
          hoy = SUM(CASE WHEN CONVERT(date, FechaRegistroPP) = CONVERT(date, GETDATE()) THEN 1 ELSE 0 END),
          pendientes = SUM(CASE WHEN ISNULL(EstadoAprobacion, 'PENDIENTE') = 'PENDIENTE' AND ISNULL(ActivoPP, '1') = '1' THEN 1 ELSE 0 END),
          pendientesRRHH = SUM(CASE WHEN ISNULL(EstadoAprobacion, 'PENDIENTE') IN ('PENDIENTE', 'APROBADO_JEFE') AND ISNULL(ActivoPP, '1') = '1' THEN 1 ELSE 0 END),
          aprobadas = SUM(CASE WHEN EstadoAprobacion = 'APROBADO_RRHH' AND ISNULL(ActivoPP, '1') = '1' THEN 1 ELSE 0 END),
          rechazadas = SUM(CASE WHEN EstadoAprobacion = 'RECHAZADO' AND ISNULL(ActivoPP, '1') = '1' THEN 1 ELSE 0 END),
          anuladas = SUM(CASE WHEN ISNULL(ActivoPP, '1') = '2' THEN 1 ELSE 0 END)
        FROM TBL_GGHH_PapeletaPermiso
      `);
      res.json(result.recordset[0]);
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/estadisticas/top-usuarios', async (req, res) => {
    try {
      const result = await getPool().request().query(`
        SELECT TOP 10
          usuario = COALESCE(U.Usuario, P.TrabajadorPP, 'SIN USUARIO'),
          nombre = COALESCE(U.NombreCompleto, P.TrabajadorPP, 'SIN USUARIO'),
          cantidad = COUNT(1)
        FROM TBL_GGHH_PapeletaPermiso P
        LEFT JOIN TBL_USUARIOS U
          ON U.IdUsuario = P.IdUsuarioCreador
        WHERE ISNULL(P.ActivoPP, '1') = '1'
        GROUP BY COALESCE(U.Usuario, P.TrabajadorPP, 'SIN USUARIO'),
                 COALESCE(U.NombreCompleto, P.TrabajadorPP, 'SIN USUARIO')
        ORDER BY COUNT(1) DESC
      `);
      return res.json(result.recordset);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api', (req, res) => {
    res.json({
      message: 'API Papeletas de Permiso - Grupo Pecuario',
      version: '2.1.0',
      endpoints: {
        auth: {
          login: 'POST /api/auth/login',
          verify: 'GET /api/auth/verify'
        },
        health: 'GET /api/health'
      }
    });
  });

  app.get('/api/health', (req, res) => {
    const currentPool = getPool();
    const isConnected = !!(currentPool && currentPool.connected);
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      connected: isConnected
    });
  });

  app.get('/api/health/database', async (req, res) => {
    try {
      const currentPool = getPool();
      if (!currentPool || !currentPool.connected) {
        return res.status(503).json({ status: 'ERROR', connected: false, message: 'Sin conexión activa a BD' });
      }

      await currentPool.request().query('SELECT 1 AS ok');
      return res.json({
        status: 'OK',
        connected: true,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return res.status(503).json({
        status: 'ERROR',
        connected: false,
        message: error.message
      });
    }
  });

  app.get('/api/estadisticas/por-area', async (req, res) => {
    try {
      const result = await getPool().request().query(`
        SELECT
          ISNULL(NULLIF(LTRIM(RTRIM(AreaPP)), ''), 'SIN AREA') AS area,
          COUNT(*) AS cantidad
        FROM TBL_GGHH_PapeletaPermiso
        WHERE ActivoPP = '1'
        GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(AreaPP)), ''), 'SIN AREA')
        ORDER BY COUNT(*) DESC
      `);
      return res.json(result.recordset);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/estadisticas/por-mes/:year', async (req, res) => {
    try {
      const year = Number(req.params.year);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ success: false, message: 'Año inválido' });
      }

      const result = await getPool().request()
        .input('Year', sql.Int, year)
        .query(`
          SELECT
            MONTH(FechaPermisoPP) AS mes,
            COUNT(*) AS cantidad
          FROM TBL_GGHH_PapeletaPermiso
          WHERE YEAR(FechaPermisoPP) = @Year
            AND ActivoPP = '1'
          GROUP BY MONTH(FechaPermisoPP)
          ORDER BY MONTH(FechaPermisoPP)
        `);

      return res.json(result.recordset);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });
}

module.exports = { registerSystemRoutes };
