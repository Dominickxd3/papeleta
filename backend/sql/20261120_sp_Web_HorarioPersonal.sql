/*
  Fecha: 2026-11-20
  Objeto: dbo.sp_Web_HorarioPersonal (DB_GP_Trabajos_TEST, 10.10.1.6)

  Uso: pagina "Horarios" del sistema (GET /api/horarios).
  Reemplaza a dbo.vw_Web_Horario_Personal, que solo traia Produccion y
  Desarrollo de Productos (venia de la vista del Excel).

  - Todo el personal ACTIVO de SIGA (todas las areas).
  - Solo consulta en SIGA (10.10.1.3) el rango pedido: mas rapido.
  - Papeletas activas (ActivoPP = '1') de cualquier jefe.
  - AreaERP: area del trabajador en la cache del ERP; la API la usa para
    limitar a cada jefe a sus areas (TBL_USUARIO_ERP_AREA_APP).
  - En SIGA solo se lee (SELECT). No se modifica nada en 10.10.1.3.
*/
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO
IF OBJECT_ID('dbo.sp_Web_HorarioPersonal') IS NULL
    EXEC('CREATE PROCEDURE dbo.sp_Web_HorarioPersonal AS RETURN 0;');
GO
ALTER PROCEDURE dbo.sp_Web_HorarioPersonal
    @Desde date,
    @Hasta date
AS
BEGIN
    SET NOCOUNT ON;

    IF @Desde IS NULL OR @Hasta IS NULL OR @Hasta < @Desde OR DATEDIFF(day, @Desde, @Hasta) > 92
    BEGIN
        RAISERROR('Rango de fechas invalido (maximo 93 dias).', 16, 1);
        RETURN;
    END;

    DECLARE @d char(8) = CONVERT(char(8), @Desde, 112);
    DECLARE @h char(8) = CONVERT(char(8), DATEADD(day, 1, @Hasta), 112);

    -- Consulta que corre en SIGA (10.10.1.3). {D} y {H} son fechas yyyymmdd
    -- generadas desde parametros tipo date (no hay texto del usuario).
    DECLARE @q nvarchar(max) = N'
