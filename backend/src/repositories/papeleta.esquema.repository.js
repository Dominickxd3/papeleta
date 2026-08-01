// src/repositories/papeleta.esquema.repository.js
// Introspeccion de esquema (COL_LENGTH) con cache de 5 minutos.
// Logica identica al original (routes/papeletas.routes.js).

class PapeletaEsquemaRepository {
  constructor(getPool, sql) {
    this.getPool = getPool;
    this.sql = sql;
    this.schemaCache = {
      hasIdUsuarioCreador: null,
      checkedAt: 0
    };
    this.vacacionesSchemaCache = {
      hasFechaVacDesdePP: null,
      hasFechaVacHastaPP: null,
      checkedAt: 0
    };
  }

  async hasIdUsuarioCreadorColumn() {
    const now = Date.now();
    if ((now - this.schemaCache.checkedAt) < 300000 && this.schemaCache.hasIdUsuarioCreador !== null) {
      return this.schemaCache.hasIdUsuarioCreador;
    }

    const colCheck = await this.getPool().request().query(`
      SELECT COL_LENGTH('TBL_GGHH_PapeletaPermiso', 'IdUsuarioCreador') AS ColLen
    `);
    this.schemaCache.hasIdUsuarioCreador = !!(colCheck.recordset?.[0]?.ColLen);
    this.schemaCache.checkedAt = now;
    return this.schemaCache.hasIdUsuarioCreador;
  }

  async getVacacionesColumnsAvailability() {
    const now = Date.now();
    if ((now - this.vacacionesSchemaCache.checkedAt) < 300000
      && this.vacacionesSchemaCache.hasFechaVacDesdePP !== null
      && this.vacacionesSchemaCache.hasFechaVacHastaPP !== null) {
      return {
        hasFechaVacDesdePP: this.vacacionesSchemaCache.hasFechaVacDesdePP,
        hasFechaVacHastaPP: this.vacacionesSchemaCache.hasFechaVacHastaPP
      };
    }

    const cols = await this.getPool().request().query(`
      SELECT
        COL_LENGTH('TBL_GGHH_PapeletaPermiso', 'FechaVacDesdePP') AS ColDesde,
        COL_LENGTH('TBL_GGHH_PapeletaPermiso', 'FechaVacHastaPP') AS ColHasta
    `);
    this.vacacionesSchemaCache.hasFechaVacDesdePP = !!(cols.recordset?.[0]?.ColDesde);
    this.vacacionesSchemaCache.hasFechaVacHastaPP = !!(cols.recordset?.[0]?.ColHasta);
    this.vacacionesSchemaCache.checkedAt = now;
    return {
      hasFechaVacDesdePP: this.vacacionesSchemaCache.hasFechaVacDesdePP,
      hasFechaVacHastaPP: this.vacacionesSchemaCache.hasFechaVacHastaPP
    };
  }
}

module.exports = { PapeletaEsquemaRepository };
