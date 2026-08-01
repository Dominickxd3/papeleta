// src/repositories/erp.acceso.repository.js
// Acceso ERP: nivel y areas del usuario ERP. Logica identica al original
// (routes/papeletas.routes.js).

class ErpAccesoRepository {
  constructor(getPool, sql) {
    this.getPool = getPool;
    this.sql = sql;
  }

  async getErpAreaAccess(userLogon) {
    const login = String(userLogon || '').trim();
    if (!login) {
      return { swNivel: 1, areas: [] };
    }

    try {
      const result = await this.getPool().request()
        .input('UserLogon', this.sql.VarChar(80), login)
        .query(`
          SELECT TOP 1
            sw_nivel,
            Activo
          FROM dbo.TBL_USUARIOS_ERP_APP
          WHERE UserLogon = @UserLogon
        `);

      const user = result.recordset?.[0] || null;
      const activo = String(user?.Activo ?? '1').trim();
      if (activo === '0' || activo === '2') {
        return { swNivel: 1, areas: [] };
      }

      const swNivel = Number(user?.sw_nivel || 1) || 1;
      if (swNivel !== 2) {
        return { swNivel, areas: [] };
      }

      const areasResult = await this.getPool().request()
        .input('UserLogon', this.sql.VarChar(80), login)
        .query(`
          SELECT A.NombreAreaERP
          FROM dbo.TBL_USUARIO_ERP_AREA_APP UEA
          INNER JOIN dbo.TBL_AREAS_ERP_APP A
            ON A.IdAreaERP = UEA.IdAreaERP
          WHERE UEA.UserLogon = @UserLogon
            AND ISNULL(UEA.Activo, '1') = '1'
            AND ISNULL(A.Activo, '1') = '1'
        `);

      return {
        swNivel,
        areas: (areasResult.recordset || [])
          .map((row) => String(row.NombreAreaERP || '').trim())
          .filter(Boolean)
      };
    } catch {
      return { swNivel: 1, areas: [] };
    }
  }
}

module.exports = { ErpAccesoRepository };
