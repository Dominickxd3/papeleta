/*
  Fecha: 2026-11-20
  Objeto: dbo.TBL_GGHH_HorarioAjuste (DB_GP_Trabajos_TEST, 10.10.1.6)

  Ajustes manuales del horario de un trabajador en un dia, para casos
  excepcionales. Solo ADMIN / RRHH los crean, editan o anulan desde la
  pagina Horarios. Cada cambio queda en TBL_AUDITORIA.

  - NoContarFalta:    el dia sin marcas no cuenta como falta.
  - NoContarTardanza: la tardanza de ese dia no se descuenta.
  - NoContarSalida:   la salida antes de hora no se descuenta.
  - NoContarExtra:    el tiempo extra de ese dia no suma a favor.
  - HoraEntrada / HoraSalida: horario correcto de ese dia cuando el
    programado en SIGA no concuerda (se recalculan tardanza, salida y extra).
  - Motivo: obligatorio.
  - Activo = 0: ajuste anulado (no se borra).
*/
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO
IF OBJECT_ID('dbo.TBL_GGHH_HorarioAjuste') IS NULL
BEGIN
    CREATE TABLE dbo.TBL_GGHH_HorarioAjuste (
        IdAjuste          int IDENTITY(1,1) NOT NULL CONSTRAINT PK_TBL_GGHH_HorarioAjuste PRIMARY KEY,
        DNI               varchar(20)   NOT NULL,
        Fecha             date          NOT NULL,
        NoContarFalta     bit           NOT NULL CONSTRAINT DF_HorAj_Falta DEFAULT (0),
        NoContarTardanza  bit           NOT NULL CONSTRAINT DF_HorAj_Tard  DEFAULT (0),
        NoContarSalida    bit           NOT NULL CONSTRAINT DF_HorAj_Sal   DEFAULT (0),
        NoContarExtra     bit           NOT NULL CONSTRAINT DF_HorAj_Extra DEFAULT (0),
        HoraEntrada       char(5)       NULL,
        HoraSalida        char(5)       NULL,
        Motivo            nvarchar(300) NOT NULL,
        Activo            bit           NOT NULL CONSTRAINT DF_HorAj_Activo DEFAULT (1),
        UsuarioRegistro   varchar(80)   NOT NULL,
        FechaRegistro     datetime      NOT NULL CONSTRAINT DF_HorAj_FReg DEFAULT (GETDATE()),
        UsuarioModifica   varchar(80)   NULL,
        FechaModifica     datetime      NULL
    );
    -- Un solo ajuste activo por trabajador y dia
    CREATE UNIQUE INDEX UX_HorarioAjuste_DNI_Fecha_Activo
        ON dbo.TBL_GGHH_HorarioAjuste (DNI, Fecha) WHERE Activo = 1;
END;
GO
