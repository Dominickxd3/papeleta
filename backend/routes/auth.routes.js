const { verifyPassword, isHashedPassword } = require('../services/password.service');
const { isUserActive, roleFromSwNivel } = require('../src/security/roles');

function registerAuthRoutes(app, deps) {
  const { pool, sql, createToken, requireAuth, getProfilePhotoUrl, registrarAuditoria, getClientIp } = deps;
  const getPool = deps.getPool || (() => deps.pool);
  let erpAuditReady = false;

  const ensureErpAuditTable = async () => {
    if (erpAuditReady) return;
    await getPool().request().query(`
      IF OBJECT_ID('dbo.TBL_USUARIOS_ERP_AUDITORIA', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.TBL_USUARIOS_ERP_AUDITORIA (
          IdAuditoria BIGINT IDENTITY(1,1) PRIMARY KEY,
          UserLogon VARCHAR(80) NOT NULL,
          TipoEvento VARCHAR(40) NOT NULL,
          Detalle NVARCHAR(500) NULL,
          RealizadoPor VARCHAR(80) NULL,
          FechaEvento DATETIME NOT NULL DEFAULT(GETDATE())
        );

        CREATE INDEX IX_TBL_USUARIOS_ERP_AUDITORIA_UserLogon_Fecha
          ON dbo.TBL_USUARIOS_ERP_AUDITORIA(UserLogon, FechaEvento DESC);
      END
    `);
    erpAuditReady = true;
  };

  const logErpAudit = async (userLogon, tipoEvento, detalle, realizadoPor) => {
    try {
      await ensureErpAuditTable();
      await getPool().request()
        .input('UserLogon', sql.VarChar(80), String(userLogon || '').trim())
        .input('TipoEvento', sql.VarChar(40), String(tipoEvento || '').trim())
        .input('Detalle', sql.NVarChar(500), String(detalle || '').trim() || null)
        .input('RealizadoPor', sql.VarChar(80), String(realizadoPor || '').trim() || null)
        .query(`
          INSERT INTO dbo.TBL_USUARIOS_ERP_AUDITORIA (UserLogon, TipoEvento, Detalle, RealizadoPor)
          VALUES (@UserLogon, @TipoEvento, @Detalle, @RealizadoPor)
        `);
    } catch {}
  };

  const isErpUserActive = (estadoRaw) => {
    return isUserActive(estadoRaw);
  };

  const matchesErpPassword = (inputPassword, erpRow) => {
    const raw = erpRow?.User_PassBin;
    const text = erpRow?.UserPassText;
    const input = String(inputPassword || '');
    const candidates = [];

    if (typeof text === 'string' && text.trim()) candidates.push(text.trim());

    if (Buffer.isBuffer(raw)) {
      candidates.push(raw.toString('utf8').trim());
      candidates.push(raw.toString('utf16le').trim());
      candidates.push(raw.toString('latin1').trim());
      candidates.push(raw.toString('hex'));
      candidates.push(raw.toString('base64'));
    } else if (typeof raw === 'string' && raw.trim()) {
      candidates.push(raw.trim());
    }

    for (const candidate of candidates) {
      if (!candidate) continue;
      if (candidate === input) return true;
      if (isHashedPassword(candidate) && verifyPassword(input, candidate)) return true;
    }

    return false;
  };

  const normalizeErpAppActivo = (value) => {
    const raw = String(value ?? '').trim();
    return raw === '0' || raw === '2' ? '2' : '1';
  };

  const resolveErpAccess = async (userLogon) => {
    try {
      const appResult = await getPool().request()
        .input('UserLogon', sql.VarChar(80), String(userLogon || '').trim())
        .query(`
          SELECT TOP 1
            sw_nivel,
            Activo,
            NombreCompleto,
            Email
          FROM dbo.TBL_USUARIOS_ERP_APP
          WHERE UserLogon = @UserLogon
        `);

      const appUser = appResult.recordset?.[0] || null;
      if (appUser) {
        return {
          swNivel: Number(appUser.sw_nivel || 1) || 1,
          activo: normalizeErpAppActivo(appUser.Activo),
          rol: roleFromSwNivel(appUser.sw_nivel),
          nombreCompleto: appUser.NombreCompleto || null,
          email: appUser.Email || null
        };
      }

      const legacyResult = await getPool().request()
        .input('UserLogon', sql.VarChar(80), String(userLogon || '').trim())
        .query(`
          SELECT TOP 1
            RolApp,
            sw_nivel,
            Activo
          FROM dbo.TBL_ROLES_USUARIO_ERP
          WHERE UserLogon = @UserLogon
        `);
      const legacy = legacyResult.recordset?.[0] || null;
      const legacyRole = String(legacy?.RolApp || '').trim().toUpperCase();
      const legacyNivel = Number(legacy?.sw_nivel || (
        legacyRole === 'ADMIN' ? 4 :
          legacyRole === 'RRHH' ? 3 : 1
      )) || 1;
      return {
        swNivel: legacyNivel,
        activo: normalizeErpAppActivo(legacy?.Activo),
        rol: roleFromSwNivel(legacyNivel),
        nombreCompleto: null,
        email: null
      };
    } catch {
      return {
        swNivel: 1,
        activo: '1',
        rol: 'USUARIO',
        nombreCompleto: null,
        email: null
      };
    }
  };

  const auditAuthAttempt = async (req, data) => {
    if (typeof registrarAuditoria !== 'function') return;
    const usuarioIntentado = String(data?.usuario || '').trim();
    try {
      await registrarAuditoria(() => getPool().request(), {
        tabla: 'AUTH',
        idRegistro: Number(data?.idRegistro || 0) || 0,
        accion: data?.accion || 'LOGIN_FAIL',
        usuario: usuarioIntentado || null,
        nombreUsuario: data?.nombreUsuario || usuarioIntentado || null,
        ip: typeof getClientIp === 'function' ? getClientIp(req) : null,
        navegador: req.headers['user-agent'] || null,
        datosNuevos: JSON.stringify({
          usuario: usuarioIntentado || null,
          origen: data?.origen || null,
          motivo: data?.motivo || null
        }),
        observaciones: data?.motivo || 'Intento de autenticacion'
      });
    } catch (error) {
      console.error('Error auditando autenticacion:', error.message);
    }
  };
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { usuario, contrasena } = req.body;

      if (!usuario || !contrasena) {
        await auditAuthAttempt(req, {
          accion: 'LOGIN_FAIL',
          usuario,
          origen: 'DESCONOCIDO',
          motivo: 'Usuario o contrasena no enviados'
        });
        return res.status(400).json({
          success: false,
          message: 'Usuario y contrase�a son requeridos'
        });
      }

      const userResult = await getPool().request()
        .input('Usuario', sql.VarChar(50), usuario)
        .query(`
          SELECT TOP 1
            IdUsuario,
            Usuario,
            NombreCompleto,
            Email,
            Rol,
            UltimoAcceso,
            Bloqueado,
            Contrasena
          FROM TBL_USUARIOS
          WHERE Usuario = @Usuario
            AND Activo = '1'
        `);
      const dbUser = userResult.recordset?.[0] || null;

      let data = null;
      let failedLoginOrigin = 'DESCONOCIDO';
      let failedLoginReason = 'Credenciales invalidas';
      let failedLoginName = null;
      if (dbUser && isHashedPassword(dbUser.Contrasena)) {
        if (String(dbUser.Bloqueado || '0') === '1') {
          await auditAuthAttempt(req, {
            accion: 'LOGIN_FAIL',
            usuario,
            idRegistro: dbUser.IdUsuario,
            nombreUsuario: dbUser.NombreCompleto,
            origen: 'LOCAL',
            motivo: 'Usuario local bloqueado'
          });
          return res.status(403).json({
            success: false,
            message: 'Usuario bloqueado'
          });
        }
        const valid = verifyPassword(contrasena, dbUser.Contrasena);
        if (!valid) {
          await auditAuthAttempt(req, {
            accion: 'LOGIN_FAIL',
            usuario,
            idRegistro: dbUser.IdUsuario,
            nombreUsuario: dbUser.NombreCompleto,
            origen: 'LOCAL',
            motivo: 'Contrasena local invalida'
          });
          return res.status(401).json({
            success: false,
            message: 'Credenciales inv�lidas'
          });
        }

        data = {
          Success: 1,
          Message: 'Inicio de sesi�n correcto',
          IdUsuario: dbUser.IdUsuario,
          Usuario: dbUser.Usuario,
          NombreCompleto: dbUser.NombreCompleto,
          Email: dbUser.Email,
          Rol: dbUser.Rol,
          UltimoAcceso: dbUser.UltimoAcceso,
          Origen: 'LOCAL'
        };

        await getPool().request()
          .input('IdUsuario', sql.Int, Number(dbUser.IdUsuario))
          .query('UPDATE TBL_USUARIOS SET UltimoAcceso = GETDATE() WHERE IdUsuario = @IdUsuario');
      } else {
        const result = await getPool().request()
          .input('Usuario', sql.VarChar(50), usuario)
          .input('Contrasena', sql.VarChar(255), contrasena)
          .execute('sp_login_usuario');
        data = result.recordset?.[0] || null;

        if (!data || Number(data.Success) !== 1) {
          try {
            const erpResult = await getPool().request()
              .input('UserLogon', sql.VarChar(80), usuario)
              .query(`
                SELECT TOP 1
                  User_Fullname,
                  User_Logon,
                  User_Estado,
                  User_Email,
                  User_PassBin,
                  TRY_CONVERT(varchar(255), User_PassBin) AS UserPassText
                FROM dbo.vw_ERP_Usuarios
                WHERE User_Logon = @UserLogon
              `);

            const erpUser = erpResult.recordset?.[0] || null;
            if (erpUser) {
              failedLoginOrigin = 'ERP';
              failedLoginName = erpUser.User_Fullname || erpUser.User_Logon || null;
              failedLoginReason = 'Contrasena ERP invalida';
              if (!isErpUserActive(erpUser.User_Estado)) {
                await auditAuthAttempt(req, {
                  accion: 'LOGIN_FAIL',
                  usuario,
                  nombreUsuario: erpUser.User_Fullname || erpUser.User_Logon,
                  origen: 'ERP',
                  motivo: 'Usuario ERP inactivo'
                });
                return res.status(403).json({
                  success: false,
                  message: 'Usuario inactivo'
                });
              }

              const validErp = matchesErpPassword(contrasena, erpUser);
              if (validErp) {
                const erpAccess = await resolveErpAccess(erpUser.User_Logon);
                if (erpAccess.activo !== '1') {
                  await auditAuthAttempt(req, {
                    accion: 'LOGIN_FAIL',
                    usuario,
                    nombreUsuario: erpAccess.nombreCompleto || erpUser.User_Fullname || erpUser.User_Logon,
                    origen: 'ERP',
                    motivo: 'Usuario ERP sin acceso a papeletas'
                  });
                  return res.status(403).json({
                    success: false,
                    message: 'Usuario sin acceso al sistema de papeletas'
                  });
                }
                data = {
                  Success: 1,
                  Message: 'Inicio de sesi�n correcto (ERP)',
                  IdUsuario: 0,
                  Usuario: erpUser.User_Logon,
                  NombreCompleto: erpAccess.nombreCompleto || erpUser.User_Fullname || erpUser.User_Logon,
                  Email: erpAccess.email || erpUser.User_Email || null,
                  Rol: erpAccess.rol,
                  SwNivel: erpAccess.swNivel,
                  UltimoAcceso: new Date(),
                  Origen: 'ERP'
                };
                await logErpAudit(
                  erpUser.User_Logon,
                  'LOGIN_OK',
                  'Inicio de sesion ERP correcto',
                  erpUser.User_Logon
                );
              }
            }
          } catch (erpLoginError) {
            console.warn('Login ERP no disponible:', erpLoginError?.message || erpLoginError);
          }
        }
      }

      if (data && Number(data.Success) === 1) {
        const origenLogin = data.Origen || (Number(data.IdUsuario) > 0 ? 'LOCAL' : 'ERP');
        const usuarioData = {
          id: data.IdUsuario,
          usuario: data.Usuario,
          nombre: data.NombreCompleto,
          email: data.Email,
          rol: data.Rol,
          sw_nivel: data.SwNivel || null,
          origen: origenLogin,
          ultimoAcceso: data.UltimoAcceso,
          fotoUrl: typeof getProfilePhotoUrl === 'function'
            ? await getProfilePhotoUrl((Number(data.IdUsuario) > 0) ? Number(data.IdUsuario) : data.Usuario)
            : null
        };

        if (typeof registrarAuditoria === 'function') {
          await registrarAuditoria(() => getPool().request(), {
            tabla: 'AUTH',
            idRegistro: Number(data.IdUsuario || 0) || 0,
            accion: 'LOGIN_OK',
            usuario: data.Usuario || null,
            nombreUsuario: data.NombreCompleto || data.Usuario || null,
            ip: typeof getClientIp === 'function' ? getClientIp(req) : null,
            navegador: req.headers['user-agent'] || null,
            datosNuevos: JSON.stringify({
              usuario: data.Usuario,
              rol: data.Rol,
              origen: origenLogin
            }),
            observaciones: `Inicio de sesion correcto (${origenLogin})`
          });
        }

        const token = createToken(usuarioData);
        return res.json({
          success: true,
          message: data.Message,
          token,
          usuario: usuarioData
        });
      }

      await auditAuthAttempt(req, {
        accion: 'LOGIN_FAIL',
        usuario,
        nombreUsuario: failedLoginName,
        origen: failedLoginOrigin,
        motivo: data?.Message || failedLoginReason
      });
      return res.status(401).json({
        success: false,
        message: data?.Message || 'Credenciales inv�lidas'
      });
    } catch (error) {
      console.error('Error en login:', error);
      return res.status(500).json({
        success: false,
        message: 'Error en el servidor: ' + error.message
      });
    }
  });

  app.get('/api/auth/verify', requireAuth, (req, res) => {
    res.json({
      success: true,
      usuario: {
        id: req.user.id,
        usuario: req.user.usuario,
        rol: req.user.rol
      }
    });
  });
}

module.exports = { registerAuthRoutes };
