/*
  Fecha: 2026-11-20
  Objeto: dbo.vw_Web_Horario_Personal (DB_GP_Trabajos_TEST, 10.10.1.6)

  Uso: pagina "Horarios" del sistema (GET /api/horarios).
  Fuente: dbo.vw_Excel_Asistencia_Papeletas (marcas del reloj de SIGA de ambas
  sedes, horario programado y papeletas activas del dia).

  Agrega AreaERP: el area del trabajador en la cache del ERP
  (TBL_GGHH_TrabajadorCache). Es la misma area con la que la app limita a los
  jefes (TBL_USUARIO_ERP_AREA_APP), asi cada jefe ve solo a su gente.
*/
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO
IF OBJECT_ID('dbo.vw_Web_Horario_Personal') IS NULL
    EXEC('CREATE VIEW dbo.vw_Web_Horario_Personal AS SELECT 1 AS x;');
GO
ALTER VIEW dbo.vw_Web_Horario_Personal
AS
SELECT
    LTRIM(RTRIM(t.Area)) AS AreaERP,
    v.Seccion,
    v.DNI,
    v.CodigoEmpleado,
    v.Trabajador,
    v.Cargo,
    v.Fecha,
    v.DiaSemana,
    v.Turno,
    v.HoraEntradaProgramada,
    v.HoraSalidaProgramada,
    v.Marca1,
    v.Marca2,
    v.Marca3,
    v.Marca4,
    v.CantidadMarcas,
    v.LugarEntrada,
    v.LugarSalida,
    v.MarcasManuales,
    v.MinutosTarde,
    v.MinutosSalidaAntes,
    v.HorasEntreMarcas,
    v.SinMarcas,
    v.Feriado,
    v.CantidadPapeletas,
    v.NumeroPapeleta,
    v.TipoPermiso,
    v.HorarioPermiso,
    v.MotivoPermiso,
    v.HorasPermiso
FROM dbo.vw_Excel_Asistencia_Papeletas v
OUTER APPLY (SELECT TOP 1 c.Area
             FROM dbo.TBL_GGHH_TrabajadorCache c
             WHERE LTRIM(RTRIM(c.DOI)) = v.DNI COLLATE DATABASE_DEFAULT
             ORDER BY CASE WHEN c.Activo = '1' THEN 0 ELSE 1 END) t;
GO
