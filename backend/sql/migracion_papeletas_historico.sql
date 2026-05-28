/*
  Migracion segura de papeletas historicas hacia TBL_GGHH_PapeletaPermiso
  Fecha: 2026-03-02

  Uso recomendado:
  1) Ajustar @SourceTable si tu tabla origen tiene otro nombre.
  2) Cargar datos en la tabla staging (#2) desde tu origen.
  3) Ejecutar el bloque transaccional (#4).
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

/* =========================================================
   1) CONFIGURACION
   ========================================================= */
DECLARE @SourceTable SYSNAME = N'dbo.TBL_GGHH_PapeletaPermiso_Origen';

/* =========================================================
   2) STAGING (misma estructura logica de columnas)
   ========================================================= */
IF OBJECT_ID('dbo.STG_PapeletaPermiso_Migracion', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.STG_PapeletaPermiso_Migracion (
    IdPP                INT NULL,
    FechaRegistroPP     DATETIME NULL,
    PcRegistroPP        NVARCHAR(20) NULL,
    FechaModificacionPP DATETIME NULL,
    PcModificacionPP    NVARCHAR(20) NULL,
    FechaEmisionPP      DATETIME NULL,
    FechaPermisoPP      DATETIME NULL,
    NumeroPP            INT NULL,
    DOIPP               NVARCHAR(8) NULL,
    TrabajadorPP        NVARCHAR(200) NULL,
    CargoPP             NVARCHAR(50) NULL,
    AreaPP              NVARCHAR(30) NULL,
    MotivoPP            NVARCHAR(MAX) NULL,
    ConsiderarPP        NVARCHAR(MAX) NULL,
    HSalidaPP           TIME(7) NULL,
    HRetornoPP          TIME(7) NULL,
    TiempoPP            TIME(7) NULL,
    ObservacionesPP     NVARCHAR(MAX) NULL,
    ActivoPP            NVARCHAR(1) NULL
  );
END
ELSE
BEGIN
  TRUNCATE TABLE dbo.STG_PapeletaPermiso_Migracion;
END;

/* =========================================================
   3) CARGA DESDE ORIGEN A STAGING
   ========================================================= */
DECLARE @sql NVARCHAR(MAX) = N'
INSERT INTO dbo.STG_PapeletaPermiso_Migracion (
  IdPP, FechaRegistroPP, PcRegistroPP, FechaModificacionPP, PcModificacionPP,
  FechaEmisionPP, FechaPermisoPP, NumeroPP, DOIPP, TrabajadorPP, CargoPP, AreaPP,
  MotivoPP, ConsiderarPP, HSalidaPP, HRetornoPP, TiempoPP, ObservacionesPP, ActivoPP
)
SELECT
  IdPP, FechaRegistroPP, PcRegistroPP, FechaModificacionPP, PcModificacionPP,
  FechaEmisionPP, FechaPermisoPP, NumeroPP, DOIPP, TrabajadorPP, CargoPP, AreaPP,
  MotivoPP, ConsiderarPP, HSalidaPP, HRetornoPP, TiempoPP, ObservacionesPP, ActivoPP
FROM ' + QUOTENAME(PARSENAME(@SourceTable, 2)) + N'.' + QUOTENAME(PARSENAME(@SourceTable, 1)) + N';';

EXEC sp_executesql @sql;

/* =========================================================
   4) MIGRACION TRANSACCIONAL CON DEDUPLICACION
   Regla de duplicado: NumeroPP + DOIPP + FechaPermiso(date)
   ========================================================= */
BEGIN TRAN;

BEGIN TRY
  IF OBJECT_ID('tempdb..#ToInsert') IS NOT NULL DROP TABLE #ToInsert;

  ;WITH src AS (
    SELECT
      s.*,
      FechaPermisoDate = CAST(s.FechaPermisoPP AS DATE),
      rn = ROW_NUMBER() OVER (
        PARTITION BY
          ISNULL(s.NumeroPP, -1),
          ISNULL(LTRIM(RTRIM(s.DOIPP)), N''),
          CAST(s.FechaPermisoPP AS DATE)
        ORDER BY ISNULL(s.FechaRegistroPP, '19000101') DESC, ISNULL(s.IdPP, 0) DESC
      )
    FROM dbo.STG_PapeletaPermiso_Migracion s
    WHERE s.NumeroPP IS NOT NULL
      AND s.FechaPermisoPP IS NOT NULL
  ),
  src_clean AS (
    SELECT *
    FROM src
    WHERE rn = 1
  )
  SELECT
    s.FechaRegistroPP,
    s.PcRegistroPP,
    s.FechaModificacionPP,
    s.PcModificacionPP,
    s.FechaEmisionPP,
    -- Normaliza fecha de permiso a mediodia para evitar corrimientos de zona horaria.
    FechaPermisoPP = DATEADD(HOUR, 12, CAST(CAST(s.FechaPermisoPP AS DATE) AS DATETIME)),
    s.NumeroPP,
    s.DOIPP,
    s.TrabajadorPP,
    s.CargoPP,
    s.AreaPP,
    s.MotivoPP,
    s.ConsiderarPP,
    s.HSalidaPP,
    s.HRetornoPP,
    s.TiempoPP,
    s.ObservacionesPP,
    ActivoPP = ISNULL(NULLIF(s.ActivoPP, N''), N'1')
  INTO #ToInsert
  FROM src_clean s
  WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.TBL_GGHH_PapeletaPermiso t
    WHERE t.NumeroPP = s.NumeroPP
      AND ISNULL(LTRIM(RTRIM(t.DOIPP)), N'') = ISNULL(LTRIM(RTRIM(s.DOIPP)), N'')
      AND CAST(t.FechaPermisoPP AS DATE) = CAST(s.FechaPermisoPP AS DATE)
  );

  INSERT INTO dbo.TBL_GGHH_PapeletaPermiso (
    FechaRegistroPP,
    PcRegistroPP,
    FechaModificacionPP,
    PcModificacionPP,
    FechaEmisionPP,
    FechaPermisoPP,
    NumeroPP,
    DOIPP,
    TrabajadorPP,
    CargoPP,
    AreaPP,
    MotivoPP,
    ConsiderarPP,
    HSalidaPP,
    HRetornoPP,
    TiempoPP,
    ObservacionesPP,
    ActivoPP
  )
  SELECT
    FechaRegistroPP,
    PcRegistroPP,
    FechaModificacionPP,
    PcModificacionPP,
    FechaEmisionPP,
    FechaPermisoPP,
    NumeroPP,
    DOIPP,
    TrabajadorPP,
    CargoPP,
    AreaPP,
    MotivoPP,
    ConsiderarPP,
    HSalidaPP,
    HRetornoPP,
    TiempoPP,
    ObservacionesPP,
    ActivoPP
  FROM #ToInsert;

  DECLARE @RowsInserted INT = @@ROWCOUNT;

  COMMIT;

  SELECT
    TotalStaging = COUNT(1),
    TotalInsertado = @RowsInserted
  FROM dbo.STG_PapeletaPermiso_Migracion;

END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK;
  THROW;
END CATCH;

/* =========================================================
   5) VALIDACIONES RAPIDAS
   ========================================================= */
-- Duplicados que quedaron en destino por la llave funcional:
SELECT
  NumeroPP,
  DOIPP,
  CAST(FechaPermisoPP AS DATE) AS FechaPermiso,
  COUNT(1) AS Cantidad
FROM dbo.TBL_GGHH_PapeletaPermiso
GROUP BY NumeroPP, DOIPP, CAST(FechaPermisoPP AS DATE)
HAVING COUNT(1) > 1
ORDER BY Cantidad DESC, NumeroPP DESC;

-- Ultimos registros cargados:
SELECT TOP 20
  IdPP, NumeroPP, FechaEmisionPP, FechaPermisoPP, DOIPP, TrabajadorPP, ActivoPP
FROM dbo.TBL_GGHH_PapeletaPermiso
ORDER BY IdPP DESC;
