/*
  Migracion RBAC (5 niveles) para DB_GP_Trabajos_TEST
  - No elimina datos actuales.
  - Es idempotente: se puede ejecutar mas de una vez.
  - Mantiene compatibilidad con el esquema actual (Rol en TBL_USUARIOS).
*/

USE [DB_GP_Trabajos_TEST];
GO

SET XACT_ABORT ON;
GO

BEGIN TRY
  BEGIN TRAN;

  /* =========================================================
     1) Catalogo de roles y permisos
     ========================================================= */
  IF OBJECT_ID('dbo.TBL_ROLES_APP', 'U') IS NULL
  BEGIN
    CREATE TABLE dbo.TBL_ROLES_APP (
      IdRolApp INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
      CodigoRol VARCHAR(30) NOT NULL UNIQUE,
      NombreRol VARCHAR(80) NOT NULL,
      NivelJerarquia INT NOT NULL,
      Descripcion VARCHAR(255) NULL,
      Activo CHAR(1) NOT NULL CONSTRAINT DF_TBL_ROLES_APP_Activo DEFAULT ('1'),
      FechaCreacion DATETIME NOT NULL CONSTRAINT DF_TBL_ROLES_APP_FechaCreacion DEFAULT (GETDATE()),
      FechaActualizacion DATETIME NOT NULL CONSTRAINT DF_TBL_ROLES_APP_FechaActualizacion DEFAULT (GETDATE())
    );
  END;

  IF OBJECT_ID('dbo.TBL_PERMISOS_APP', 'U') IS NULL
  BEGIN
    CREATE TABLE dbo.TBL_PERMISOS_APP (
      IdPermisoApp INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
      CodigoPermiso VARCHAR(60) NOT NULL UNIQUE,
      NombrePermiso VARCHAR(120) NOT NULL,
      Descripcion VARCHAR(255) NULL,
      Activo CHAR(1) NOT NULL CONSTRAINT DF_TBL_PERMISOS_APP_Activo DEFAULT ('1'),
      FechaCreacion DATETIME NOT NULL CONSTRAINT DF_TBL_PERMISOS_APP_FechaCreacion DEFAULT (GETDATE())
    );
  END;

  IF OBJECT_ID('dbo.TBL_ROL_PERMISO_APP', 'U') IS NULL
  BEGIN
    CREATE TABLE dbo.TBL_ROL_PERMISO_APP (
      IdRolApp INT NOT NULL,
      IdPermisoApp INT NOT NULL,
      Activo CHAR(1) NOT NULL CONSTRAINT DF_TBL_ROL_PERMISO_APP_Activo DEFAULT ('1'),
      FechaAsignacion DATETIME NOT NULL CONSTRAINT DF_TBL_ROL_PERMISO_APP_FechaAsignacion DEFAULT (GETDATE()),
      AsignadoPor VARCHAR(80) NULL,
      CONSTRAINT PK_TBL_ROL_PERMISO_APP PRIMARY KEY (IdRolApp, IdPermisoApp),
      CONSTRAINT FK_TBL_ROL_PERMISO_APP_Rol FOREIGN KEY (IdRolApp) REFERENCES dbo.TBL_ROLES_APP(IdRolApp),
      CONSTRAINT FK_TBL_ROL_PERMISO_APP_Permiso FOREIGN KEY (IdPermisoApp) REFERENCES dbo.TBL_PERMISOS_APP(IdPermisoApp)
    );
  END;

  /* =========================================================
     2) Asignacion de roles a usuarios
     ========================================================= */
  IF OBJECT_ID('dbo.TBL_USUARIO_ROL_APP', 'U') IS NULL
  BEGIN
    CREATE TABLE dbo.TBL_USUARIO_ROL_APP (
      IdUsuario INT NOT NULL,
      IdRolApp INT NOT NULL,
      Activo CHAR(1) NOT NULL CONSTRAINT DF_TBL_USUARIO_ROL_APP_Activo DEFAULT ('1'),
      FechaAsignacion DATETIME NOT NULL CONSTRAINT DF_TBL_USUARIO_ROL_APP_FechaAsignacion DEFAULT (GETDATE()),
      AsignadoPor VARCHAR(80) NULL,
      Observacion VARCHAR(255) NULL,
      CONSTRAINT PK_TBL_USUARIO_ROL_APP PRIMARY KEY (IdUsuario, IdRolApp),
      CONSTRAINT FK_TBL_USUARIO_ROL_APP_Usuario FOREIGN KEY (IdUsuario) REFERENCES dbo.TBL_USUARIOS(IdUsuario),
      CONSTRAINT FK_TBL_USUARIO_ROL_APP_Rol FOREIGN KEY (IdRolApp) REFERENCES dbo.TBL_ROLES_APP(IdRolApp)
    );
  END;

  IF OBJECT_ID('dbo.TBL_USUARIO_ERP_ROL_APP', 'U') IS NULL
  BEGIN
    CREATE TABLE dbo.TBL_USUARIO_ERP_ROL_APP (
      UserLogon VARCHAR(80) NOT NULL,
      IdRolApp INT NOT NULL,
      Activo CHAR(1) NOT NULL CONSTRAINT DF_TBL_USUARIO_ERP_ROL_APP_Activo DEFAULT ('1'),
      FechaAsignacion DATETIME NOT NULL CONSTRAINT DF_TBL_USUARIO_ERP_ROL_APP_FechaAsignacion DEFAULT (GETDATE()),
      AsignadoPor VARCHAR(80) NULL,
      Observacion VARCHAR(255) NULL,
      CONSTRAINT PK_TBL_USUARIO_ERP_ROL_APP PRIMARY KEY (UserLogon, IdRolApp),
      CONSTRAINT FK_TBL_USUARIO_ERP_ROL_APP_Rol FOREIGN KEY (IdRolApp) REFERENCES dbo.TBL_ROLES_APP(IdRolApp)
    );
  END;

  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TBL_USUARIO_ROL_APP_IdRolApp')
    CREATE NONCLUSTERED INDEX IX_TBL_USUARIO_ROL_APP_IdRolApp ON dbo.TBL_USUARIO_ROL_APP (IdRolApp);

  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TBL_USUARIO_ERP_ROL_APP_IdRolApp')
    CREATE NONCLUSTERED INDEX IX_TBL_USUARIO_ERP_ROL_APP_IdRolApp ON dbo.TBL_USUARIO_ERP_ROL_APP (IdRolApp);

  /* =========================================================
     3) Seed de 5 niveles de rol
     ========================================================= */
  ;WITH RolesSeed AS (
    SELECT 'SUPERADMIN' AS CodigoRol, 'Super Administrador' AS NombreRol, 50 AS NivelJerarquia, 'Control total del sistema' AS Descripcion
    UNION ALL SELECT 'ADMIN',       'Administrador',       40, 'Administracion funcional y seguridad'
    UNION ALL SELECT 'RRHH',        'Recursos Humanos',    30, 'Gestion y aprobacion RRHH'
    UNION ALL SELECT 'JEFE_AREA',   'Jefe de Area',        20, 'Aprobacion y gestion por area'
    UNION ALL SELECT 'COLABORADOR', 'Colaborador',         10, 'Registro y consulta de papeletas propias'
  )
  MERGE dbo.TBL_ROLES_APP AS T
  USING RolesSeed AS S
    ON T.CodigoRol = S.CodigoRol
  WHEN MATCHED THEN
    UPDATE SET
      T.NombreRol = S.NombreRol,
      T.NivelJerarquia = S.NivelJerarquia,
      T.Descripcion = S.Descripcion,
      T.Activo = '1',
      T.FechaActualizacion = GETDATE()
  WHEN NOT MATCHED THEN
    INSERT (CodigoRol, NombreRol, NivelJerarquia, Descripcion, Activo)
    VALUES (S.CodigoRol, S.NombreRol, S.NivelJerarquia, S.Descripcion, '1');

  /* =========================================================
     4) Seed de permisos base
     ========================================================= */
  ;WITH PermisosSeed AS (
    SELECT 'PAPELETA_VER_TODAS' AS CodigoPermiso, 'Ver todas las papeletas' AS NombrePermiso, 'Acceso global a papeletas' AS Descripcion
    UNION ALL SELECT 'PAPELETA_VER_PROPIAS', 'Ver papeletas propias', 'Acceso solo a papeletas del usuario'
    UNION ALL SELECT 'PAPELETA_CREAR', 'Crear papeletas', 'Registrar nueva papeleta'
    UNION ALL SELECT 'PAPELETA_EDITAR_PROPIA', 'Editar papeletas propias', 'Editar papeletas creadas por el usuario'
    UNION ALL SELECT 'PAPELETA_ANULAR_PROPIA', 'Anular papeletas propias', 'Anular papeletas creadas por el usuario'
    UNION ALL SELECT 'PAPELETA_APROBAR_JEFE', 'Aprobar como jefe', 'Aprobar/rechazar como jefe de area'
    UNION ALL SELECT 'PAPELETA_APROBAR_RRHH', 'Aprobar como RRHH', 'Aprobar/rechazar como RRHH'
    UNION ALL SELECT 'DASHBOARD_VER_GLOBAL', 'Ver dashboard global', 'Indicadores globales del sistema'
    UNION ALL SELECT 'DASHBOARD_VER_PROPIO', 'Ver dashboard propio', 'Indicadores de su propio alcance'
    UNION ALL SELECT 'TRABAJADORES_GESTIONAR', 'Gestionar trabajadores', 'CRUD/sync de trabajadores'
    UNION ALL SELECT 'USUARIOS_GESTIONAR', 'Gestionar usuarios locales', 'Administracion de usuarios locales'
    UNION ALL SELECT 'ERP_ROLES_GESTIONAR', 'Gestionar roles ERP', 'Administracion de roles ERP'
    UNION ALL SELECT 'REPORTES_EXPORTAR', 'Exportar reportes', 'Exportar PDF/Excel'
  )
  MERGE dbo.TBL_PERMISOS_APP AS T
  USING PermisosSeed AS S
    ON T.CodigoPermiso = S.CodigoPermiso
  WHEN MATCHED THEN
    UPDATE SET
      T.NombrePermiso = S.NombrePermiso,
      T.Descripcion = S.Descripcion,
      T.Activo = '1'
  WHEN NOT MATCHED THEN
    INSERT (CodigoPermiso, NombrePermiso, Descripcion, Activo)
    VALUES (S.CodigoPermiso, S.NombrePermiso, S.Descripcion, '1');

  /* =========================================================
     5) Matriz rol-permiso (base)
     ========================================================= */
  ;WITH RolePerm AS (
    /* SUPERADMIN: todos */
    SELECT R.IdRolApp, P.IdPermisoApp
    FROM dbo.TBL_ROLES_APP R
    CROSS JOIN dbo.TBL_PERMISOS_APP P
    WHERE R.CodigoRol = 'SUPERADMIN'

    UNION ALL
    /* ADMIN */
    SELECT R.IdRolApp, P.IdPermisoApp
    FROM dbo.TBL_ROLES_APP R
    JOIN dbo.TBL_PERMISOS_APP P ON P.CodigoPermiso IN (
      'PAPELETA_VER_TODAS','PAPELETA_CREAR','PAPELETA_EDITAR_PROPIA','PAPELETA_ANULAR_PROPIA',
      'PAPELETA_APROBAR_JEFE','PAPELETA_APROBAR_RRHH','DASHBOARD_VER_GLOBAL',
      'TRABAJADORES_GESTIONAR','USUARIOS_GESTIONAR','ERP_ROLES_GESTIONAR','REPORTES_EXPORTAR'
    )
    WHERE R.CodigoRol = 'ADMIN'

    UNION ALL
    /* RRHH */
    SELECT R.IdRolApp, P.IdPermisoApp
    FROM dbo.TBL_ROLES_APP R
    JOIN dbo.TBL_PERMISOS_APP P ON P.CodigoPermiso IN (
      'PAPELETA_VER_TODAS','PAPELETA_CREAR','PAPELETA_EDITAR_PROPIA','PAPELETA_ANULAR_PROPIA',
      'PAPELETA_APROBAR_RRHH','DASHBOARD_VER_GLOBAL','TRABAJADORES_GESTIONAR','REPORTES_EXPORTAR'
    )
    WHERE R.CodigoRol = 'RRHH'

    UNION ALL
    /* JEFE_AREA */
    SELECT R.IdRolApp, P.IdPermisoApp
    FROM dbo.TBL_ROLES_APP R
    JOIN dbo.TBL_PERMISOS_APP P ON P.CodigoPermiso IN (
      'PAPELETA_VER_PROPIAS','PAPELETA_CREAR','PAPELETA_EDITAR_PROPIA','PAPELETA_ANULAR_PROPIA',
      'PAPELETA_APROBAR_JEFE','DASHBOARD_VER_PROPIO','REPORTES_EXPORTAR'
    )
    WHERE R.CodigoRol = 'JEFE_AREA'

    UNION ALL
    /* COLABORADOR */
    SELECT R.IdRolApp, P.IdPermisoApp
    FROM dbo.TBL_ROLES_APP R
    JOIN dbo.TBL_PERMISOS_APP P ON P.CodigoPermiso IN (
      'PAPELETA_VER_PROPIAS','PAPELETA_CREAR','PAPELETA_EDITAR_PROPIA','PAPELETA_ANULAR_PROPIA',
      'DASHBOARD_VER_PROPIO'
    )
    WHERE R.CodigoRol = 'COLABORADOR'
  )
  MERGE dbo.TBL_ROL_PERMISO_APP AS T
  USING (SELECT DISTINCT IdRolApp, IdPermisoApp FROM RolePerm) AS S
    ON T.IdRolApp = S.IdRolApp AND T.IdPermisoApp = S.IdPermisoApp
  WHEN MATCHED THEN
    UPDATE SET T.Activo = '1'
  WHEN NOT MATCHED THEN
    INSERT (IdRolApp, IdPermisoApp, Activo, AsignadoPor)
    VALUES (S.IdRolApp, S.IdPermisoApp, '1', 'MIGRACION');

  /* =========================================================
     6) Migracion inicial de usuarios locales -> roles app
     ========================================================= */
  ;WITH Mapeo AS (
    SELECT
      U.IdUsuario,
      CASE
        WHEN UPPER(LTRIM(RTRIM(U.Rol))) IN ('SUPERADMIN') THEN 'SUPERADMIN'
        WHEN UPPER(LTRIM(RTRIM(U.Rol))) IN ('ADMIN','ADMINISTRADOR','ADMINISTRADOR DEL SISTEMA') THEN 'ADMIN'
        WHEN UPPER(LTRIM(RTRIM(U.Rol))) IN ('RRHH','RR HH','RECURSOS HUMANOS') THEN 'RRHH'
        WHEN UPPER(LTRIM(RTRIM(U.Rol))) IN ('JEFE_AREA','JEFE DE AREA','JEFE') THEN 'JEFE_AREA'
        ELSE 'COLABORADOR'
      END AS CodigoRolMapeado
    FROM dbo.TBL_USUARIOS U
  )
  MERGE dbo.TBL_USUARIO_ROL_APP AS T
  USING (
    SELECT M.IdUsuario, R.IdRolApp
    FROM Mapeo M
    JOIN dbo.TBL_ROLES_APP R ON R.CodigoRol = M.CodigoRolMapeado
  ) AS S
    ON T.IdUsuario = S.IdUsuario AND T.IdRolApp = S.IdRolApp
  WHEN MATCHED THEN
    UPDATE SET T.Activo = '1'
  WHEN NOT MATCHED THEN
    INSERT (IdUsuario, IdRolApp, Activo, AsignadoPor, Observacion)
    VALUES (S.IdUsuario, S.IdRolApp, '1', 'MIGRACION', 'Rol migrado desde TBL_USUARIOS.Rol');

  /* =========================================================
     7) Migracion inicial de usuarios ERP -> roles app
     ========================================================= */
  ;WITH MapeoERP AS (
    SELECT
      E.UserLogon,
      CASE
        WHEN UPPER(LTRIM(RTRIM(E.RolApp))) IN ('SUPERADMIN') THEN 'SUPERADMIN'
        WHEN UPPER(LTRIM(RTRIM(E.RolApp))) IN ('ADMIN','ADMINISTRADOR','ADMINISTRADOR DEL SISTEMA') THEN 'ADMIN'
        WHEN UPPER(LTRIM(RTRIM(E.RolApp))) IN ('RRHH','RR HH','RECURSOS HUMANOS') THEN 'RRHH'
        WHEN UPPER(LTRIM(RTRIM(E.RolApp))) IN ('JEFE_AREA','JEFE DE AREA','JEFE') THEN 'JEFE_AREA'
        ELSE 'COLABORADOR'
      END AS CodigoRolMapeado,
      CASE WHEN ISNULL(E.Activo, '1') = '1' THEN '1' ELSE '0' END AS ActivoMapeado
    FROM dbo.TBL_ROLES_USUARIO_ERP E
  )
  MERGE dbo.TBL_USUARIO_ERP_ROL_APP AS T
  USING (
    SELECT M.UserLogon, R.IdRolApp, M.ActivoMapeado
    FROM MapeoERP M
    JOIN dbo.TBL_ROLES_APP R ON R.CodigoRol = M.CodigoRolMapeado
  ) AS S
    ON T.UserLogon = S.UserLogon AND T.IdRolApp = S.IdRolApp
  WHEN MATCHED THEN
    UPDATE SET T.Activo = S.ActivoMapeado
  WHEN NOT MATCHED THEN
    INSERT (UserLogon, IdRolApp, Activo, AsignadoPor, Observacion)
    VALUES (S.UserLogon, S.IdRolApp, S.ActivoMapeado, 'MIGRACION', 'Rol migrado desde TBL_ROLES_USUARIO_ERP');

  /* =========================================================
     8) Compatibilidad: ampliar check constraint de Rol local
     ========================================================= */
  IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_TBL_USUARIOS_Rol'
      AND parent_object_id = OBJECT_ID('dbo.TBL_USUARIOS')
  )
  BEGIN
    ALTER TABLE dbo.TBL_USUARIOS DROP CONSTRAINT CK_TBL_USUARIOS_Rol;
  END;

  ALTER TABLE dbo.TBL_USUARIOS WITH CHECK
  ADD CONSTRAINT CK_TBL_USUARIOS_Rol
  CHECK (
    Rol IN (
      'USUARIO','RRHH','ADMIN',
      'COLABORADOR','JEFE_AREA','SUPERADMIN'
    )
  );

  COMMIT TRAN;
  PRINT 'OK: Migracion RBAC 5 niveles completada.';
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRAN;
  DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
  DECLARE @ErrLine INT = ERROR_LINE();
  DECLARE @ErrNum INT = ERROR_NUMBER();
  RAISERROR('Error en migracion RBAC (linea %d, error %d): %s', 16, 1, @ErrLine, @ErrNum, @ErrMsg);
END CATCH;
GO

/* =========================================================
   9) Consultas de verificacion rapida
   ========================================================= */
SELECT IdRolApp, CodigoRol, NombreRol, NivelJerarquia, Activo
FROM dbo.TBL_ROLES_APP
ORDER BY NivelJerarquia DESC;

SELECT TOP 30
  U.IdUsuario,
  U.Usuario,
  U.Rol AS RolLegacy,
  R.CodigoRol AS RolNuevo,
  UR.Activo
FROM dbo.TBL_USUARIOS U
LEFT JOIN dbo.TBL_USUARIO_ROL_APP UR ON UR.IdUsuario = U.IdUsuario AND UR.Activo = '1'
LEFT JOIN dbo.TBL_ROLES_APP R ON R.IdRolApp = UR.IdRolApp
ORDER BY U.IdUsuario;