WITH u AS (
    SELECT u.UsuarioId, LTRIM(RTRIM(u.DNI)) AS DNI, LTRIM(RTRIM(u.CodEmpleado)) AS CodEmpleado,
           LTRIM(RTRIM(u.FullName)) AS Trabajador, cg.NombreCargo AS Cargo, a.AreaName AS Area
    FROM SIGA_ASISTENCIA.dbo.Usuario u
    JOIN SIGA_ASISTENCIA.dbo.Area a ON a.AreaId = u.AreaId
    LEFT JOIN SIGA_ASISTENCIA.dbo.Cargo cg ON cg.IdCargo = u.Idcargo
    WHERE ISNULL(u.Cesado, 0) = 0
),
m0 AS (
    SELECT c.UsuarioId, c.FechaCompleta, c.CIOTDeviceId, c.DispositivoId
    FROM SIGA_ASISTENCIA.dbo.CheckInOut c JOIN u ON u.UsuarioId = c.UsuarioId
    WHERE c.FechaCompleta >= ''{D}'' AND c.FechaCompleta < ''{H}'' AND ISNULL(c.status, 1) = 1
    UNION
    SELECT u.UsuarioId, c.FechaCompleta, c.CIOTDeviceId, c.DispositivoId
    FROM SIGA_ASISTENCIA.dbo.CheckInOut c JOIN u ON u.DNI = LTRIM(RTRIM(c.UserDeviceId))
    WHERE c.UsuarioId IS NULL AND c.FechaCompleta >= ''{D}'' AND c.FechaCompleta < ''{H}'' AND ISNULL(c.status, 1) = 1
),
m AS (
    SELECT UsuarioId, CAST(FechaCompleta AS date) AS Fecha, FechaCompleta,
           CASE WHEN CIOTDeviceId = 4 THEN ''Manual''
                WHEN DispositivoId = 1 THEN ''SJL 200''
                WHEN DispositivoId = 2 THEN ''SJL 177''
                WHEN DispositivoId = 5 THEN ''Lurin''
                ELSE ''Otro'' END AS Origen,
           ROW_NUMBER() OVER (PARTITION BY UsuarioId, CAST(FechaCompleta AS date) ORDER BY FechaCompleta) AS rn,
           ROW_NUMBER() OVER (PARTITION BY UsuarioId, CAST(FechaCompleta AS date) ORDER BY FechaCompleta DESC) AS rnd
    FROM m0
),
agg AS (
    SELECT UsuarioId, Fecha,
           MIN(FechaCompleta) AS Primera, MAX(FechaCompleta) AS Ultima, COUNT(*) AS Cant,
           MAX(CASE WHEN rn = 1 THEN CONVERT(char(5), FechaCompleta, 108) END) AS Marca1,
           MAX(CASE WHEN rn = 2 THEN CONVERT(char(5), FechaCompleta, 108) END) AS Marca2,
           MAX(CASE WHEN rn = 3 THEN CONVERT(char(5), FechaCompleta, 108) END) AS Marca3,
           MAX(CASE WHEN rn = 4 THEN CONVERT(char(5), FechaCompleta, 108) END) AS Marca4,
           MAX(CASE WHEN rn = 5 THEN CONVERT(char(5), FechaCompleta, 108) END) AS Marca5,
           MAX(CASE WHEN rn = 6 THEN CONVERT(char(5), FechaCompleta, 108) END) AS Marca6,
           MAX(CASE WHEN rn = 7 THEN CONVERT(char(5), FechaCompleta, 108) END) AS Marca7,
           MAX(CASE WHEN rn = 8 THEN CONVERT(char(5), FechaCompleta, 108) END) AS Marca8,
           MAX(CASE WHEN rn = 1 THEN Origen END) AS LugarEntrada,
           MAX(CASE WHEN rnd = 1 AND rn > 1 THEN Origen END) AS LugarSalida,
           SUM(CASE WHEN Origen = ''Manual'' THEN 1 ELSE 0 END) AS Manuales
    FROM m GROUP BY UsuarioId, Fecha
),
r AS (
    SELECT r.UsuarioId, CAST(r.ActivDate AS date) AS Fecha, t.TimeName AS Turno,
           r.EntradaInHour, r.SalidaOutHour, r.TimeAttendanceMinutos, r.Holiday
    FROM SIGA_ASISTENCIA.dbo.Report r JOIN u ON u.UsuarioId = r.UsuarioId
    LEFT JOIN SIGA_ASISTENCIA.dbo.TTime t ON t.TimeId = r.TimeId
    WHERE r.ActivDate >= ''{D}'' AND r.ActivDate < ''{H}''
),
dias AS (
    SELECT UsuarioId, Fecha FROM agg
    UNION
    SELECT UsuarioId, Fecha FROM r
)
SELECT
    u.Area, u.CodEmpleado, u.DNI, u.Trabajador, u.Cargo,
    CAST(d.Fecha AS datetime) AS Fecha,
    r.Turno,
    r.EntradaInHour AS HoraEntradaProgramada,
    r.SalidaOutHour AS HoraSalidaProgramada,
    g.Marca1 AS PrimeraMarca,
    CASE WHEN g.Cant > 1 THEN CONVERT(char(5), g.Ultima, 108) END AS UltimaMarca,
    ISNULL(g.Cant, 0) AS CantidadMarcas,
    g.Marca1, g.Marca2, g.Marca3, g.Marca4, g.Marca5, g.Marca6, g.Marca7, g.Marca8,
    g.LugarEntrada, g.LugarSalida,
    ISNULL(g.Manuales, 0) AS MarcasManuales,
    CASE WHEN g.Primera IS NOT NULL AND r.EntradaInHour IS NOT NULL
              AND DATEDIFF(minute, CAST(r.EntradaInHour AS time), CAST(g.Primera AS time)) > 0
         THEN DATEDIFF(minute, CAST(r.EntradaInHour AS time), CAST(g.Primera AS time)) ELSE 0 END AS MinutosTarde,
    CASE WHEN g.Cant > 1 AND r.SalidaOutHour IS NOT NULL AND r.SalidaOutHour > r.EntradaInHour
              AND DATEDIFF(minute, CAST(g.Ultima AS time), CAST(r.SalidaOutHour AS time)) > 0
         THEN DATEDIFF(minute, CAST(g.Ultima AS time), CAST(r.SalidaOutHour AS time)) ELSE 0 END AS MinutosSalidaAntes,
    CASE WHEN g.Cant > 1 THEN CAST(DATEDIFF(minute, g.Primera, g.Ultima) / 60.0 AS decimal(5,2)) ELSE 0 END AS HorasEntreMarcas,
    CASE WHEN ISNULL(r.TimeAttendanceMinutos, 0) > 0 AND g.Cant IS NULL THEN ''SI'' ELSE ''NO'' END AS SinMarcas,
    CASE WHEN r.Holiday = ''FE'' THEN ''SI'' ELSE ''NO'' END AS Feriado,
    CASE WHEN EXISTS (SELECT 1 FROM SIGA_ASISTENCIA.dbo.AsignarDiasVacaciones v
                      WHERE v.UsuarioId = d.UsuarioId AND ISNULL(v.Status, 1) = 1 AND ISNULL(v.lVendido, ''0'') <> ''1''
                        AND d.Fecha BETWEEN v.FechaInicio AND v.FechaFin) THEN ''SI'' ELSE ''NO'' END AS VacSIGA
