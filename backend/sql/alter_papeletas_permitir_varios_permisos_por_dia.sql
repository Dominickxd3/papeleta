/*
  Permite varias papeletas activas por trabajador en una misma fecha.
  La validacion pasa a hacerse por cruce de horario en backend.
  Fecha: 2026-04-04
*/

SET NOCOUNT ON;

IF EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.TBL_GGHH_PapeletaPermiso')
    AND name = 'UX_Papeleta_Trabajador_Fecha_Activa'
)
BEGIN
  DROP INDEX UX_Papeleta_Trabajador_Fecha_Activa
  ON dbo.TBL_GGHH_PapeletaPermiso;
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.TBL_GGHH_PapeletaPermiso')
    AND name = 'IX_Papeleta_Trabajador_Fecha_Activa_Horario'
)
BEGIN
  CREATE INDEX IX_Papeleta_Trabajador_Fecha_Activa_Horario
  ON dbo.TBL_GGHH_PapeletaPermiso (
    DOIPP,
    FechaPermisoPP,
    ActivoPP,
    HSalidaPP,
    HRetornoPP
  );
END;
