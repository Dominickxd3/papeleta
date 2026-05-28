/*
  Limpieza segura de redundancias ERP para DB_GP_Trabajos_TEST
  Modelo objetivo:
    - vw_ERP_Usuarios
    - TBL_USUARIOS_ERP_APP
    - TBL_AREAS_ERP_APP
    - TBL_USUARIO_ERP_AREA_APP

  Tablas legacy:
    - TBL_USUARIO_ERP_AREA
    - TBL_ROLES_USUARIO_ERP

  Tablas experimentales RBAC no usadas por la app actual:
    - TBL_ROLES_APP
    - TBL_PERMISOS_APP
    - TBL_ROL_PERMISO_APP
    - TBL_USUARIO_ROL_APP
    - TBL_USUARIO_ERP_ROL_APP
*/

USE [DB_GP_Trabajos_TEST];
GO

/* =========================================================
   1) Diagnostico de tablas vigentes y legacy
   ========================================================= */
SELECT 'TBL_USUARIOS_ERP_APP' AS Tabla, COUNT(*) AS Registros FROM dbo.TBL_USUARIOS_ERP_APP
UNION ALL
SELECT 'TBL_AREAS_ERP_APP', COUNT(*) FROM dbo.TBL_AREAS_ERP_APP
UNION ALL
SELECT 'TBL_USUARIO_ERP_AREA_APP', COUNT(*) FROM dbo.TBL_USUARIO_ERP_AREA_APP
UNION ALL
SELECT 'TBL_ROLES_USUARIO_ERP', COUNT(*) FROM dbo.TBL_ROLES_USUARIO_ERP
UNION ALL
SELECT 'TBL_USUARIO_ERP_AREA', COUNT(*) FROM dbo.TBL_USUARIO_ERP_AREA;
GO

/* =========================================================
   2) Backfill de seguridad desde tabla legacy a tabla nueva
   Ejecuta esto antes de retirar TBL_ROLES_USUARIO_ERP
   ========================================================= */
MERGE dbo.TBL_USUARIOS_ERP_APP AS T
USING (
    SELECT
        UserLogon,
        CASE
            WHEN ISNULL(sw_nivel, 0) BETWEEN 1 AND 5 THEN sw_nivel
            WHEN UPPER(LTRIM(RTRIM(RolApp))) = 'ADMIN' THEN 4
            WHEN UPPER(LTRIM(RTRIM(RolApp))) = 'RRHH' THEN 3
            ELSE 1
        END AS sw_nivel,
        CASE WHEN ISNULL(Activo, '1') IN ('0','2') THEN '2' ELSE '1' END AS Activo,
        FechaActualizacion,
        ActualizadoPor
    FROM dbo.TBL_ROLES_USUARIO_ERP
    WHERE ISNULL(UserLogon, '') <> ''
) AS S
ON T.UserLogon = S.UserLogon
WHEN MATCHED THEN
  UPDATE SET
    T.sw_nivel = S.sw_nivel,
    T.Activo = S.Activo,
    T.FechaActualizacion = ISNULL(S.FechaActualizacion, GETDATE()),
    T.ActualizadoPor = S.ActualizadoPor
WHEN NOT MATCHED THEN
  INSERT (UserLogon, sw_nivel, Activo, FechaCreacion, FechaActualizacion, ActualizadoPor)
  VALUES (S.UserLogon, S.sw_nivel, S.Activo, GETDATE(), ISNULL(S.FechaActualizacion, GETDATE()), S.ActualizadoPor);
GO

/* =========================================================
   3) Identificar diferencias que impedirian borrar legacy
   ========================================================= */
SELECT
    R.UserLogon,
    R.RolApp AS RolLegacy,
    R.sw_nivel AS NivelLegacy,
    R.Activo AS ActivoLegacy,
    U.sw_nivel AS NivelNuevo,
    U.Activo AS ActivoNuevo
FROM dbo.TBL_ROLES_USUARIO_ERP R
LEFT JOIN dbo.TBL_USUARIOS_ERP_APP U
    ON U.UserLogon = R.UserLogon