FROM dias d
JOIN u ON u.UsuarioId = d.UsuarioId
LEFT JOIN r ON r.UsuarioId = d.UsuarioId AND r.Fecha = d.Fecha
LEFT JOIN agg g ON g.UsuarioId = d.UsuarioId AND g.Fecha = d.Fecha';

    SET @q = REPLACE(REPLACE(@q, N'{D}', @d), N'{H}', @h);

    CREATE TABLE #asis (
        Area varchar(200), CodEmpleado varchar(30), DNI varchar(30), Trabajador varchar(200), Cargo varchar(200),
        Fecha datetime, Turno varchar(100), HoraEntradaProgramada char(5), HoraSalidaProgramada char(5),
        PrimeraMarca char(5), UltimaMarca char(5), CantidadMarcas int,
        Marca1 char(5), Marca2 char(5), Marca3 char(5), Marca4 char(5),
        Marca5 char(5), Marca6 char(5), Marca7 char(5), Marca8 char(5),
        LugarEntrada varchar(10), LugarSalida varchar(10), MarcasManuales int,
        MinutosTarde int, MinutosSalidaAntes int, HorasEntreMarcas decimal(5,2),
        SinMarcas varchar(2), Feriado varchar(2), VacSIGA varchar(2)
    );

    DECLARE @sql nvarchar(max) = N'INSERT INTO #asis SELECT * FROM OPENQUERY([10.10.1.3,1433], ''' + REPLACE(@q, N'''', N'''''') + N''')';
    EXEC (@sql);

    -- Papeletas activas del rango, agrupadas por trabajador y dia
    ;WITH papBase AS (
        SELECT LTRIM(RTRIM(p.DOIPP)) AS DNI, p.FechaPermisoPP AS Fecha, p.NumeroPP AS Num,
               LTRIM(RTRIM(ISNULL(p.ConsiderarPP, ''))) AS Tipo, p.HSalidaPP AS s, p.HRetornoPP AS r,
               LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(CAST(p.MotivoPP AS nvarchar(500)), ''), CHAR(13), ' '), CHAR(10), ' '))) AS Motivo
        FROM dbo.TBL_GGHH_PapeletaPermiso p
        WHERE p.ActivoPP = '1'
          AND p.FechaPermisoPP >= @Desde AND p.FechaPermisoPP < DATEADD(day, 1, @Hasta)
    ),
    papd AS (
        SELECT b.DNI, b.Fecha, COUNT(*) AS Cant,
               SUM(CASE WHEN b.r > b.s THEN DATEDIFF(minute, b.s, b.r) ELSE 0 END) AS MinConRetorno,
               MIN(CASE WHEN NOT (b.r > b.s) THEN b.s END) AS SalidaSinRetorno,
               STUFF((SELECT ' / ' + CAST(x.Num AS varchar(10)) FROM papBase x
                      WHERE x.DNI = b.DNI AND x.Fecha = b.Fecha ORDER BY x.s, x.Num
                      FOR XML PATH(''), TYPE).value('.', 'varchar(200)'), 1, 3, '') AS Numeros,
               STUFF((SELECT ' / ' + CONVERT(char(5), x.s, 108) + ' a ' +
                             CASE WHEN x.r > x.s THEN CONVERT(char(5), x.r, 108) ELSE 'fin de turno' END
                      FROM papBase x WHERE x.DNI = b.DNI AND x.Fecha = b.Fecha ORDER BY x.s, x.Num
                      FOR XML PATH(''), TYPE).value('.', 'varchar(300)'), 1, 3, '') AS Horario,
               STUFF((SELECT DISTINCT ' / ' + x.Tipo FROM papBase x
                      WHERE x.DNI = b.DNI AND x.Fecha = b.Fecha AND x.Tipo <> ''
                      FOR XML PATH(''), TYPE).value('.', 'varchar(300)'), 1, 3, '') AS Tipos,
               STUFF((SELECT ' / ' + CASE WHEN x.Motivo = '' THEN '-' ELSE x.Motivo END
                      FROM papBase x WHERE x.DNI = b.DNI AND x.Fecha = b.Fecha ORDER BY x.s, x.Num
                      FOR XML PATH(''), TYPE).value('.', 'nvarchar(1000)'), 1, 3, '') AS Motivos,
               -- Tramos autorizados "HH:MM-HH:MM|Tipo;HH:MM-|Tipo" (sin hora de retorno = hasta fin de turno)
               STUFF((SELECT ';' + CONVERT(char(5), x.s, 108) + '-' +
                             CASE WHEN x.r > x.s THEN CONVERT(char(5), x.r, 108) ELSE '' END + '|' + REPLACE(REPLACE(x.Tipo, ';', ','), '|', '/')
                      FROM papBase x WHERE x.DNI = b.DNI AND x.Fecha = b.Fecha AND x.s IS NOT NULL ORDER BY x.s, x.Num
                      FOR XML PATH(''), TYPE).value('.', 'varchar(1000)'), 1, 1, '') AS Tramos
        FROM papBase b
        GROUP BY b.DNI, b.Fecha
    )
    SELECT
        LTRIM(RTRIM(t.Area)) AS AreaERP,
        a.Area AS AreaSIGA,
        a.DNI, a.CodEmpleado, a.Trabajador, a.Cargo,
        CONVERT(char(10), a.Fecha, 23) AS Fecha,
        a.Turno, a.HoraEntradaProgramada, a.HoraSalidaProgramada,
        a.PrimeraMarca, a.UltimaMarca,
        a.Marca1, a.Marca2, a.Marca3, a.Marca4, a.Marca5, a.Marca6, a.Marca7, a.Marca8, a.CantidadMarcas,
        a.LugarEntrada, a.LugarSalida, a.MarcasManuales,
        a.MinutosTarde, a.MinutosSalidaAntes, a.HorasEntreMarcas,
        a.SinMarcas, a.Feriado,
        -- Vacaciones: registradas en SIGA (AsignarDiasVacaciones) o en una papeleta con rango de vacaciones
        CASE WHEN a.VacSIGA = 'SI' OR EXISTS (
                 SELECT 1 FROM dbo.TBL_GGHH_PapeletaPermiso pv
                 WHERE pv.ActivoPP = '1' AND LTRIM(RTRIM(pv.DOIPP)) = a.DNI COLLATE DATABASE_DEFAULT
                   AND pv.FechaVacDesdePP IS NOT NULL AND pv.FechaVacHastaPP IS NOT NULL
                   AND CAST(a.Fecha AS date) BETWEEN pv.FechaVacDesdePP AND pv.FechaVacHastaPP)
             THEN 'SI' ELSE 'NO' END AS Vacaciones,
        ISNULL(pd.Cant, 0) AS CantidadPapeletas,
        pd.Numeros AS NumeroPapeleta,
        pd.Tipos AS TipoPermiso,
        pd.Horario AS HorarioPermiso,
        pd.Motivos AS MotivoPermiso,
        pd.Tramos AS TramosPermiso,
        CAST((ISNULL(pd.MinConRetorno, 0) +
              CASE WHEN pd.SalidaSinRetorno IS NOT NULL AND a.HoraSalidaProgramada IS NOT NULL
                        AND CAST(a.HoraSalidaProgramada AS time) >
                            CASE WHEN a.HoraEntradaProgramada IS NOT NULL AND CAST(a.HoraEntradaProgramada AS time) > pd.SalidaSinRetorno
                                 THEN CAST(a.HoraEntradaProgramada AS time) ELSE pd.SalidaSinRetorno END
                   THEN DATEDIFF(minute,
                            CASE WHEN a.HoraEntradaProgramada IS NOT NULL AND CAST(a.HoraEntradaProgramada AS time) > pd.SalidaSinRetorno
                                 THEN CAST(a.HoraEntradaProgramada AS time) ELSE pd.SalidaSinRetorno END,
                            CAST(a.HoraSalidaProgramada AS time))
                   ELSE 0 END) / 60.0 AS decimal(5,2)) AS HorasPermiso
    FROM #asis a
    LEFT JOIN papd pd
           ON pd.DNI = a.DNI COLLATE DATABASE_DEFAULT
          AND pd.Fecha = a.Fecha
    -- Solo personal ACTIVO en el ERP (los 214 de la planilla)
    CROSS APPLY (SELECT TOP 1 c.Area
                 FROM dbo.TBL_GGHH_TrabajadorCache c
                 WHERE LTRIM(RTRIM(c.DOI)) = a.DNI COLLATE DATABASE_DEFAULT
                   AND c.Activo = '1') t
    ORDER BY a.Fecha DESC, a.Trabajador;
END;
GO
