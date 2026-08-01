// src/repositories/system.repository.js
// Acceso a datos de estadísticas y health. SQL sin cambios respecto al original.

class SystemRepository {
  constructor(getPool, sql) {
    this.getPool = getPool;
    this.sql = sql;
  }

  async estadisticasGeneral() {
    const result = await this.getPool().request().query(`
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
    return result.recordset[0];
  }

  async topUsuarios() {
    const result = await this.getPool().request().query(`
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
    return result.recordset;
  }

  async estadisticasPorArea() {
    const result = await this.getPool().request().query(`
      SELECT
        ISNULL(NULLIF(LTRIM(RTRIM(AreaPP)), ''), 'SIN AREA') AS area,
        COUNT(*) AS cantidad
      FROM TBL_GGHH_PapeletaPermiso
      WHERE ActivoPP = '1'
      GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(AreaPP)), ''), 'SIN AREA')
      ORDER BY COUNT(*) DESC
    `);
    return result.recordset;
  }

  async estadisticasPorMes(year) {
    const result = await this.getPool().request()
      .input('Year', this.sql.Int, year)
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
    return result.recordset;
  }

  async ping() {
    const currentPool = this.getPool();
    if (!currentPool || !currentPool.connected) return false;
    await currentPool.request().query('SELECT 1 AS ok');
    return true;
  }

  isConnected() {
    const currentPool = this.getPool();
    return !!(currentPool && currentPool.connected);
  }
}

module.exports = { SystemRepository };
