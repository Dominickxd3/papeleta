/*
  Backfill seguro de auditoria para papeletas existentes.

  Objetivo:
    - Insertar en TBL_AUDITORIA una accion CREAR por cada papeleta que existe
      en TBL_GGHH_PapeletaPermiso y que aun no tiene auditoria CREAR.
    - Usar FechaRegistroPP como FechaHora historica.

  Importante:
    - Esto NO reconstruye logins antiguos. Los logins locales solo guardaban
      UltimoAcceso, no historial. Desde el cambio de backend se registraran
      nuevos logins en TBL_AUDITORIA.
*/

USE [DB_GP_Trabajos_TEST];
GO

DECLARE @ConfirmBackfill BIT = 0;

SELECT
  COUNT(*) AS PapeletasSinAuditoriaCrear
FROM dbo.TBL_GGHH_PapeletaPermiso P
WHERE NOT EXISTS (
  SELECT 1
  FROM dbo.TBL_AUDITORIA A
  WHERE A.Tabla = 'TBL_GGHH_PapeletaPermiso'
    AND A.IdRegistro = P.IdPP
    AND A.Accion = 'CREAR'
);

SELECT TOP 100
  P.IdPP,
  P.NumeroPP,
  P.FechaRegistroPP,
  P.DOIPP,
  P.TrabajadorPP,
  P.EstadoAprobacion,
  U.Usuario AS UsuarioCreador,
  U.NombreCompleto AS NombreUsuarioCreador
FROM dbo.TBL_GGHH_PapeletaPermiso P
LEFT JOIN dbo.TBL_USUARIOS U
  ON U.IdUsuario = P.IdUsuarioCreador
WHERE NOT EXISTS (
  SELECT 1
  FROM dbo.TBL_AUDITORIA A
  WHERE A.Tabla = 'TBL_GGHH_PapeletaPermiso'
    AND A.IdRegistro = P.IdPP
    AND A.Accion = 'CREAR'
)
ORDER BY P.FechaRegistroPP DESC, P.IdPP DESC;

IF @ConfirmBackfill = 1
BEGIN
  BEGIN TRAN;

  INSERT INTO dbo.TBL_AUDITORIA
  (
    Tabla,
    IdRegistro,
    Accion,
    Usuario,
    NombreUsuario,
    FechaHora,
    IP,
    Navegador,
    DatosAnteriores,
    DatosNuevos,
    Observaciones
  )
  SELECT
    'TBL_GGHH_PapeletaPermiso',
    P.IdPP,
    'CREAR',
    U.Usuario,
    COALESCE(U.NombreCompleto, P.TrabajadorPP),
    COALESCE(P.FechaRegistroPP, P.FechaEmisionPP, GETDATE()),
    NULL,
    NULL,
    NULL,
    CONCAT(
      '{"IdPP":', P.IdPP,
      ',"NumeroPP":', COALESCE(CONVERT(varchar(20), P.NumeroPP), 'null'),
      ',"DOIPP":"', REPLACE(COALESCE(P.DOIPP, ''), '"', '\"'),
      '","TrabajadorPP":"', REPLACE(COALESCE(P.TrabajadorPP, ''), '"', '\"'),
      '","EstadoAprobacion":"', REPLACE(COALESCE(P.EstadoAprobacion, ''), '"', '\"'),
      '"}'
    ),
    'Backfill: auditoria CREAR reconstruida desde TBL_GGHH_PapeletaPermiso'
  FROM dbo.TBL_GGHH_PapeletaPermiso P
  LEFT JOIN dbo.TBL_USUARIOS U
    ON U.IdUsuario = P.IdUsuarioCreador
  WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.TBL_AUDITORIA A
    WHERE A.Tabla = 'TBL_GGHH_PapeletaPermiso'
      AND A.IdRegistro = P.IdPP
      AND A.Accion = 'CREAR'
  );

  COMMIT;
END;
GO
