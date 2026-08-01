// src/services/papeleta.flujo.service.js
// Orquestacion de los casos de uso de papeletas: listar, crear, editar,
// anular, restaurar, gestionar (aprobar/rechazar), reporte, historial,
// PDF y exportacion a Excel. Cada metodo devuelve { status, body } con el
// contrato HTTP identico al original (routes/papeletas.routes.js), para que
// el controlador solo haga res.status(status).json(body) (o stream del PDF/Excel).
// Orden replicado del legacy: validar -> ejecutar SQL -> actualizar -> auditar -> notificar.

const { isPrivilegedRole } = require('../security/roles');
const { canEditPapeleta, canDownloadDocument } = require('../security/policy');
const {
  parseDateTimeInput,
  extractVacacionesRange,
  getDateParts
} = require('../validators/papeleta.validator');

function createPapeletaFlujoService(deps) {
  const {
    getPool,
    sql,
    repository,
    auditoriaRepository,
    esquemaRepository,
    erpRepository,
    negocio,
    estadoCache,
    convertirHoraSQL,
    registrarAuditoria,
    crearNotificacionUsuario,
    crearNotificacionRRHH,
    getClientIp
  } = deps;

  if (!getPool || !sql || !repository || !negocio || !estadoCache) {
    throw new Error('createPapeletaFlujoService: faltan dependencias requeridas (getPool, sql, repository, negocio, estadoCache)');
  }

  const MSJ_HSALIDA_OBLIGATORIA = "Validation failed for parameter 'HSalidaPP'. La hora de salida es obligatoria.";
  const MSJ_CONFLICTO_HORARIO = (conflicto) =>
    `Ya existe una papeleta activa para este trabajador con cruce de horario en la fecha seleccionada. Papeleta N° ${conflicto.NumeroPP || conflicto.IdPP}.`;

  // ---------- consultas ----------

  async function listarPapeletas({ user = {}, query = {} } = {}) {
    try {
      const pageRaw = Number(query?.page);
      const pageSizeRaw = Number(query?.pageSize);
      const paginated = Number.isInteger(pageRaw) || Number.isInteger(pageSizeRaw);
      const page = Math.max(1, Number.isInteger(pageRaw) ? pageRaw : 1);
      const pageSize = Math.min(100, Math.max(1, Number.isInteger(pageSizeRaw) ? pageSizeRaw : 20));

      const filtros = {
        texto: String(query?.texto || '').trim(),
        area: String(query?.area || '').trim(),
        estado: String(query?.estado || '').trim().toLowerCase(),
        mostrarAnulados: String(query?.mostrarAnulados || '').trim().toLowerCase()
      };

      const ctx = negocio.extraerContextoUsuario(user);
      const hasCreatorCol = await esquemaRepository.hasIdUsuarioCreadorColumn();
      const isErpUser = negocio.esUsuarioErp(ctx);
      const erpAccess = isErpUser
        ? await erpRepository.getErpAreaAccess(ctx.userLogin)
        : { swNivel: 0, areas: [] };

      const visibilidad = negocio.construirVisibilidad({
        userRole: ctx.userRole,
        userId: ctx.userId,
        userLogin: ctx.userLogin,
        userOrigen: ctx.userOrigen,
        tokenSwNivel: ctx.tokenSwNivel,
        userDoi: ctx.userDoi,
        userNombre: ctx.userNombre,
        isErpUser,
        erpAccess,
        hasCreatorCol
      });

      const { rows, total } = await repository.listar({
        filtros,
        visibilidad,
        paginacion: { page, pageSize, paginated }
      });

      if (!paginated) {
        return { status: 200, body: rows };
      }

      return {
        status: 200,
        body: {
          success: true,
          data: rows,
          pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.max(1, Math.ceil(total / pageSize))
          }
        }
      };
    } catch (error) {
      console.error('Error:', error);
      return { status: 500, body: { success: false, message: error.message } };
    }
  }

  async function obtenerPorEstado() {
    try {
      const cacheado = estadoCache.obtener();
      if (cacheado !== null) {
        return { status: 200, body: cacheado };
      }
      const data = await repository.porEstado();
      estadoCache.fijar(data);
      return { status: 200, body: data };
    } catch (error) {
      console.error('Error:', error);
      return { status: 500, body: { success: false, message: error.message } };
    }
  }

  async function mostrarPapeletas() {
    try {
      const rows = await repository.mostrar();
      return { status: 200, body: rows };
    } catch (error) {
      console.error('Error:', error.message);
      const friendlyMessage = negocio.getFriendlySqlErrorMessage(error);
      const statusCode = friendlyMessage === error.message ? 500 : 409;
      return { status: statusCode, body: { success: false, message: friendlyMessage } };
    }
  }

  async function obtenerUltimoNumero() {
    try {
      const ultimo = await repository.ultimoNumero();
      return { status: 200, body: { ultimoNumero: ultimo } };
    } catch (error) {
      console.error('Error obteniendo último número:', error);
      return { status: 500, body: { success: false, message: 'Error obteniendo Ãºltimo nÃºmero: ' + error.message } };
    }
  }

  async function obtenerReporte(id) {
    try {
      const row = await repository.reporte(id);
      return { status: 200, body: row };
    } catch (error) {
      console.error('Error:', error.message);
      return { status: 500, body: { success: false, message: error.message } };
    }
  }

  async function obtenerHistorial(id) {
    try {
      const parsedId = Number(id);
      if (!Number.isInteger(parsedId) || parsedId <= 0) {
        return { status: 400, body: { success: false, message: 'Id de papeleta invalido' } };
      }
      const rows = await auditoriaRepository.historial(parsedId);
      return { status: 200, body: { success: true, data: rows || [] } };
    } catch (error) {
      console.error('Error cargando historial de papeleta:', error);
      return { status: 500, body: { success: false, message: error.message } };
    }
  }

  // ---------- crear ----------

  async function registrarCreacion(payload = {}, user = {}, req = {}) {
    const p = payload;
    try {
      let horaSalida, horaRetorno, tiempo;
      try {
        horaSalida = convertirHoraSQL(p.HSalidaPP, 'HSalidaPP');
        horaRetorno = convertirHoraSQL(p.HRetornoPP, 'HRetornoPP');
        tiempo = convertirHoraSQL(p.TiempoPP, 'TiempoPP');
      } catch (error) {
        return { status: 400, body: { success: false, message: error.message } };
      }
      if (!horaSalida) {
        return { status: 400, body: { success: false, message: MSJ_HSALIDA_OBLIGATORIA } };
      }

      let numeroCorrelativo = 0;
      let inserted = {};
      const userIdToken = Number(user?.id || user?.IdUsuario || user?.idUsuario || 0) || null;
      const userLogin = String(user?.usuario || user?.Usuario || '').trim();
      let idUsuarioCreador = userIdToken;
      let idInsertado = null;
      const tx = new sql.Transaction(getPool());

      try {
        await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

        const filasExistentes = await repository.buscarPapeletasActivasFecha({
          doi: p.DOIPP,
          fechaPermiso: p.FechaPermisoPP,
          tx
        });
        const conflictoHorario = negocio.evaluarCruceHorario(filasExistentes, { horaSalida, horaRetorno });
        if (conflictoHorario) {
          throw new Error(MSJ_CONFLICTO_HORARIO(conflictoHorario));
        }

        const seqResult = await new sql.Request(tx).query(`
          SELECT ISNULL(MAX(NumeroPP), 0) + 1 AS NextNumero
          FROM TBL_GGHH_PapeletaPermiso WITH (UPDLOCK, HOLDLOCK)
        `);
        numeroCorrelativo = Number(seqResult.recordset?.[0]?.NextNumero || 1);

        const result = await new sql.Request(tx)
          .input('FechaRegistroPP', sql.DateTime, parseDateTimeInput(p.FechaRegistroPP, 'FechaRegistroPP'))
          .input('PcRegistroPP', sql.VarChar(50), String(p.PcRegistroPP || '').trim())
          .input('FechaModificacionPP', sql.DateTime, parseDateTimeInput(p.FechaModificacionPP, 'FechaModificacionPP'))
          .input('PcModificacionPP', sql.VarChar(50), String(p.PcModificacionPP || '').trim())
          .input('FechaEmisionPP', sql.DateTime, parseDateTimeInput(p.FechaEmisionPP, 'FechaEmisionPP'))
          .input('FechaPermisoPP', sql.Date, parseDateTimeInput(p.FechaPermisoPP, 'FechaPermisoPP', { dateOnly: true }))
          .input('NumeroPP', sql.Int, numeroCorrelativo)
          .input('DOIPP', sql.VarChar(20), String(p.DOIPP || '').trim())
          .input('TrabajadorPP', sql.VarChar(150), String(p.TrabajadorPP || '').trim())
          .input('CargoPP', sql.VarChar(100), String(p.CargoPP || '').trim())
          .input('AreaPP', sql.VarChar(100), String(p.AreaPP || '').trim())
          .input('MotivoPP', sql.VarChar(sql.MAX), String(p.MotivoPP || '').trim())
          .input('ConsiderarPP', sql.VarChar(100), String(p.ConsiderarPP || '').trim())
          .input('HSalidaPP', sql.Time(7), horaSalida)
          .input('HRetornoPP', sql.Time(7), horaRetorno)
          .input('TiempoPP', sql.Time(7), tiempo)
          .input('ObservacionesPP', sql.VarChar(sql.MAX), String(p.ObservacionesPP || '').trim())
          .input('ActivoPP', sql.Char(1), String(p.ActivoPP || '1').trim().slice(0, 1))
          .execute('insertar_PapeletaPermiso_gp');

        inserted = result?.recordset?.[0] || {};

        if (!idUsuarioCreador && userLogin) {
          idUsuarioCreador = await repository.lookupIdUsuarioPorLogin(userLogin, { tx });
        }

        if (idUsuarioCreador) {
          const hasCreatorCol = await esquemaRepository.hasIdUsuarioCreadorColumn();
          if (hasCreatorCol) {
            idInsertado = Number(inserted.IdPP || 0) || null;
            if (!idInsertado && numeroCorrelativo > 0) {
              idInsertado = await repository.lookupIdPPUltimoInsertado(numeroCorrelativo, p.DOIPP, { tx });
            }
            if (idInsertado) {
              await new sql.Request(tx)
                .input('IdPP', sql.Int, idInsertado)
                .input('IdUsuarioCreador', sql.Int, idUsuarioCreador)
                .query(`UPDATE TBL_GGHH_PapeletaPermiso SET IdUsuarioCreador = @IdUsuarioCreador WHERE IdPP = @IdPP`);
            }
          }
        }

        idInsertado = idInsertado || Number(inserted.IdPP || 0) || null;
        if (idInsertado) {
          const { hasFechaVacDesdePP, hasFechaVacHastaPP } = await esquemaRepository.getVacacionesColumnsAvailability();
          if (hasFechaVacDesdePP && hasFechaVacHastaPP) {
            const { desde, hasta } = extractVacacionesRange(p);
            await new sql.Request(tx)
              .input('IdPP', sql.Int, idInsertado)
              .input('FechaVacDesdePP', sql.Date, desde)
              .input('FechaVacHastaPP', sql.Date, hasta)
              .query(`
                UPDATE TBL_GGHH_PapeletaPermiso
                SET FechaVacDesdePP = @FechaVacDesdePP,
                    FechaVacHastaPP = @FechaVacHastaPP
                WHERE IdPP = @IdPP
              `);
          }
        }

        if (idInsertado) {
          const registroNuevoAuditoria = {
            IdPP: idInsertado,
            NumeroPP: inserted.NumeroPP || numeroCorrelativo || null,
            DOIPP: p.DOIPP || '',
            TrabajadorPP: p.TrabajadorPP || '',
            FechaPermisoPP: p.FechaPermisoPP || null,
            EstadoAprobacion: 'PENDIENTE'
          };

          await registrarAuditoria(() => new sql.Request(tx), {
            tabla: 'TBL_GGHH_PapeletaPermiso',
            idRegistro: idInsertado,
            accion: 'CREAR',
            usuario: user?.usuario || null,
            nombreUsuario: user?.nombre || null,
            ip: getClientIp(req),
            navegador: req.headers?.['user-agent'] || null,
            datosNuevos: JSON.stringify(registroNuevoAuditoria),
            observaciones: 'Registro de papeleta'
          });

          await crearNotificacionRRHH(() => new sql.Request(tx), {
            titulo: 'Nueva papeleta pendiente',
            mensaje: `Papeleta N° ${registroNuevoAuditoria.NumeroPP || ''} registrada por ${p.TrabajadorPP || user?.nombre || user?.usuario || 'usuario'}.`,
            tipo: 'INFO',
            idPapeleta: idInsertado,
            url: '/HTML/permisos.html'
          });
        }

        await tx.commit();
        estadoCache.invalidar();
      } catch (txErr) {
        try { await tx.rollback(); } catch {}
        throw txErr;
      }

      return {
        status: 200,
        body: {
          success: true,
          message: 'Papeleta registrada correctamente',
          id: inserted.IdPP || null,
          numero: inserted.NumeroPP || numeroCorrelativo || null
        }
      };
    } catch (err) {
      console.error('Error:', err.message);
      const friendlyMessage = negocio.getFriendlySqlErrorMessage(err);
      const statusCode = friendlyMessage === err.message ? 500 : 409;
      return { status: statusCode, body: { success: false, message: friendlyMessage } };
    }
  }

  // ---------- editar ----------

  async function editarPapeleta(payload = {}, user = {}, req = {}) {
    const p = payload;
    try {
      const previo = await repository.obtenerPrevio(Number(p.IdPP));
      if (!previo) {
        return { status: 404, body: { success: false, message: 'Papeleta no encontrada' } };
      }

      const decision = canEditPapeleta(user, previo);
      if (!decision.allowed) {
        return { status: decision.status || 403, body: { success: false, message: decision.message } };
      }

      let horaSalida, horaRetorno, tiempo;
      try {
        horaSalida = convertirHoraSQL(p.HSalidaPP, 'HSalidaPP');
        horaRetorno = convertirHoraSQL(p.HRetornoPP, 'HRetornoPP');
        tiempo = convertirHoraSQL(p.TiempoPP, 'TiempoPP');
      } catch (error) {
        return { status: 400, body: { success: false, message: error.message } };
      }
      if (!horaSalida) {
        return { status: 400, body: { success: false, message: MSJ_HSALIDA_OBLIGATORIA } };
      }

      const filasExistentes = await repository.buscarPapeletasActivasFecha({
        doi: p.DOIPP,
        fechaPermiso: p.FechaPermisoPP,
        excludeId: p.IdPP
      });
      const conflictoHorario = negocio.evaluarCruceHorario(filasExistentes, { horaSalida, horaRetorno });
      if (conflictoHorario) {
        return { status: 409, body: { success: false, message: MSJ_CONFLICTO_HORARIO(conflictoHorario) } };
      }

      await getPool().request()
        .input('IdPP', sql.Int, p.IdPP)
        .input('FechaModificacionPP', sql.DateTime, parseDateTimeInput(p.FechaModificacionPP, 'FechaModificacionPP'))
        .input('PcModificacionPP', sql.VarChar(50), String(p.PcModificacionPP || '').trim())
        .input('FechaPermisoPP', sql.Date, parseDateTimeInput(p.FechaPermisoPP, 'FechaPermisoPP', { dateOnly: true }))
        .input('NumeroPP', sql.Int, p.NumeroPP)
        .input('DOIPP', sql.VarChar(20), String(p.DOIPP || '').trim())
        .input('TrabajadorPP', sql.VarChar(150), String(p.TrabajadorPP || '').trim())
        .input('CargoPP', sql.VarChar(100), String(p.CargoPP || '').trim())
        .input('AreaPP', sql.VarChar(100), String(p.AreaPP || '').trim())
        .input('MotivoPP', sql.VarChar(sql.MAX), String(p.MotivoPP || '').trim())
        .input('ConsiderarPP', sql.VarChar(100), String(p.ConsiderarPP || '').trim())
        .input('HSalidaPP', sql.Time(7), horaSalida)
        .input('HRetornoPP', sql.Time(7), horaRetorno)
        .input('TiempoPP', sql.Time(7), tiempo)
        .input('ObservacionesPP', sql.VarChar(sql.MAX), String(p.ObservacionesPP || '').trim())
        .input('ActivoPP', sql.Char(1), String(p.ActivoPP || '1').trim().slice(0, 1))
        .execute('editar_PapeletaPermiso_gp');

      const { hasFechaVacDesdePP, hasFechaVacHastaPP } = await esquemaRepository.getVacacionesColumnsAvailability();
      if (hasFechaVacDesdePP && hasFechaVacHastaPP) {
        const { desde, hasta } = extractVacacionesRange(p);
        await getPool().request()
          .input('IdPP', sql.Int, Number(p.IdPP))
          .input('FechaVacDesdePP', sql.Date, desde)
          .input('FechaVacHastaPP', sql.Date, hasta)
          .query(`
            UPDATE TBL_GGHH_PapeletaPermiso
            SET FechaVacDesdePP = @FechaVacDesdePP,
                FechaVacHastaPP = @FechaVacHastaPP
            WHERE IdPP = @IdPP
          `);
      }

      const actualizado = await repository.obtenerActualizado(Number(p.IdPP));

      await registrarAuditoria(() => getPool().request(), {
        tabla: 'TBL_GGHH_PapeletaPermiso',
        idRegistro: Number(p.IdPP),
        accion: 'EDITAR',
        usuario: user?.usuario || null,
        nombreUsuario: user?.nombre || null,
        ip: getClientIp(req),
        navegador: req.headers?.['user-agent'] || null,
        datosAnteriores: previo ? JSON.stringify(previo) : null,
        datosNuevos: actualizado ? JSON.stringify(actualizado) : JSON.stringify(p),
        observaciones: 'Actualización de papeleta'
      });
      estadoCache.invalidar();

      return { status: 200, body: { success: true, message: 'Papeleta editada correctamente' } };
    } catch (err) {
      console.error('Error:', err.message);
      return { status: 500, body: { success: false, message: err.message } };
    }
  }

  // ---------- anular ----------

  async function anularPapeleta(id, user = {}, req = {}) {
    try {
      const previo = await repository.obtenerPrevio(Number(id));

      await getPool().request().input('IdPP', sql.Int, id).execute('eliminar_PapeletaPermiso_gp');
      await getPool().request()
        .input('IdPP', sql.Int, Number(id))
        .input('UsuarioRRHH', sql.NVarChar(50), user?.usuario || null)
        .query(`
          UPDATE TBL_GGHH_PapeletaPermiso
          SET EstadoAprobacion = 'RECHAZADO',
              AprobadoPorRRHH = COALESCE(AprobadoPorRRHH, @UsuarioRRHH),
              FechaAprobacionRRHH = COALESCE(FechaAprobacionRRHH, GETDATE()),
              RazonRechazo = COALESCE(RazonRechazo, 'Anulada desde el sistema')
          WHERE IdPP = @IdPP
        `);

      const actualizado = await repository.obtenerActualizado(Number(id));

      await registrarAuditoria(() => getPool().request(), {
        tabla: 'TBL_GGHH_PapeletaPermiso',
        idRegistro: Number(id),
        accion: 'ANULAR',
        usuario: user?.usuario || null,
        nombreUsuario: user?.nombre || null,
        ip: getClientIp(req),
        navegador: req.headers?.['user-agent'] || null,
        datosAnteriores: previo ? JSON.stringify(previo) : null,
        datosNuevos: actualizado ? JSON.stringify(actualizado) : null,
        observaciones: 'Papeleta marcada como inactiva'
      });
      estadoCache.invalidar();

      return { status: 200, body: { success: true, message: 'Estado cambiado correctamente' } };
    } catch (err) {
      console.error('Error:', err.message);
      return { status: 500, body: { success: false, message: err.message } };
    }
  }

  // ---------- restaurar ----------

  async function restaurarPapeleta(id, user = {}, req = {}) {
    try {
      const previo = await repository.obtenerPrevio(Number(id));
      if (!previo) {
        return { status: 404, body: { success: false, message: 'Papeleta no encontrada' } };
      }

      await getPool().request()
        .input('IdPP', sql.Int, Number(id))
        .query(`
          UPDATE TBL_GGHH_PapeletaPermiso
          SET ActivoPP = '1',
              EstadoAprobacion = 'PENDIENTE',
              AprobadoPorRRHH = NULL,
              FechaAprobacionRRHH = NULL,
              RazonRechazo = NULL,
              FechaModificacionPP = GETDATE()
          WHERE IdPP = @IdPP
        `);

      const actualizado = await repository.obtenerActualizado(Number(id));

      await registrarAuditoria(() => getPool().request(), {
        tabla: 'TBL_GGHH_PapeletaPermiso',
        idRegistro: Number(id),
        accion: 'RESTAURAR',
        usuario: user?.usuario || null,
        nombreUsuario: user?.nombre || null,
        ip: getClientIp(req),
        navegador: req.headers?.['user-agent'] || null,
        datosAnteriores: previo ? JSON.stringify(previo) : null,
        datosNuevos: actualizado ? JSON.stringify(actualizado) : null,
        observaciones: 'Papeleta restaurada a pendiente'
      });
      estadoCache.invalidar();

      return { status: 200, body: { success: true, message: 'Papeleta restaurada correctamente' } };
    } catch (err) {
      console.error('Error al restaurar:', err.message);
      return { status: 500, body: { success: false, message: err.message } };
    }
  }

  // ---------- gestionar (aprobar/rechazar RRHH) ----------

  async function gestionarEstado(payload = {}, user = {}, req = {}) {
    const { IdPP, nuevoEstado, observacionesAdmin } = payload;
    try {
      const estadosValidos = ['APROBADO_RRHH', 'RECHAZADO'];
      if (!estadosValidos.includes(nuevoEstado)) {
        return { status: 400, body: { success: false, message: 'Estado de aprobación no valido' } };
      }

      const previo = await repository.obtenerPrevio(Number(IdPP));

      await getPool().request()
        .input('IdPP', sql.Int, Number(IdPP))
        .input('Estado', sql.NVarChar(20), nuevoEstado)
        .input('Obs', sql.NVarChar(sql.MAX), observacionesAdmin || '')
        .input('UsuarioRRHH', sql.NVarChar(50), user?.usuario || null)
        .query(`
          UPDATE TBL_GGHH_PapeletaPermiso
          SET EstadoAprobacion = @Estado,
              AprobadoPorRRHH = @UsuarioRRHH,
              FechaAprobacionRRHH = GETDATE(),
              RazonRechazo = CASE WHEN @Estado = 'RECHAZADO' THEN NULLIF(@Obs, '') ELSE NULL END,
              ObservacionesPP = CONCAT(
                ISNULL(ObservacionesPP,''),
                CASE WHEN LEN(ISNULL(@Obs,'')) > 0 THEN CONCAT(' | Nota RRHH: ', @Obs) ELSE '' END
              )
          WHERE IdPP = @IdPP
        `);

      const actualizado = await repository.obtenerActualizado(Number(IdPP));

      await registrarAuditoria(() => getPool().request(), {
        tabla: 'TBL_GGHH_PapeletaPermiso',
        idRegistro: Number(IdPP),
        accion: nuevoEstado === 'APROBADO_RRHH' ? 'APROBAR_RRHH' : 'RECHAZAR_RRHH',
        usuario: user?.usuario || null,
        nombreUsuario: user?.nombre || null,
        ip: getClientIp(req),
        navegador: req.headers?.['user-agent'] || null,
        datosAnteriores: previo ? JSON.stringify(previo) : null,
        datosNuevos: actualizado ? JSON.stringify(actualizado) : null,
        observaciones: observacionesAdmin || null
      });

      const destinoResult = await getPool().request()
        .input('IdPP', sql.Int, Number(IdPP))
        .query(`
          SELECT TOP 1 U.Usuario
          FROM TBL_GGHH_PapeletaPermiso P
          LEFT JOIN TBL_USUARIOS U ON U.IdUsuario = P.IdUsuarioCreador
          WHERE P.IdPP = @IdPP
        `);
      const usuarioDestino = destinoResult.recordset?.[0]?.Usuario || null;
      if (usuarioDestino) {
        const estadoTxt = nuevoEstado === 'APROBADO_RRHH' ? 'aprobada' : 'rechazada';
        await crearNotificacionUsuario(() => getPool().request(), {
          usuarioDestino,
          titulo: `Tu papeleta fue ${estadoTxt}`,
          mensaje: `La papeleta #${actualizado?.NumeroPP || IdPP} fue ${estadoTxt} por RRHH.`,
          tipo: nuevoEstado === 'APROBADO_RRHH' ? 'SUCCESS' : 'WARNING',
          idPapeleta: Number(IdPP),
          url: '/HTML/permisos.html'
        });
      }
      estadoCache.invalidar();

      return {
        status: 200,
        body: {
          success: true,
          message: `Papeleta ${nuevoEstado === 'APROBADO_RRHH' ? 'aprobada' : 'rechazada'} con exito`
        }
      };
    } catch (error) {
      console.error('Error al gestionar papeleta:', error);
      return { status: 500, body: { success: false, message: 'Error interno: ' + error.message } };
    }
  }

  // ---------- PDF (preparacion de datos) ----------

  async function obtenerPorIdParaPDF(id, user = {}, query = {}) {
    try {
      const paperRaw = String(query?.paper || 'A4').toUpperCase();
      const allowedPapers = new Set(['A4', 'A5']);
      const paper = allowedPapers.has(paperRaw) ? paperRaw : 'A4';

      const estadoActual = await repository.obtenerEstadoPapeleta(id);
      const decision = canDownloadDocument(user, { EstadoAprobacion: estadoActual });
      if (!decision.allowed) {
        return { status: decision.status || 403, body: { success: false, message: decision.message } };
      }

      const reporte = await repository.reporte(id);
      if (!reporte) {
        return { status: 404, body: { success: false, message: 'No se encontro la papeleta para generar PDF' } };
      }

      let vacacionesDesdePP = null;
      let vacacionesHastaPP = null;
      try {
        const { hasFechaVacDesdePP, hasFechaVacHastaPP } = await esquemaRepository.getVacacionesColumnsAvailability();
        if (hasFechaVacDesdePP && hasFechaVacHastaPP) {
          const vac = await repository.obtenerVacacionesPP(id);
          vacacionesDesdePP = vac.desde;
          vacacionesHastaPP = vac.hasta;
        }
      } catch (_) {}

      let creadorPapeletaNombre = '';
      try {
        creadorPapeletaNombre = await repository.obtenerCreadorPapeleta(id);
      } catch (_) {}

      const formatDate = (value, { useUTC = false } = {}) => {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
        const dd = String(useUTC ? date.getUTCDate() : date.getDate()).padStart(2, '0');
        const mm = String((useUTC ? date.getUTCMonth() : date.getMonth()) + 1).padStart(2, '0');
        const yy = useUTC ? date.getUTCFullYear() : date.getFullYear();
        return `${dd}/${mm}/${yy}`;
      };

      const formatTime = (value) => {
        if (!value) return '';
        const raw = String(value).trim();
        const match = raw.match(/(\d{2}:\d{2}:\d{2})/);
        return match ? match[1] : raw;
      };

      const normalizeMotivo = (value) => String(value || '').replace(/\s+/g, ' ').trim();

      const normalizeConsiderar = (value, vacDesde = null, vacHasta = null) => {
        const raw = String(value || '').trim();
        if (!raw) return '';
        const toDateParts = (v) => {
          const s = String(v || '').trim().replace(/\//g, '-');
          const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (!m) return null;
          return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
        };
        const diasInclusivos = (a, b) => {
          const ap = toDateParts(a);
          const bp = toDateParts(b);
          if (!ap || !bp) return null;
          const da = Date.UTC(ap.y, ap.m - 1, ap.d);
          const db = Date.UTC(bp.y, bp.m - 1, bp.d);
          if (Number.isNaN(da) || Number.isNaN(db) || db < da) return null;
          return Math.floor((db - da) / 86400000) + 1;
        };
        if (vacDesde && vacHasta) {
          const desdeTxt = formatDate(vacDesde, { useUTC: true });
          const hastaTxt = formatDate(vacHasta, { useUTC: true });
          const dias = diasInclusivos(desdeTxt.split('/').reverse().join('-'), hastaTxt.split('/').reverse().join('-'));
          if (dias) return `Vacaciones ${dias} dia${dias === 1 ? '' : 's'}`;
          return `Vacaciones del ${desdeTxt} al ${hastaTxt}`;
        }
        const fmtIso = (iso) => {
          const s = String(iso || '').trim().replace(/\//g, '-');
          const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (!m) return String(iso || '').trim();
          return `${m[3]}/${m[2]}/${m[1]}`;
        };
        const matchVacRange = raw.match(
          /vacaciones\s*:?\s*(\d{4}[-/]\d{2}[-/]\d{2}).*?(\d{4}[-/]\d{2}[-/]\d{2})/i
        );
        if (matchVacRange) {
          const dias = diasInclusivos(matchVacRange[1], matchVacRange[2]);
          if (dias) return `Vacaciones ${dias} dia${dias === 1 ? '' : 's'}`;
          return `Vacaciones del ${fmtIso(matchVacRange[1])} al ${fmtIso(matchVacRange[2])}`;
        }
        if (/^(?:1\/2\s*dia\s*)?a cuenta de vacaciones$/i.test(raw)) return '1/2 dia a cuenta de vacaciones';
        if (/^vacaciones$/i.test(raw)) return 'Vacaciones';
        if (/^compensaci[oó]n$/i.test(raw)) return 'Compensacion';
        return raw;
      };

      const pickFirstNonEmpty = (...values) => {
        for (const value of values) {
          const text = String(value || '').trim();
          if (text) return text;
        }
        return '';
      };

      const normalizeSignatureName = (value) => {
        const text = String(value || '').trim();
        if (!text) return '';
        if (text.includes('\\') || text.includes('@')) return '';
        if (!/\s/.test(text)) return '';
        return text;
      };

      const numero = reporte.NumeroPP || id;
      const data = {
        numero,
        doi: reporte.DOIPP || reporte.DOI || '',
        trabajador: reporte.TrabajadorPP || reporte.Trabajador || '',
        cargo: reporte.CargoPP || reporte.Cargo || reporte.Ocupacion || '',
        area: reporte.AreaPP || reporte.Area || '',
        motivo: normalizeMotivo(reporte.MotivoPP),
        considerar: normalizeConsiderar(reporte.ConsiderarPP, vacacionesDesdePP, vacacionesHastaPP),
        fechaEmision: formatDate(reporte.FechaEmisionPP || reporte.FechaRegistroPP || new Date()),
        fechaPermiso: formatDate(reporte.FechaPermisoPP, { useUTC: true }),
        salida: formatTime(reporte.HSalidaPP),
        retorno: formatTime(reporte.HRetornoPP),
        tiempo: formatTime(reporte.TiempoPP),
        jefeFirmaNombre: normalizeSignatureName(pickFirstNonEmpty(
          creadorPapeletaNombre,
          reporte.JefeInmediato,
          reporte.NombreJefeInmediato,
          reporte.JefeInmediatoPP,
          reporte.NombreJefe,
          reporte.AprobadoPorJefe,
          reporte.UsuarioJefe
        ))
      };

      const copyLabels = ['Copia para Colaborador', 'Copia para Vigilancia'];

      return { status: 200, pdf: { data, copyLabels, paper } };
    } catch (err) {
      console.error('Error generando PDF inline:', err.message);
      return { status: 500, body: { success: false, message: err.message } };
    }
  }

  // ---------- exportar Excel ----------

  async function exportarExcel({ user = {}, query = {} } = {}) {
    try {
      const mes = Number(query?.mes);
      const anio = Number(query?.anio);
      const area = String(query?.area || '').trim();
      const texto = String(query?.texto || '').trim();
      const estado = String(query?.estado || 'todas').trim().toLowerCase();
      const mostrarAnulados = String(query?.mostrarAnulados || '').trim().toLowerCase() === 'true';

      const ctx = negocio.extraerContextoUsuario(user);
      const isErpUser = negocio.esUsuarioErp(ctx);
      const erpAccess = isErpUser
        ? await erpRepository.getErpAreaAccess(ctx.userLogin)
        : { swNivel: 1, areas: [] };
      const effectiveSwNivel = ctx.tokenSwNivel || erpAccess.swNivel || 0;
      const privileged = isPrivilegedRole(ctx.userRole) || effectiveSwNivel >= 3;

      if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
        return { status: 400, body: { success: false, message: 'Mes invÃ¡lido. Use valores del 1 al 12.' } };
      }
      if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
        return { status: 400, body: { success: false, message: 'AÃ±o invÃ¡lido.' } };
      }

      const hasCreatorCol = await esquemaRepository.hasIdUsuarioCreadorColumn();
      let roleSql = '';
      let estadoSql = '';
      let activoSql = '';
      const request = getPool().request()
        .input('Mes', sql.Int, mes)
        .input('Anio', sql.Int, anio)
        .input('Area', sql.NVarChar(60), area)
        .input('TextoLike', sql.NVarChar(260), texto ? `%${texto}%` : '');

      if (mostrarAnulados) {
        activoSql = ` AND ISNULL(P.ActivoPP, '1') = '2'`;
      } else {
        activoSql = ` AND ISNULL(P.ActivoPP, '1') = '1'`;
      }

      if (estado === 'pendientes') {
        estadoSql = ` AND ISNULL(P.EstadoAprobacion, 'PENDIENTE') = 'PENDIENTE'`;
      } else if (estado === 'aprobadas') {
        estadoSql = ` AND ISNULL(P.EstadoAprobacion, 'PENDIENTE') IN ('APROBADO_JEFE', 'APROBADO_RRHH')`;
      } else if (estado === 'rechazadas') {
        estadoSql = ` AND ISNULL(P.EstadoAprobacion, 'PENDIENTE') = 'RECHAZADO'`;
      }

      if (!privileged) {
        if (isErpUser && effectiveSwNivel === 2) {
          if (erpAccess.areas.length > 0) {
            const areaClauses = [];
            erpAccess.areas.forEach((areaName, idx) => {
              const param = `AreaAcceso${idx}`;
              areaClauses.push(`LTRIM(RTRIM(ISNULL(P.AreaPP, ''))) = @${param}`);
              request.input(param, sql.NVarChar(150), areaName);
            });
            roleSql = ` AND (${areaClauses.join(' OR ')})`;
          } else {
            roleSql = ' AND 1 = 0';
          }
        } else if (hasCreatorCol && ctx.userId) {
          roleSql = ' AND P.IdUsuarioCreador = @IdUsuarioCreador';
          request.input('IdUsuarioCreador', sql.Int, ctx.userId);
        } else {
          roleSql = `
            AND (
              (@DOI <> '' AND P.DOIPP = @DOI)
              OR
              (@TrabajadorDoiLike <> '' AND P.TrabajadorPP LIKE @TrabajadorDoiLike)
              OR
              (
                @UsuarioLogin <> ''
                AND EXISTS (
                  SELECT 1
                  FROM TBL_AUDITORIA A0
                  WHERE A0.Tabla = 'TBL_GGHH_PapeletaPermiso'
                    AND A0.IdRegistro = P.IdPP
                    AND A0.Accion = 'CREAR'
                    AND (A0.Usuario = @UsuarioLogin OR A0.NombreUsuario = @UsuarioLogin)
                )
              )
            )
          `;
          request.input('DOI', sql.NVarChar(20), ctx.userDoi);
          request.input('TrabajadorDoiLike', sql.NVarChar(220), ctx.userNombre ? `%${ctx.userNombre}%` : '');
          request.input('UsuarioLogin', sql.NVarChar(80), ctx.userLogin);
        }
      }

      const result = await request
        .query(`
          DECLARE @Desde DATE = DATEFROMPARTS(@Anio, @Mes, 1);
          DECLARE @Hasta DATE = DATEADD(MONTH, 1, @Desde);

          SELECT
            P.IdPP,
            P.FechaRegistroPP,
            UsuarioRegistro = COALESCE(NULLIF(AC.NombreUsuario, ''), NULLIF(AC.Usuario, ''), 'SIN USUARIO'),
            P.FechaModificacionPP,
            UsuarioModificacion = COALESCE(
              NULLIF(AU.NombreUsuario, ''),
              NULLIF(AU.Usuario, ''),
              COALESCE(NULLIF(AC.NombreUsuario, ''), NULLIF(AC.Usuario, ''), 'SIN USUARIO')
            ),
            P.FechaEmisionPP,
            P.FechaPermisoPP,
            P.NumeroPP,
            P.DOIPP,
            P.TrabajadorPP,
            P.CargoPP,
            P.AreaPP,
            P.MotivoPP,
            P.ConsiderarPP,
            P.HSalidaPP,
            P.HRetornoPP,
            P.TiempoPP,
            P.ObservacionesPP,
            P.ActivoPP,
            ISNULL(P.EstadoAprobacion, 'PENDIENTE') AS EstadoAprobacion
          FROM TBL_GGHH_PapeletaPermiso P
          OUTER APPLY (
            SELECT TOP 1
              A.Usuario,
              A.NombreUsuario
            FROM TBL_AUDITORIA A
            WHERE A.Tabla = 'TBL_GGHH_PapeletaPermiso'
              AND A.IdRegistro = P.IdPP
              AND A.Accion = 'CREAR'
            ORDER BY A.IdAuditoria DESC
          ) AC
          OUTER APPLY (
            SELECT TOP 1
              A.Usuario,
              A.NombreUsuario
            FROM TBL_AUDITORIA A
            WHERE A.Tabla = 'TBL_GGHH_PapeletaPermiso'
              AND A.IdRegistro = P.IdPP
              AND A.Accion = 'EDITAR'
            ORDER BY A.IdAuditoria DESC
          ) AU
          WHERE P.FechaPermisoPP >= @Desde
            AND P.FechaPermisoPP < @Hasta
            ${activoSql}
            ${estadoSql}
            AND (@Area = '' OR P.AreaPP = @Area)
            AND (
              @TextoLike = ''
              OR P.TrabajadorPP LIKE @TextoLike
              OR P.DOIPP LIKE @TextoLike
              OR P.CargoPP LIKE @TextoLike
              OR P.AreaPP LIKE @TextoLike
              OR P.MotivoPP LIKE @TextoLike
              OR P.ConsiderarPP LIKE @TextoLike
            )
            ${roleSql}
          ORDER BY P.FechaPermisoPP DESC, P.NumeroPP DESC
        `);

      const rowsFiltradas = (result.recordset || []).filter((row) => {
        const parts = getDateParts(row.FechaPermisoPP);
        const isActive = String(row?.ActivoPP ?? '1') === '1';
        const isAnulado = String(row?.ActivoPP ?? '1') === '2';
        const matchesActivo = mostrarAnulados ? isAnulado : isActive;

        const rowEstado = String(row?.EstadoAprobacion || 'PENDIENTE').toUpperCase();
        let matchesEstado = true;
        if (estado === 'pendientes') matchesEstado = rowEstado === 'PENDIENTE';
        else if (estado === 'aprobadas') matchesEstado = rowEstado === 'APROBADO_JEFE' || rowEstado === 'APROBADO_RRHH';
        else if (estado === 'rechazadas') matchesEstado = rowEstado === 'RECHAZADO';

        const rowArea = String(row?.AreaPP || '').trim();
        const matchesArea = !area || rowArea === area;

        const blob = [
          row?.TrabajadorPP, row?.DOIPP, row?.CargoPP, row?.AreaPP,
          row?.MotivoPP, row?.ConsiderarPP
        ].map((x) => String(x || '').toLowerCase()).join(' | ');
        const matchesTexto = !texto || blob.includes(texto.toLowerCase());

        return !!parts
          && parts.year === anio
          && parts.month === mes
          && matchesActivo
          && matchesEstado
          && matchesArea
          && matchesTexto;
      });

      // El armado del workbook (plantilla, encabezados, estilos, horas,
      // filtros) se delega al documento en src/documents/papeleta-excel.document.js.
      return { status: 200, body: { rows: rowsFiltradas, mes, anio } };
    } catch (error) {
      console.error('Error exportando Excel de papeletas:', error);
      return { status: 500, body: { success: false, message: error.message } };
    }
  }

  return {
    listarPapeletas,
    obtenerPorEstado,
    mostrarPapeletas,
    obtenerUltimoNumero,
    obtenerReporte,
    obtenerHistorial,
    registrarCreacion,
    editarPapeleta,
    anularPapeleta,
    restaurarPapeleta,
    gestionarEstado,
    obtenerPorIdParaPDF,
    exportarExcel
  };
}

module.exports = { createPapeletaFlujoService };
