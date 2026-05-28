const { verifyPassword, isHashedPassword } = require('../services/password.service');

function registerAuthRoutes(app, deps) {
  const { pool, sql, createToken, requireAuth, getProfilePhotoUrl } = deps;
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
    const estado = String(estadoRaw ?? '').trim().toUpperCase();
    if (!estado) return true;
    const inactiveStates = new Set(['INACTIVO', 'I', 'BLOQUEADO', 'B', 'NO', 'N', '2', '9']);
    return !inactiveStates.has(estado);
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

  const roleFromSwNivel = (swNivel) => {
    const nivel = Number(swNivel || 0);
    if (nivel >= 4) return 'ADMIN';
    if (nivel === 3) return 'RRHH';
    return 'USUARIO';
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

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { usuario, contrasena } = req.body;

      if (!usuario || !contrasena) {
        return res.status(400).json({
          success: false,
          message: 'Usuario y contraseña son requeridos'
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
      if (dbUser && isHashedPassword(dbUser.Contrasena)) {
        if (String(dbUser.Bloqueado || '0') === '1') {
          return res.status(403).json({
            success: false,
            message: 'Usuario bloqueado'
          });
        }
        const valid = verifyPassword(contrasena, dbUser.Contrasena);
        if (!valid) {
          return res.status(401).json({
            success: false,
            message: 'Credenciales inválidas'
          });
        }

        data = {
          Success: 1,
          Message: 'Inicio de sesión correcto',
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
              if (!isErpUserActive(erpUser.User_Estado)) {
                return res.status(403).json({
                  success: false,
                  message: 'Usuario inactivo'
                });
              }

              const validErp = matchesErpPassword(contrasena, erpUser);
              if (validErp) {
                const erpAccess = await resolveErpAccess(erpUser.User_Logon);
                if (erpAccess.activo !== '1') {
                  return res.status(403).json({
                    success: false,
                    message: 'Usuario sin acceso al sistema de papeletas'
                  });
                }
                data = {
                  Success: 1,
                  Message: 'Inicio de sesión correcto (ERP)',
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
        const usuarioData = {
          id: data.IdUsuario,
          usuario: data.Usuario,
          nombre: data.NombreCompleto,
          email: data.Email,
          rol: data.Rol,
          sw_nivel: data.SwNivel || null,
          origen: data.Origen || (Number(data.IdUsuario) > 0 ? 'LOCAL' : 'ERP'),
          ultimoAcceso: data.UltimoAcceso,
          fotoUrl: typeof getProfilePhotoUrl === 'function'
            ? await getProfilePhotoUrl((Number(data.IdUsuario) > 0) ? Number(data.IdUsuario) : data.Usuario)
            : null
        };
        const token = createToken(usuarioData);
        return res.json({
          success: true,
          message: data.Message,
          token,
          usuario: usuarioData
        });
      }

      return res.status(401).json({
        success: false,
        message: data?.Message || 'Credenciales inválidas'
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
