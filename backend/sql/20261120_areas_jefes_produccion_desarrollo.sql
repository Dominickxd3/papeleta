/*
  Fecha: 2026-11-20
  Tabla: dbo.TBL_USUARIO_ERP_AREA_APP (DB_GP_Trabajos_TEST, 10.10.1.6)

  Motivo: dsaldana, jrua y lrojas tenian las mismas 3 areas
  (DESARROLLO DE PRODUCTO, PRODUCCION, REPROCESO), asi que los tres veian a
  todo el personal. Cada jefe debe ver solo a su gente:
    - dsaldaña, jrua -> COM DESARROLLO DE PRODUCTO - 2020 (IdAreaERP 12)
    - lrojas         -> COM PRODUCCION - 2020            (IdAreaERP 17)

  Efecto: aplica a la pagina Horarios y tambien a la bandeja de Papeletas
  (la app usa estas mismas areas para filtrar a los jefes).
  No se borra nada: las asignaciones que sobran quedan con Activo = '0'.
  Para revertir: volver a poner Activo = '1' en esas filas.
*/
SET NOCOUNT ON;
BEGIN TRAN;

UPDATE dbo.TBL_USUARIO_ERP_AREA_APP
   SET Activo = '0',
       Observacion = LEFT(CONCAT(ISNULL(Observacion + ' | ', ''), 'Desactivado 2026-11-20: cada jefe ve solo su area'), 250)
 WHERE (UserLogon IN (N'dsaldaña', N'jrua') AND IdAreaERP IN (17, 19))
    OR (UserLogon = N'lrojas'               AND IdAreaERP IN (12, 19));

SELECT UEA.UserLogon, A.NombreAreaERP, UEA.Activo
FROM dbo.TBL_USUARIO_ERP_AREA_APP UEA
JOIN dbo.TBL_AREAS_ERP_APP A ON A.IdAreaERP = UEA.IdAreaERP
WHERE UEA.UserLogon IN (N'dsaldaña', N'jrua', N'lrojas')
ORDER BY UEA.UserLogon, A.NombreAreaERP;

COMMIT;
