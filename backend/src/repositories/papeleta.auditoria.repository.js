// src/repositories/papeleta.auditoria.repository.js
// Lecturas sobre TBL_AUDITORIA para papeletas. SQL identico al original.

class PapeletaAuditoriaRepository {
  constructor(getPool, sql) {
    this.getPool = getPool;
    this.sql = sql;
  }

  async historial(id) {
    const result = await this.getPool().request()
      .input('IdPP', this.sql.Int, id)
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
    return result.recordset || [];
  }
}

module.exports = { PapeletaAuditoriaRepository };
