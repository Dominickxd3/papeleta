const { normalizeRole } = require('../middlewares/auth');
const { createActivityService, getClientIp } = require('../services/activity.service');

// Horario del personal: horario programado (SIGA), marcas del reloj y papeletas del dia.
// ADMIN / RRHH (o sw_nivel >= 3) ven a todos.
// Jefes (sw_nivel = 2) ven solo a los trabajadores de sus areas asignadas en
// TBL_USUARIO_ERP_AREA_APP (la misma regla que usa la bandeja de papeletas).
// El resto de usuarios no tiene acceso.

const PRIVILEGED_ROLES = new Set([
  'ADMIN',
  'ADMINISTRADOR',
  'ADMINISTRADOR DEL SISTEMA',
  'RRHH',
  'RR HH',
  'RECURSOS HUMANOS'
]);

const MAX_DIAS_RANGO = 62;

function parseFecha(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) return null;
  return d;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function registerHorariosRoutes(app, deps) {
  const { sql } = deps;
  const getPool = deps.getPool || (() => deps.pool);
  const { registrarAuditoria } = createActivityService(sql);

  async function resolverAcceso(user) {
    const role = normalizeRole(user?.rol || user?.Rol || user?.role || '');
    const login = String(user?.usuario || user?.Usuario || '').trim();
    const tokenNivel = Number(user?.sw_nivel || 0) || 0;

    if (PRIVILEGED_ROLES.has(role) || tokenNivel >= 3) {
      return { todos: true, areas: [] };
    }
    if (!login) return { todos: false, areas: [], denegado: true };

    // Se lee el nivel y las areas en cada consulta: si RRHH cambia la
    // asignacion en Administrar, aplica sin volver a iniciar sesion.
    const userResult = await getPool().request()
      .input('UserLogon', sql.VarChar(80), login)
      .query(`
        SELECT TOP 1 sw_nivel, Activo
        FROM dbo.TBL_USUARIOS_ERP_APP
        WHERE UserLogon = @UserLogon
      `);
    const row = userResult.recordset?.[0];
    const activo = String(row?.Activo ?? '').trim();
    const nivel = Number(row?.sw_nivel || 0) || 0;
    if (!row || activo === '0' || activo === '2') return { todos: false, areas: [], denegado: true };
    if (nivel >= 3) return { todos: true, areas: [], nivelGestor: true, nivel, login };
    if (nivel !== 2) return { todos: false, areas: [], denegado: true };

    const areasResult = await getPool().request()
      .input('UserLogon', sql.VarChar(80), login)
      .query(`
        SELECT LTRIM(RTRIM(A.NombreAreaERP)) AS NombreAreaERP
        FROM dbo.TBL_USUARIO_ERP_AREA_APP UEA
        INNER JOIN dbo.TBL_AREAS_ERP_APP A ON A.IdAreaERP = UEA.IdAreaERP
        WHERE UEA.UserLogon = @UserLogon
          AND ISNULL(UEA.Activo, '1') = '1'
          AND ISNULL(A.Activo, '1') = '1'
      `);
    const areas = (areasResult.recordset || [])
      .map((r) => String(r.NombreAreaERP || '').trim())
      .filter(Boolean);
    return { todos: false, areas, login };
  }

  app.get('/api/horarios', async (req, res) => {
    try {
      const acceso = await resolverAcceso(req.user);
      if (acceso.denegado) {
        return res.status(403).json({ success: false, message: 'Acceso denegado' });
      }

      const hoy = new Date();
      const inicioMes = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), 1));
      const finHoy = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
      const desde = parseFecha(req.query?.desde) || inicioMes;
      const hasta = parseFecha(req.query?.hasta) || finHoy;

      if (hasta < desde) {
        return res.status(400).json({ success: false, message: 'La fecha "hasta" es menor que "desde"' });
      }
      const dias = Math.round((hasta - desde) / 86400000) + 1;
      if (dias > MAX_DIAS_RANGO) {
        return res.status(400).json({ success: false, message: `El rango máximo es de ${MAX_DIAS_RANGO} días` });
      }

      if (!acceso.todos && acceso.areas.length === 0) {
        return res.json({ success: true, desde: isoDate(desde), hasta: isoDate(hasta), areas: [], data: [] });
      }

      // Todo el personal activo de SIGA (todas las areas) para el rango pedido.
      const result = await getPool().request()
        .input('Desde', sql.Date, isoDate(desde))
        .input('Hasta', sql.Date, isoDate(hasta))
        .execute('dbo.sp_Web_HorarioPersonal');

      let data = result.recordset || [];
      if (!acceso.todos) {
        // Jefes: solo los trabajadores de sus areas asignadas.
        const permitidas = new Set(acceso.areas.map((a) => a.toUpperCase()));
        data = data.filter((r) => permitidas.has(String(r.AreaERP || '').trim().toUpperCase()));
      }

      await aplicarAjustes(data, isoDate(desde), isoDate(hasta));

      const gestor = acceso.todos === true && esGestor(req.user, acceso);
      const puedeAjustar = gestor || (!acceso.todos && acceso.areas.length > 0 && await tienePermisoAjuste(acceso.login));

      return res.json({
        success: true,
        desde: isoDate(desde),
        hasta: isoDate(hasta),
        areas: acceso.todos ? null : acceso.areas,
        esGestor: gestor,
        esAdmin: gestor && esAdmin(req.user, acceso),
        puedeAjustar,
        data
      });
    } catch (error) {
      console.error('Error consultando horarios:', error);
      return res.status(500).json({ success: false, message: 'No se pudo consultar el horario del personal' });
    }
  });

  // ==========================================================
  // AJUSTES MANUALES
  // - ADMIN / RRHH: ajustan a cualquier trabajador.
  // - Jefes con permiso (TBL_GGHH_HorarioPermisoAjuste): solo a los
  //   trabajadores de sus areas asignadas.
  // ==========================================================
  function esGestor(user, acceso) {
    const role = normalizeRole(user?.rol || user?.Rol || user?.role || '');
    return PRIVILEGED_ROLES.has(role) || (Number(user?.sw_nivel || 0) >= 3) || acceso?.nivelGestor === true;
  }

  async function tienePermisoAjuste(login) {
    if (!login) return false;
    const r = await getPool().request()
      .input('UserLogon', sql.VarChar(80), login)
      .query(`SELECT TOP 1 1 AS ok FROM dbo.TBL_GGHH_HorarioPermisoAjuste WHERE UserLogon = @UserLogon AND Activo = 1`);
    return !!r.recordset?.length;
  }

  // Valida que quien llama pueda ajustar a ESTE trabajador.
  async function exigirAjuste(req, res, dni) {
    const acceso = await resolverAcceso(req.user);
    if (acceso.denegado) {
      res.status(403).json({ success: false, message: 'Acceso denegado' });
      return false;
    }
    if (acceso.todos && esGestor(req.user, acceso)) return true;
    if (acceso.todos || !(await tienePermisoAjuste(acceso.login))) {
      res.status(403).json({ success: false, message: 'No tienes permiso para ajustar horarios' });
      return false;
    }
    const area = await getPool().request()
      .input('DOI', sql.VarChar(20), String(dni || ''))
      .query(`SELECT TOP 1 LTRIM(RTRIM(Area)) AS Area FROM dbo.TBL_GGHH_TrabajadorCache WHERE LTRIM(RTRIM(DOI)) = @DOI AND Activo = '1'`);
    const areaTrab = String(area.recordset?.[0]?.Area || '').toUpperCase();
    if (!areaTrab || !acceso.areas.some((a) => a.toUpperCase() === areaTrab)) {
      res.status(403).json({ success: false, message: 'Solo puedes ajustar a trabajadores de tus áreas' });
      return false;
    }
    return true;
  }

  const aMin = (hhmm) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || '').trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };

  // Aplica los ajustes activos a las filas: cambia el horario del dia y
  // anula tardanza / salida antes; la falta y el tiempo extra los resuelve
  // la pantalla con los indicadores del ajuste.
  async function aplicarAjustes(data, desde, hasta) {
    if (!data.length) return;
    const result = await getPool().request()
      .input('Desde', sql.Date, desde)
      .input('Hasta', sql.Date, hasta)
      .query(`
        SELECT IdAjuste, LTRIM(RTRIM(DNI)) AS DNI, CONVERT(char(10), Fecha, 23) AS Fecha,
               NoContarFalta, NoContarTardanza, NoContarSalida, NoContarExtra,
               HoraEntrada, HoraSalida, Motivo, UsuarioRegistro, FechaRegistro, UsuarioModifica, FechaModifica
        FROM dbo.TBL_GGHH_HorarioAjuste
        WHERE Activo = 1 AND Fecha >= @Desde AND Fecha <= @Hasta
      `);
    const ajustes = new Map((result.recordset || []).map((a) => [`${a.DNI}|${a.Fecha}`, a]));
    if (!ajustes.size) return;

    data.forEach((r) => {
      const a = ajustes.get(`${String(r.DNI || '').trim()}|${r.Fecha}`);
      if (!a) return;
      r.Ajuste = {
        IdAjuste: a.IdAjuste,
        NoContarFalta: !!a.NoContarFalta,
        NoContarTardanza: !!a.NoContarTardanza,
        NoContarSalida: !!a.NoContarSalida,
        NoContarExtra: !!a.NoContarExtra,
        HoraEntrada: a.HoraEntrada ? a.HoraEntrada.trim() : null,
        HoraSalida: a.HoraSalida ? a.HoraSalida.trim() : null,
        Motivo: a.Motivo,
        Usuario: a.UsuarioModifica || a.UsuarioRegistro,
        Fecha: a.FechaModifica || a.FechaRegistro,
        HorarioOriginal: `${(r.HoraEntradaProgramada || '').trim()}-${(r.HoraSalidaProgramada || '').trim()}`
      };

      // Horario corregido: recalcular tardanza y salida antes
      if (a.HoraEntrada) r.HoraEntradaProgramada = a.HoraEntrada.trim();
      if (a.HoraSalida) r.HoraSalidaProgramada = a.HoraSalida.trim();
      if (a.HoraEntrada || a.HoraSalida) {
        const E = aMin(r.HoraEntradaProgramada);
        const S = aMin(r.HoraSalidaProgramada);
        const P = aMin(r.PrimeraMarca);
        const U = Number(r.CantidadMarcas) > 1 ? aMin(r.UltimaMarca) : null;
        r.MinutosTarde = E !== null && P !== null ? Math.max(0, P - E) : 0;
        r.MinutosSalidaAntes = S !== null && U !== null && (E === null || S > E) ? Math.max(0, S - U) : 0;
      }
      if (a.NoContarTardanza) r.MinutosTarde = 0;
      if (a.NoContarSalida) r.MinutosSalidaAntes = 0;
    });
  }

  // Solo el ADMINISTRADOR da o quita el permiso de ajuste.
  const ADMIN_ROLES = new Set(['ADMIN', 'ADMINISTRADOR', 'ADMINISTRADOR DEL SISTEMA']);
  function esAdmin(user, acceso) {
    const role = normalizeRole(user?.rol || user?.Rol || user?.role || '');
    return ADMIN_ROLES.has(role) || Number(user?.sw_nivel || 0) >= 4 || Number(acceso?.nivel || 0) >= 4;
  }

  async function exigirAdmin(req, res) {
    const acceso = await resolverAcceso(req.user);
    if (acceso.denegado || !acceso.todos || !esAdmin(req.user, acceso)) {
      res.status(403).json({ success: false, message: 'Solo el administrador puede gestionar estos permisos' });
      return false;
    }
    return true;
  }

  async function exigirGestor(req, res) {
    const acceso = await resolverAcceso(req.user);
    if (acceso.denegado || !acceso.todos || !esGestor(req.user, acceso)) {
      res.status(403).json({ success: false, message: 'Solo ADMIN o RRHH pueden hacer esto' });
      return false;
    }
    return true;
  }

  function usuarioActual(req) {
    return String(req.user?.usuario || req.user?.Usuario || 'sistema').trim().slice(0, 80);
  }

  async function auditar(req, accion, idRegistro, anterior, nuevo, observacion, tabla = 'TBL_GGHH_HorarioAjuste') {
    try {
      await registrarAuditoria(() => getPool().request(), {
        tabla,
        idRegistro,
        accion,
        usuario: usuarioActual(req),
        nombreUsuario: String(req.user?.nombre || '').slice(0, 100) || null,
        ip: getClientIp(req),
        navegador: String(req.headers['user-agent'] || '').slice(0, 255),
        datosAnteriores: anterior ? JSON.stringify(anterior) : null,
        datosNuevos: nuevo ? JSON.stringify(nuevo) : null,
        observaciones: observacion ? String(observacion).slice(0, 500) : null
      });
    } catch (e) {
      console.warn('No se pudo registrar auditoria de ajuste:', e?.message || e);
    }
  }

  // Crear o actualizar el ajuste de un trabajador en un dia
  app.post('/api/horarios/ajustes', async (req, res) => {
    try {
      const b = req.body || {};
      const dni = String(b.dni || '').trim();
      if (!(await exigirAjuste(req, res, dni))) return;
      const fecha = parseFecha(b.fecha);
      const motivo = String(b.motivo || '').trim();
      const horaOk = (h) => h === '' || h === null || h === undefined || /^([01]\d|2[0-3]):[0-5]\d$/.test(String(h));
      const horaEntrada = b.horaEntrada ? String(b.horaEntrada).trim() : null;
      const horaSalida = b.horaSalida ? String(b.horaSalida).trim() : null;
      const flags = {
        falta: !!b.noContarFalta,
        tardanza: !!b.noContarTardanza,
        salida: !!b.noContarSalida,
        extra: !!b.noContarExtra
      };

      if (!/^\d{6,15}$/.test(dni)) return res.status(400).json({ success: false, message: 'DNI inválido' });
      if (!fecha) return res.status(400).json({ success: false, message: 'Fecha inválida' });
      if (motivo.length < 5) return res.status(400).json({ success: false, message: 'Escribe el motivo del ajuste (mínimo 5 caracteres)' });
      if (motivo.length > 300) return res.status(400).json({ success: false, message: 'El motivo no puede pasar de 300 caracteres' });
      if (!horaOk(horaEntrada) || !horaOk(horaSalida)) return res.status(400).json({ success: false, message: 'Hora inválida (usa HH:MM)' });
      if (horaEntrada && horaSalida && aMin(horaSalida) <= aMin(horaEntrada)) {
        return res.status(400).json({ success: false, message: 'La hora de salida debe ser mayor que la de entrada' });
      }
      if (!flags.falta && !flags.tardanza && !flags.salida && !flags.extra && !horaEntrada && !horaSalida) {
        return res.status(400).json({ success: false, message: 'Elige al menos un ajuste' });
      }

      const existe = await getPool().request()
        .input('DOI', sql.VarChar(20), dni)
        .query(`SELECT TOP 1 1 AS ok FROM dbo.TBL_GGHH_TrabajadorCache WHERE LTRIM(RTRIM(DOI)) = @DOI`);
      if (!existe.recordset?.length) return res.status(404).json({ success: false, message: 'Trabajador no encontrado' });

      const usuario = usuarioActual(req);
      const reqDb = () => getPool().request()
        .input('DNI', sql.VarChar(20), dni)
        .input('Fecha', sql.Date, isoDate(fecha))
        .input('Falta', sql.Bit, flags.falta)
        .input('Tardanza', sql.Bit, flags.tardanza)
        .input('Salida', sql.Bit, flags.salida)
        .input('Extra', sql.Bit, flags.extra)
        .input('HoraEntrada', sql.Char(5), horaEntrada)
        .input('HoraSalida', sql.Char(5), horaSalida)
        .input('Motivo', sql.NVarChar(300), motivo)
        .input('Usuario', sql.VarChar(80), usuario);

      const previo = await getPool().request()
        .input('DNI', sql.VarChar(20), dni)
        .input('Fecha', sql.Date, isoDate(fecha))
        .query(`SELECT TOP 1 * FROM dbo.TBL_GGHH_HorarioAjuste WHERE DNI = @DNI AND Fecha = @Fecha AND Activo = 1`);
      const anterior = previo.recordset?.[0] || null;

      let id;
      if (anterior) {
        await reqDb().input('Id', sql.Int, anterior.IdAjuste).query(`
          UPDATE dbo.TBL_GGHH_HorarioAjuste
             SET NoContarFalta = @Falta, NoContarTardanza = @Tardanza, NoContarSalida = @Salida, NoContarExtra = @Extra,
                 HoraEntrada = @HoraEntrada, HoraSalida = @HoraSalida, Motivo = @Motivo,
                 UsuarioModifica = @Usuario, FechaModifica = GETDATE()
           WHERE IdAjuste = @Id`);
        id = anterior.IdAjuste;
      } else {
        const ins = await reqDb().query(`
          INSERT INTO dbo.TBL_GGHH_HorarioAjuste
            (DNI, Fecha, NoContarFalta, NoContarTardanza, NoContarSalida, NoContarExtra, HoraEntrada, HoraSalida, Motivo, UsuarioRegistro)
          OUTPUT INSERTED.IdAjuste
          VALUES (@DNI, @Fecha, @Falta, @Tardanza, @Salida, @Extra, @HoraEntrada, @HoraSalida, @Motivo, @Usuario)`);
        id = ins.recordset?.[0]?.IdAjuste;
      }

      const nuevo = { dni, fecha: isoDate(fecha), ...flags, horaEntrada, horaSalida, motivo };
      await auditar(req, anterior ? 'EDITAR' : 'CREAR', id, anterior, nuevo, motivo);
      return res.json({ success: true, idAjuste: id, message: anterior ? 'Ajuste actualizado' : 'Ajuste registrado' });
    } catch (error) {
      console.error('Error guardando ajuste de horario:', error);
      return res.status(500).json({ success: false, message: 'No se pudo guardar el ajuste' });
    }
  });

  // Anular un ajuste (no se borra: queda con Activo = 0)
  app.delete('/api/horarios/ajustes/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'Id inválido' });

      const previo = await getPool().request().input('Id', sql.Int, id)
        .query(`SELECT TOP 1 * FROM dbo.TBL_GGHH_HorarioAjuste WHERE IdAjuste = @Id AND Activo = 1`);
      const anterior = previo.recordset?.[0];
      if (!anterior) return res.status(404).json({ success: false, message: 'Ajuste no encontrado' });
      if (!(await exigirAjuste(req, res, String(anterior.DNI || '').trim()))) return;

      await getPool().request()
        .input('Id', sql.Int, id)
        .input('Usuario', sql.VarChar(80), usuarioActual(req))
        .query(`UPDATE dbo.TBL_GGHH_HorarioAjuste SET Activo = 0, UsuarioModifica = @Usuario, FechaModifica = GETDATE() WHERE IdAjuste = @Id`);

      await auditar(req, 'ANULAR', id, anterior, { activo: false }, 'Ajuste de horario anulado');
      return res.json({ success: true, message: 'Ajuste quitado' });
    } catch (error) {
      console.error('Error anulando ajuste de horario:', error);
      return res.status(500).json({ success: false, message: 'No se pudo quitar el ajuste' });
    }
  });

  // ==========================================================
  // PERMISO PARA AJUSTAR (solo ADMIN / RRHH lo dan o lo quitan)
  // ==========================================================
  app.get('/api/horarios/permisos-ajuste', async (req, res) => {
    try {
      if (!(await exigirAdmin(req, res))) return;
      const result = await getPool().request().query(`
        SELECT U.UserLogon,
               LTRIM(RTRIM(U.NombreCompleto)) AS Nombre,
               U.sw_nivel AS Nivel,
               CAST(CASE WHEN P.Activo = 1 THEN 1 ELSE 0 END AS bit) AS TienePermiso,
               P.AsignadoPor, P.FechaAsignacion, P.UsuarioModifica, P.FechaModifica,
               STUFF((SELECT ', ' + LTRIM(RTRIM(A.NombreAreaERP))
                      FROM dbo.TBL_USUARIO_ERP_AREA_APP UEA
                      JOIN dbo.TBL_AREAS_ERP_APP A ON A.IdAreaERP = UEA.IdAreaERP
                      WHERE UEA.UserLogon = U.UserLogon AND ISNULL(UEA.Activo, '1') = '1' AND ISNULL(A.Activo, '1') = '1'
                      ORDER BY A.NombreAreaERP
                      FOR XML PATH(''), TYPE).value('.', 'nvarchar(1000)'), 1, 2, '') AS Areas
        FROM dbo.TBL_USUARIOS_ERP_APP U
        LEFT JOIN dbo.TBL_GGHH_HorarioPermisoAjuste P ON P.UserLogon = U.UserLogon
        WHERE ISNULL(U.Activo, '1') = '1' AND ISNULL(U.sw_nivel, 1) = 2
        ORDER BY CASE WHEN P.Activo = 1 THEN 0 ELSE 1 END, U.NombreCompleto
      `);
      return res.json({ success: true, data: result.recordset || [] });
    } catch (error) {
      console.error('Error listando permisos de ajuste:', error);
      return res.status(500).json({ success: false, message: 'No se pudo cargar la lista de permisos' });
    }
  });

  app.put('/api/horarios/permisos-ajuste', async (req, res) => {
    try {
      if (!(await exigirAdmin(req, res))) return;
      const login = String(req.body?.userLogon || '').trim();
      const activo = req.body?.activo === true;
      if (!login) return res.status(400).json({ success: false, message: 'Usuario inválido' });

      const user = await getPool().request().input('UserLogon', sql.VarChar(80), login)
        .query(`SELECT TOP 1 UserLogon FROM dbo.TBL_USUARIOS_ERP_APP WHERE UserLogon = @UserLogon AND ISNULL(Activo, '1') = '1'`);
      if (!user.recordset?.length) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });

      const previo = await getPool().request().input('UserLogon', sql.VarChar(80), login)
        .query(`SELECT TOP 1 * FROM dbo.TBL_GGHH_HorarioPermisoAjuste WHERE UserLogon = @UserLogon`);
      const anterior = previo.recordset?.[0] || null;
      const quien = usuarioActual(req);

      if (anterior) {
        await getPool().request()
          .input('UserLogon', sql.VarChar(80), login)
          .input('Activo', sql.Bit, activo)
          .input('Usuario', sql.VarChar(80), quien)
          .query(`UPDATE dbo.TBL_GGHH_HorarioPermisoAjuste SET Activo = @Activo, UsuarioModifica = @Usuario, FechaModifica = GETDATE() WHERE UserLogon = @UserLogon`);
      } else if (activo) {
        await getPool().request()
          .input('UserLogon', sql.VarChar(80), login)
          .input('Usuario', sql.VarChar(80), quien)
          .query(`INSERT INTO dbo.TBL_GGHH_HorarioPermisoAjuste (UserLogon, Activo, AsignadoPor) VALUES (@UserLogon, 1, @Usuario)`);
      }

      await auditar(req, activo ? 'DAR_PERMISO' : 'QUITAR_PERMISO', 0, anterior, { userLogon: login, activo },
        `${activo ? 'Permiso para ajustar horarios dado a' : 'Permiso para ajustar horarios quitado a'} ${login}`,
        'TBL_GGHH_HorarioPermisoAjuste');
      return res.json({ success: true, message: activo ? 'Permiso otorgado' : 'Permiso quitado' });
    } catch (error) {
      console.error('Error guardando permiso de ajuste:', error);
      return res.status(500).json({ success: false, message: 'No se pudo guardar el permiso' });
    }
  });
}

module.exports = { registerHorariosRoutes };