WHERE U.UserLogon IS NULL
   OR ISNULL(U.sw_nivel, -1) <> ISNULL(R.sw_nivel,
        CASE
            WHEN UPPER(LTRIM(RTRIM(R.RolApp))) = 'ADMIN' THEN 4
            WHEN UPPER(LTRIM(RTRIM(R.RolApp))) = 'RRHH' THEN 3
            ELSE 1
        END)
   OR CASE WHEN ISNULL(U.Activo, '1') IN ('0','2') THEN '2' ELSE '1' END
      <> CASE WHEN ISNULL(R.Activo, '1') IN ('0','2') THEN '2' ELSE '1' END;
GO

/* =========================================================
   4) Validar areas ERP asignadas en el modelo nuevo
   ========================================================= */
SELECT
    U.UserLogon,
    U.sw_nivel,
    U.Activo,
    A.IdAreaERP,
    A.NombreAreaERP
FROM dbo.TBL_USUARIOS_ERP_APP U
LEFT JOIN dbo.TBL_USUARIO_ERP_AREA_APP UA
    ON UA.UserLogon = U.UserLogon
   AND ISNULL(UA.Activo, '1') = '1'
LEFT JOIN dbo.TBL_AREAS_ERP_APP A
    ON A.IdAreaERP = UA.IdAreaERP
WHERE U.sw_nivel = 2
ORDER BY U.UserLogon, A.NombreAreaERP;
GO

/* =========================================================
   5) Tablas claramente redundantes para la app actual
   La app actual NO usa estas tablas RBAC experimentales.
   Revísalas y luego elimínalas si no necesitas ese modelo.
   ========================================================= */
SELECT 'TBL_ROLES_APP' AS Tabla WHERE OBJECT_ID('dbo.TBL_ROLES_APP', 'U') IS NOT NULL
UNION ALL SELECT 'TBL_PERMISOS_APP' WHERE OBJECT_ID('dbo.TBL_PERMISOS_APP', 'U') IS NOT NULL
UNION ALL SELECT 'TBL_ROL_PERMISO_APP' WHERE OBJECT_ID('dbo.TBL_ROL_PERMISO_APP', 'U') IS NOT NULL
UNION ALL SELECT 'TBL_USUARIO_ROL_APP' WHERE OBJECT_ID('dbo.TBL_USUARIO_ROL_APP', 'U') IS NOT NULL
UNION ALL SELECT 'TBL_USUARIO_ERP_ROL_APP' WHERE OBJECT_ID('dbo.TBL_USUARIO_ERP_ROL_APP', 'U') IS NOT NULL;
GO

/* =========================================================
   6) Eliminacion opcional de tablas redundantes
   Deja @ConfirmDrop = 1 solo cuando hayas validado el paso 3.
   ========================================================= */
DECLARE @ConfirmDrop BIT = 0;

IF @ConfirmDrop = 1
BEGIN
    IF OBJECT_ID('dbo.TBL_USUARIO_ERP_AREA', 'U') IS NOT NULL
        DROP TABLE dbo.TBL_USUARIO_ERP_AREA;

    IF OBJECT_ID('dbo.TBL_ROLES_APP', 'U') IS NOT NULL
        DROP TABLE dbo.TBL_ROLES_APP;

    IF OBJECT_ID('dbo.TBL_PERMISOS_APP', 'U') IS NOT NULL
        DROP TABLE dbo.TBL_PERMISOS_APP;

    IF OBJECT_ID('dbo.TBL_ROL_PERMISO_APP', 'U') IS NOT NULL
        DROP TABLE dbo.TBL_ROL_PERMISO_APP;

    IF OBJECT_ID('dbo.TBL_USUARIO_ROL_APP', 'U') IS NOT NULL
        DROP TABLE dbo.TBL_USUARIO_ROL_APP;

    IF OBJECT_ID('dbo.TBL_USUARIO_ERP_ROL_APP', 'U') IS NOT NULL
        DROP TABLE dbo.TBL_USUARIO_ERP_ROL_APP;
END;
GO

/* =========================================================
   7) Retiro final de TBL_ROLES_USUARIO_ERP
   No lo retires hasta validar login ERP y panel ERP con el modelo nuevo.
   ========================================================= */
-- DECLARE @ConfirmDropLegacyRole BIT = 0;
-- IF @ConfirmDropLegacyRole = 1
-- BEGIN
--     DROP TABLE dbo.TBL_ROLES_USUARIO_ERP;
-- END;
-- GO
