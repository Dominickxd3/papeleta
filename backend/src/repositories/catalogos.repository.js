// src/repositories/catalogos.repository.js
// Acceso a datos de catálogos. SQL sin cambios respecto al original.

class CatalogosRepository {
  constructor(getPool) {
    this.getPool = getPool;
  }

  async listarTiposPermiso() {
    const result = await this.getPool().request()
      .query("SELECT * FROM TBL_TIPOS_PERMISO WHERE Activo = '1' ORDER BY Orden");
    return result.recordset;
  }

  async listarAreas() {
    const result = await this.getPool().request().query(`
      SELECT DISTINCT
        LTRIM(RTRIM(Area)) AS NombreArea
      FROM dbo.TBL_GGHH_TrabajadorCache
      WHERE ISNULL(Activo, '0') = '1'
        AND NULLIF(LTRIM(RTRIM(Area)), '') IS NOT NULL
      ORDER BY NombreArea
    `);
    return result.recordset || [];
  }

  async listarEstados() {
    const result = await this.getPool().request()
      .query('SELECT * FROM TBL_ESTADOS_PAPELETA ORDER BY Orden');
    return result.recordset;
  }

  async listarFeriados() {
    const result = await this.getPool().request()
      .query("SELECT * FROM TBL_FERIADOS WHERE Activo = '1' ORDER BY Fecha");
    return result.recordset;
  }

  async listarConfiguracion() {
    const result = await this.getPool().request()
      .query('SELECT * FROM TBL_CONFIGURACION ORDER BY Categoria, Clave');
    return result.recordset;
  }

  async listarHorarios() {
    const result = await this.getPool().request()
      .query("SELECT * FROM TBL_HORARIOS WHERE Activo = '1' ORDER BY NombreHorario");
    return result.recordset;
  }
}

module.exports = { CatalogosRepository };
