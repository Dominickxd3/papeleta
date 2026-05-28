function registerCatalogosRoutes(app, deps) {
  const getPool = deps.getPool || (() => deps.pool);

  app.get('/api/tipos-permiso/listar', async (req, res) => {
    try {
      const result = await getPool().request()
        .query("SELECT * FROM TBL_TIPOS_PERMISO WHERE Activo = '1' ORDER BY Orden");
      res.json(result.recordset);
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/areas/listar', async (req, res) => {
    try {
      const result = await getPool().request().query(`
        SELECT DISTINCT
          LTRIM(RTRIM(Area)) AS NombreArea
        FROM dbo.TBL_GGHH_TrabajadorCache
        WHERE ISNULL(Activo, '0') = '1'
          AND NULLIF(LTRIM(RTRIM(Area)), '') IS NOT NULL
        ORDER BY NombreArea
      `);
      res.json(result.recordset || []);
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/estados/listar', async (req, res) => {
    try {
      const result = await getPool().request()
        .query('SELECT * FROM TBL_ESTADOS_PAPELETA ORDER BY Orden');
      res.json(result.recordset);
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/feriados/listar', async (req, res) => {
    try {
      const result = await getPool().request()
        .query("SELECT * FROM TBL_FERIADOS WHERE Activo = '1' ORDER BY Fecha");
      res.json(result.recordset);
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/configuracion/listar', async (req, res) => {
    try {
      const result = await getPool().request()
        .query('SELECT * FROM TBL_CONFIGURACION ORDER BY Categoria, Clave');
      res.json(result.recordset);
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/horarios/listar', async (req, res) => {
    try {
      const result = await getPool().request()
        .query("SELECT * FROM TBL_HORARIOS WHERE Activo = '1' ORDER BY NombreHorario");
      res.json(result.recordset);
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });
}

module.exports = { registerCatalogosRoutes };
