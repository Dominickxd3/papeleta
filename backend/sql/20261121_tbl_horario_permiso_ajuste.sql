/*
  Fecha: 2026-11-21
  Objeto: dbo.TBL_GGHH_HorarioPermisoAjuste (DB_GP_Trabajos_TEST, 10.10.1.6)

  Usuarios (jefes) a los que ADMIN / RRHH dan permiso para ajustar horarios
  en la pagina Horarios. Un usuario con permiso solo puede ajustar a los
  trabajadores de SUS areas asignadas (TBL_USUARIO_ERP_AREA_APP).
  Activo = 0: permiso quitado (no se borra). Cada cambio queda en TBL_AUDITORIA.
*/
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO
IF OBJECT_ID('dbo.TBL_GGHH_HorarioPermisoAjuste') IS NULL
BEGIN
    CREATE TABLE dbo.TBL_GGHH_HorarioPermisoAjuste (
        UserLogon        varchar(80) NOT NULL CONSTRAINT PK_TBL_GGHH_HorarioPermisoAjuste PRIMARY KEY,
        Activo           bit         NOT NULL CONSTRAINT DF_HorPerm_Activo DEFAULT (1),
        AsignadoPor      varchar(80) NOT NULL,
        FechaAsignacion  datetime    NOT NULL CONSTRAINT DF_HorPerm_Fecha DEFAULT (GETDATE()),
        UsuarioModifica  varchar(80) NULL,
        FechaModifica    datetime    NULL
    );
END;
GO
