/*
  Agrega columnas recomendadas para rango de vacaciones en papeletas.
  Fecha: 2026-03-03
*/

SET NOCOUNT ON;

IF COL_LENGTH('dbo.TBL_GGHH_PapeletaPermiso', 'FechaVacDesdePP') IS NULL
BEGIN
  ALTER TABLE dbo.TBL_GGHH_PapeletaPermiso
  ADD FechaVacDesdePP DATE NULL;
END;

IF COL_LENGTH('dbo.TBL_GGHH_PapeletaPermiso', 'FechaVacHastaPP') IS NULL
BEGIN
  ALTER TABLE dbo.TBL_GGHH_PapeletaPermiso
  ADD FechaVacHastaPP DATE NULL;
END;

-- Backfill desde ConsiderarPP: "Vacaciones: YYYY-MM-DD a YYYY-MM-DD"
;WITH src AS (
  SELECT
    IdPP,
    ConsiderarPP = LTRIM(RTRIM(CAST(ConsiderarPP AS NVARCHAR(4000))))
  FROM dbo.TBL_GGHH_PapeletaPermiso
)
UPDATE t
SET
  FechaVacDesdePP = TRY_CONVERT(date, SUBSTRING(s.ConsiderarPP, p.pos + 1, 10), 23),
  FechaVacHastaPP = TRY_CONVERT(date, SUBSTRING(s.ConsiderarPP, p.pos + 14, 10), 23)
FROM dbo.TBL_GGHH_PapeletaPermiso t
JOIN src s ON s.IdPP = t.IdPP
CROSS APPLY (SELECT pos = PATINDEX('%Vacaciones:%', s.ConsiderarPP)) p
WHERE p.pos > 0
  AND (t.FechaVacDesdePP IS NULL OR t.FechaVacHastaPP IS NULL)
  AND TRY_CONVERT(date, SUBSTRING(s.ConsiderarPP, p.pos + 1, 10), 23) IS NOT NULL
  AND TRY_CONVERT(date, SUBSTRING(s.ConsiderarPP, p.pos + 14, 10), 23) IS NOT NULL;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.TBL_GGHH_PapeletaPermiso')
    AND name = 'IX_Papeleta_FechaVacDesdeHasta'
)
BEGIN
  CREATE INDEX IX_Papeleta_FechaVacDesdeHasta
  ON dbo.TBL_GGHH_PapeletaPermiso (FechaVacDesdePP, FechaVacHastaPP);
END;
