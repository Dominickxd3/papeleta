function registerTrabajadoresRoutes(app, deps) {
  const { requireTrabajadoresRole } = deps;
  const getPool = deps.getPool || (() => deps.pool);

  async function queryTrabajadoresTodos() {
    return getPool().request().query(`
      SELECT
        CAST(IdTrabajadorERP AS INT) AS IdTrabajador,
        LTRIM(RTRIM(DOI)) AS DOI,
        Trabajador,
        Ocupacion,
        Area,
        CASE WHEN ISNULL(Activo, '0') = '1' THEN 'Activo' ELSE 'Inactivo' END AS Estado,
        ISNULL(Activo, '0') AS Activo
      FROM dbo.TBL_GGHH_TrabajadorCache
      ORDER BY Trabajador
    `);
  }

  async function queryTrabajadoresVigentes() {
    return getPool().request().query(`
      SELECT
        CAST(IdTrabajadorERP AS INT) AS IdTrabajador,
        LTRIM(RTRIM(DOI)) AS DOI,
        Trabajador,
        Ocupacion,
        Area,
        'Activo' AS Estado,
        '1' AS Activo
      FROM dbo.TBL_GGHH_TrabajadorCache
      WHERE ISNULL(Activo, '0') = '1'
      ORDER BY Trabajador
    `);
  }

  app.post('/api/trabajadores/insertar', requireTrabajadoresRole, async (req, res) => {
    return res.status(405).json({
      success: false,
      message: 'Alta manual deshabilitada. Los trabajadores se sincronizan desde ERP (cache).'
    });
  });

  app.put('/api/trabajadores/editar/:id', requireTrabajadoresRole, async (req, res) => {
    return res.status(405).json({
      success: false,
      message: 'Edicion manual deshabilitada. Los trabajadores se sincronizan desde ERP (cache).'
    });
  });

  app.delete('/api/trabajadores/eliminar/:id', requireTrabajadoresRole, async (req, res) => {
    return res.status(405).json({
      success: false,
      message: 'Eliminacion manual deshabilitada. Los trabajadores se sincronizan desde ERP (cache).'
    });
  });

  app.get('/api/trabajadores/mostrar', async (req, res) => {
    try {
      const result = await queryTrabajadoresVigentes();
      res.json(result.recordset);
    } catch (err) {
      console.error('Error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/trabajadores/listar', async (req, res) => {
    try {
      const result = await queryTrabajadoresTodos();
      res.json(result.recordset);
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/trabajadores/vigentes', async (req, res) => {
    try {
      const result = await queryTrabajadoresVigentes();
      res.json(result.recordset);
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/trabajadores/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ success: false, message: 'Id invalido' });
      }

      const result = await getPool().request()
        .input('IdTrabajador', deps.sql.Int, id)
        .query(`
          SELECT TOP 1
            CAST(IdTrabajadorERP AS INT) AS IdTrabajador,
            LTRIM(RTRIM(DOI)) AS DOI,
            Trabajador,
            Ocupacion,
            Area,
            CASE WHEN ISNULL(Activo, '0') = '1' THEN 'Activo' ELSE 'Inactivo' END AS Estado,
            ISNULL(Activo, '0') AS Activo
          FROM dbo.TBL_GGHH_TrabajadorCache
          WHERE IdTrabajadorERP = @IdTrabajador
        `);

      const item = result.recordset?.[0] || null;
      if (!item) return res.status(404).json({ success: false, message: 'Trabajador no encontrado' });
      return res.json(item);
    } catch (error) {
      console.error('Error obteniendo trabajador por id:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/trabajadores/dni/:dni', async (req, res) => {
    try {
      const dni = String(req.params.dni || '').trim();
      if (!dni) {
        return res.status(400).json({ success: false, message: 'DNI invalido' });
      }

      const result = await getPool().request()
        .input('DOI', deps.sql.NVarChar(20), dni)
        .query(`
          SELECT TOP 1
            CAST(IdTrabajadorERP AS INT) AS IdTrabajador,
            LTRIM(RTRIM(DOI)) AS DOI,
            Trabajador,
            Ocupacion,
            Area,
            CASE WHEN ISNULL(Activo, '0') = '1' THEN 'Activo' ELSE 'Inactivo' END AS Estado,
            ISNULL(Activo, '0') AS Activo
          FROM dbo.TBL_GGHH_TrabajadorCache
          WHERE LTRIM(RTRIM(DOI)) = @DOI
        `);

      const item = result.recordset?.[0] || null;
      if (!item) return res.status(404).json({ success: false, message: 'Trabajador no encontrado' });
      return res.json(item);
    } catch (error) {
      console.error('Error obteniendo trabajador por DNI:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/trabajadores/por-area', async (req, res) => {
    try {
      const result = await getPool().request().query(`
        SELECT
          LTRIM(RTRIM(Area)) AS Area,
          COUNT(*) AS cantidad
        FROM dbo.TBL_GGHH_TrabajadorCache
        WHERE ISNULL(Activo, '0') = '1'
          AND NULLIF(LTRIM(RTRIM(Area)), '') IS NOT NULL
        GROUP BY LTRIM(RTRIM(Area))
        ORDER BY COUNT(*) DESC
      `);
      res.json(result.recordset);
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post('/api/trabajadores/sync', requireTrabajadoresRole, async (req, res) => {
    try {
      await getPool().request().execute('sp_SyncTrabajadoresCache');
      const info = await getPool().request().query(`
        SELECT
          COUNT(*) AS total,
          MAX(FechaSync) AS ultimaSync
        FROM dbo.TBL_GGHH_TrabajadorCache
      `);

      const row = info.recordset?.[0] || {};
      res.json({
        success: true,
        message: 'Sincronizacion de trabajadores completada',
        total: Number(row.total || 0),
        ultimaSync: row.ultimaSync || null
      });
    } catch (error) {
      console.error('Error sincronizando cache de trabajadores:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });
}

module.exports = { registerTrabajadoresRoutes };
