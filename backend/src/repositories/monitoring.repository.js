// src/repositories/monitoring.repository.js
// Acceso a datos de notificaciones y auditoría. SQL sin cambios respecto al original.

class MonitoringRepository {
  constructor(getPool, sql) {
    this.getPool = getPool;
    this.sql = sql;
  }

  async listarNotificaciones(usuario, soloNoLeidas) {
    const request = this.getPool().request()
      .input('Usuario', this.sql.VarChar(50), usuario || '');

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
    return result.recordset;
  }

  async marcarLeida(id, usuario) {
    await this.getPool().request()
      .input('IdNotificacion', this.sql.Int, id)
      .input('UsuarioDestino', this.sql.VarChar(50), usuario || '')
      .query(`
        UPDATE TBL_NOTIFICACIONES
        SET Leido = '1',
            FechaLeido = GETDATE()
        WHERE IdNotificacion = @IdNotificacion
          AND UsuarioDestino = @UsuarioDestino
      `);
  }

  async listarAuditoria(top) {
    const result = await this.getPool().request()
      .input('TopRows', this.sql.Int, top)
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
    return result.recordset;
  }
}

module.exports = { MonitoringRepository };
