function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) {
    return xf.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
}

function createActivityService(sql) {
  async function registrarAuditoria(requestFactory, data) {
    try {
      await requestFactory()
        .input('Tabla', sql.VarChar(100), data.tabla)
        .input('IdRegistro', sql.Int, Number(data.idRegistro || 0))
        .input('Accion', sql.VarChar(50), data.accion)
        .input('Usuario', sql.VarChar(50), data.usuario || null)
        .input('NombreUsuario', sql.VarChar(100), data.nombreUsuario || null)
        .input('IP', sql.VarChar(50), data.ip || null)
        .input('Navegador', sql.VarChar(255), data.navegador || null)
        .input('DatosAnteriores', sql.NVarChar(sql.MAX), data.datosAnteriores || null)
        .input('DatosNuevos', sql.NVarChar(sql.MAX), data.datosNuevos || null)
        .input('Observaciones', sql.VarChar(500), data.observaciones || null)
        .query(`
          INSERT INTO TBL_AUDITORIA
          (Tabla, IdRegistro, Accion, Usuario, NombreUsuario, FechaHora, IP, Navegador, DatosAnteriores, DatosNuevos, Observaciones)
          VALUES
          (@Tabla, @IdRegistro, @Accion, @Usuario, @NombreUsuario, GETDATE(), @IP, @Navegador, @DatosAnteriores, @DatosNuevos, @Observaciones)
        `);
    } catch (error) {
      console.error('⚠️ Error registrando auditoría:', error.message);
    }
  }

  async function crearNotificacionUsuario(requestFactory, data) {
    try {
      if (!data?.usuarioDestino) return;
      await requestFactory()
        .input('UsuarioDestino', sql.VarChar(50), data.usuarioDestino)
        .input('Titulo', sql.VarChar(200), data.titulo)
        .input('Mensaje', sql.NVarChar(sql.MAX), data.mensaje)
        .input('Tipo', sql.VarChar(20), data.tipo || 'INFO')
        .input('IdPapeleta', sql.Int, data.idPapeleta ? Number(data.idPapeleta) : null)
        .input('URL', sql.VarChar(500), data.url || null)
        .query(`
          INSERT INTO TBL_NOTIFICACIONES
          (UsuarioDestino, Titulo, Mensaje, Tipo, IdPapeleta, Leido, FechaCreacion, URL)
          VALUES
          (@UsuarioDestino, @Titulo, @Mensaje, @Tipo, @IdPapeleta, '0', GETDATE(), @URL)
        `);
    } catch (error) {
      console.error('⚠️ Error creando notificación a usuario:', error.message);
    }
  }

  async function crearNotificacionRRHH(requestFactory, data) {
    try {
      await requestFactory()
        .input('Titulo', sql.VarChar(200), data.titulo)
        .input('Mensaje', sql.NVarChar(sql.MAX), data.mensaje)
        .input('Tipo', sql.VarChar(20), data.tipo || 'INFO')
        .input('IdPapeleta', sql.Int, data.idPapeleta ? Number(data.idPapeleta) : null)
        .input('URL', sql.VarChar(500), data.url || null)
        .query(`
          INSERT INTO TBL_NOTIFICACIONES
          (UsuarioDestino, Titulo, Mensaje, Tipo, IdPapeleta, Leido, FechaCreacion, URL)
          SELECT U.Usuario, @Titulo, @Mensaje, @Tipo, @IdPapeleta, '0', GETDATE(), @URL
          FROM TBL_USUARIOS U
          WHERE U.Activo = '1' AND U.Rol = 'RRHH'
        `);
    } catch (error) {
      console.error('⚠️ Error creando notificación RRHH:', error.message);
    }
  }

  return {
    registrarAuditoria,
    crearNotificacionUsuario,
    crearNotificacionRRHH
  };
}

module.exports = { createActivityService, getClientIp };
