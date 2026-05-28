function registerMonitoringRoutes(app, deps) {
  const { pool, sql, requireAprobacionRole } = deps;
  const getPool = deps.getPool || (() => deps.pool);

  app.get('/api/notificaciones/mias', async (req, res) => {
    try {
      const soloNoLeidas = String(req.query.soloNoLeidas || '').trim() === '1';
      const request = getPool().request()
        .input('Usuario', sql.VarChar(50), req.user?.usuario || '');

      const result = await request.query(`
        SELECT TOP 100
          IdNotificacion,
          UsuarioDestino,
          Titulo,
          Mensaje,
          Tipo,
          IdPapeleta,
          Leido,
          FechaCreacion,
          FechaLeido,
          URL
        FROM TBL_NOTIFICACIONES
        WHERE UsuarioDestino = @Usuario
          ${soloNoLeidas ? "AND ISNULL(Leido,'0') <> '1'" : ''}
        ORDER BY IdNotificacion DESC
      `);

      res.json({ success: true, data: result.recordset });
    } catch (error) {
      console.error('❌ Error listando notificaciones:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.put('/api/notificaciones/:id/leido', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: 'Id inválido' });

      await getPool().request()
        .input('IdNotificacion', sql.Int, id)
        .input('UsuarioDestino', sql.VarChar(50), req.user?.usuario || '')
        .query(`
          UPDATE TBL_NOTIFICACIONES
          SET Leido = '1',
              FechaLeido = GETDATE()
          WHERE IdNotificacion = @IdNotificacion
            AND UsuarioDestino = @UsuarioDestino
        `);

      res.json({ success: true, message: 'Notificación marcada como leída' });
    } catch (error) {
      console.error('❌ Error marcando notificación leída:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/auditoria/listar', requireAprobacionRole, async (req, res) => {
    try {
      const top = Math.max(1, Math.min(Number(req.query.top || 200), 1000));
      const result = await getPool().request()
        .input('TopRows', sql.Int, top)
        .query(`
          DECLARE @Audit TABLE (
            IdAuditoria BIGINT NOT NULL,
            Tabla VARCHAR(100) NOT NULL,
            IdRegistro INT NOT NULL,
            Accion VARCHAR(50) NOT NULL,
            Usuario VARCHAR(80) NULL,
            NombreUsuario VARCHAR(150) NULL,
            FechaHora DATETIME NULL,
            IP VARCHAR(50) NULL,
            Navegador VARCHAR(255) NULL,
            Observaciones VARCHAR(500) NULL
          );

          INSERT INTO @Audit
          (
            IdAuditoria,
            Tabla,
            IdRegistro,
            Accion,
            Usuario,
            NombreUsuario,
            FechaHora,
            IP,
            Navegador,
            Observaciones
          )
          SELECT
            IdAuditoria,
            Tabla,
            IdRegistro,
            Accion,
            Usuario,
            NombreUsuario,
            FechaHora,
            IP,
            Navegador,
            Observaciones
          FROM TBL_AUDITORIA;

          IF OBJECT_ID('dbo.TBL_USUARIOS_ERP_AUDITORIA', 'U') IS NOT NULL
          BEGIN
            INSERT INTO @Audit
            (
              IdAuditoria,
              Tabla,
              IdRegistro,
              Accion,
              Usuario,
              NombreUsuario,
              FechaHora,
              IP,
              Navegador,
              Observaciones
            )
            SELECT
              1000000000 + IdAuditoria,
              'TBL_USUARIOS_ERP_AUDITORIA',
              0,
              TipoEvento,
              UserLogon,
              UserLogon,
              FechaEvento,
              NULL,
              NULL,
              Detalle
            FROM dbo.TBL_USUARIOS_ERP_AUDITORIA;
          END;

          SELECT TOP (@TopRows)
            IdAuditoria,
            Tabla,
            IdRegistro,
            Accion,
            Usuario,
            NombreUsuario,
            FechaHora,
            IP,
            Navegador,
            Observaciones
          FROM @Audit
          ORDER BY FechaHora DESC, IdAuditoria DESC
        `);

      res.json({ success: true, data: result.recordset });
    } catch (error) {
      console.error('❌ Error listando auditoría:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });
}

module.exports = { registerMonitoringRoutes };
