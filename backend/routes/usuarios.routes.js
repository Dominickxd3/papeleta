const { hashPassword } = require('../services/password.service');

function registerUsuariosRoutes(app, deps) {
  const {
    sql,
    fs,
    path,
    profilePhotosDir,
    getProfilePhotoUrl,
    invalidateProfilePhotoCache,
    requireAprobacionRole
  } = deps;
  const getPool = deps.getPool || (() => deps.pool);

  const normalizeRole = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  const assertAdmin = (req, res) => {
    const role = normalizeRole(req.user?.rol || '');
    if (role === 'ADMIN' || role === 'ADMINISTRADOR' || role === 'ADMINISTRADOR DEL SISTEMA') return true;
    res.status(403).json({ success: false, message: 'Solo ADMIN puede gestionar usuarios ERP' });
    return false;
  };

  const normalizeErpActivo = (value) => (String(value ?? '').trim() === '0' || String(value ?? '').trim() === '2' ? '2' : '1');
  const apiActivoFromDb = (value) => (normalizeErpActivo(value) === '1' ? '1' : '0');
  const dbActivoFromApi = (value) => (String(value ?? '1').trim() === '0' ? '2' : '1');
  const swNivelFromRolApp = (rolApp) => {
    const role = normalizeRole(rolApp || 'USUARIO');
    if (role === 'SUPERADMIN') return 5;
    if (role === 'ADMIN') return 4;
    if (role === 'RRHH') return 3;
    return 1;
  };
  const rolAppFromSwNivelSql = (alias) => `
    CASE
      WHEN ISNULL(${alias}.sw_nivel, 1) >= 4 THEN 'ADMIN'
      WHEN ISNULL(${alias}.sw_nivel, 1) = 3 THEN 'RRHH'
      ELSE 'USUARIO'
    END
  `;

  const ensureErpAuditTable = async () => {
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
  };

  app.get('/api/usuarios/listar', requireAprobacionRole, async (req, res) => {
    try {
      const result = await getPool().request()
        .query(`
          SELECT
            IdUsuario,
            Usuario,
            NombreCompleto,
            Email,
            Rol,
            CASE WHEN Activo = '1' THEN 'Activo' ELSE 'Inactivo' END AS Estado,
            CASE WHEN Bloqueado = '1' THEN 'Bloqueado' ELSE 'Desbloqueado' END AS Acceso,
            FechaCreacion,
            UltimoAcceso
          FROM TBL_USUARIOS
          ORDER BY IdUsuario
        `);
      res.json(result.recordset);
    } catch (error) {
      console.error('Error listando usuarios:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/usuarios/perfil', async (req, res) => {
    try {
      const userId = Number(req.user?.id || 0);
      const tokenUser = {
        id: userId,
        usuario: req.user?.usuario || '',
        nombre: req.user?.nombre || req.user?.usuario || '',
        email: req.user?.email || '',
        rol: req.user?.rol || 'USUARIO',
        ultimoAcceso: req.user?.ultimoAcceso || null,
        fotoUrl: userId > 0
          ? await getProfilePhotoUrl(userId)
          : await getProfilePhotoUrl(req.user?.usuario || '')
      };

      if (!Number.isFinite(userId) || userId <= 0) {
        try {
          const erpResult = await getPool().request()
            .input('UserLogon', sql.VarChar(80), String(req.user?.usuario || ''))
            .query(`
              SELECT TOP 1
                User_Fullname,
                User_Logon,
                User_Email
              FROM dbo.vw_ERP_Usuarios
              WHERE User_Logon = @UserLogon
            `);
          const erp = erpResult.recordset?.[0] || null;
          if (erp) {
            tokenUser.nombre = erp.User_Fullname || tokenUser.nombre;
            tokenUser.email = erp.User_Email || tokenUser.email;
            tokenUser.usuario = erp.User_Logon || tokenUser.usuario;
          }
        } catch (erpProfileError) {
          console.warn('Perfil ERP no disponible:', erpProfileError?.message || erpProfileError);
        }

        return res.json({ success: true, perfil: tokenUser });
      }

      const result = await getPool().request()
        .input('IdUsuario', sql.Int, userId)
        .query(`
          SELECT TOP 1
            IdUsuario,
            Usuario,
            NombreCompleto,
            Email,
            Rol,
            UltimoAcceso
          FROM TBL_USUARIOS
          WHERE IdUsuario = @IdUsuario
        `);

      const u = result.recordset[0];
      if (!u) {
        return res.json({ success: true, perfil: tokenUser });
      }

      return res.json({
        success: true,
        perfil: {
          id: u.IdUsuario,
          usuario: u.Usuario,
          nombre: u.NombreCompleto,
          email: u.Email,
          rol: u.Rol,
          ultimoAcceso: u.UltimoAcceso,
          fotoUrl: await getProfilePhotoUrl(u.IdUsuario)
        }
      });
    } catch (error) {
      console.error('Error obteniendo perfil:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.put('/api/usuarios/perfil', async (req, res) => {
    try {
      const userId = Number(req.user?.id || 0);
      if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(403).json({ success: false, message: 'Perfil ERP no editable desde este modulo' });
      }

      const nombreCompleto = String(req.body?.nombreCompleto || '').trim();
      const email = String(req.body?.email || '').trim();

      if (!nombreCompleto) {
        return res.status(400).json({ success: false, message: 'Nombre completo es requerido' });
      }

      await getPool().request()
        .input('IdUsuario', sql.Int, userId)
        .input('NombreCompleto', sql.VarChar(200), nombreCompleto)
        .input('Email', sql.VarChar(200), email)
        .query(`
          UPDATE TBL_USUARIOS
          SET NombreCompleto = @NombreCompleto,
              Email = @Email
          WHERE IdUsuario = @IdUsuario
        `);

      return res.json({
        success: true,
        message: 'Perfil actualizado correctamente',
        perfil: {
          id: userId,
          usuario: req.user.usuario,
          nombre: nombreCompleto,
          email,
          rol: req.user.rol,
          fotoUrl: await getProfilePhotoUrl(userId)
        }
      });
    } catch (error) {
      console.error('Error actualizando perfil:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post('/api/usuarios/perfil/foto', async (req, res) => {
    try {
      const imageBase64 = String(req.body?.imageBase64 || '');
      const match = imageBase64.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);

      if (!match) {
        return res.status(400).json({ success: false, message: 'Formato de imagen invalido' });
      }

      const extRaw = match[1].toLowerCase();
      const ext = extRaw === 'jpeg' ? 'jpg' : extRaw;
      const buffer = Buffer.from(match[2], 'base64');

      if (buffer.length > 2 * 1024 * 1024) {
        return res.status(400).json({ success: false, message: 'La imagen supera 2MB' });
      }

      const userId = Number(req.user?.id || 0);
      const userLogonSafe = String(req.user?.usuario || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '_');
      const isLocalUser = Number.isFinite(userId) && userId > 0;
      const prefix = isLocalUser ? `user-${userId}.` : `erp-${userLogonSafe}.`;
      const existing = (await fs.promises.readdir(profilePhotosDir)).filter((f) => f.startsWith(prefix));
      await Promise.all(existing.map(async (f) => {
        try { await fs.promises.unlink(path.join(profilePhotosDir, f)); } catch {}
      }));

      const fileName = `${isLocalUser ? `user-${userId}` : `erp-${userLogonSafe}`}.${ext}`;
      const filePath = path.join(profilePhotosDir, fileName);
      await fs.promises.writeFile(filePath, buffer);
      if (typeof invalidateProfilePhotoCache === 'function') {
        invalidateProfilePhotoCache(isLocalUser ? userId : req.user?.usuario || '');
      }

      return res.json({
        success: true,
        message: 'Foto de perfil actualizada',
        fotoUrl: `/uploads/perfiles/${fileName}?v=${Date.now()}`
      });
    } catch (error) {
      console.error('Error actualizando foto de perfil:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.put('/api/usuarios/cambiar-password', async (req, res) => {
    try {
      const actual = String(req.body?.actual || '').trim();
      const nueva = String(req.body?.nueva || '').trim();
      const confirmar = String(req.body?.confirmar || '').trim();

      if (!actual || !nueva || !confirmar) {
        return res.status(400).json({ success: false, message: 'Complete todos los campos' });
      }
      if (nueva.length < 6) {
        return res.status(400).json({ success: false, message: 'La nueva contrasena debe tener al menos 6 caracteres' });
      }
      if (nueva !== confirmar) {
        return res.status(400).json({ success: false, message: 'La confirmacion no coincide' });
      }

      const check = await getPool().request()
        .input('Usuario', sql.VarChar(50), req.user.usuario)
        .input('Contrasena', sql.VarChar(255), actual)
        .execute('sp_login_usuario');

      const ok = check.recordset && check.recordset[0] && Number(check.recordset[0].Success) === 1;
      if (!ok) {
        return res.status(401).json({ success: false, message: 'La contrasena actual es incorrecta' });
      }

      const nuevaHash = hashPassword(nueva);
      await getPool().request()
        .input('IdUsuario', sql.Int, Number(req.user.id))
        .input('Contrasena', sql.VarChar(255), nuevaHash)
        .query('UPDATE TBL_USUARIOS SET Contrasena = @Contrasena WHERE IdUsuario = @IdUsuario');

      return res.json({ success: true, message: 'Contrasena actualizada correctamente' });
    } catch (error) {
      console.error('Error cambiando contrasena:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/usuarios-erp/roles', requireAprobacionRole, async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;

      const result = await getPool().request().query(`
        SELECT
          UserLogon,
          ${rolAppFromSwNivelSql('U')} AS RolApp,
          CASE WHEN ISNULL(U.Activo, '1') IN ('0', '2') THEN '0' ELSE '1' END AS Activo,
          FechaActualizacion,
          ActualizadoPor
        FROM dbo.TBL_USUARIOS_ERP_APP U
        ORDER BY UserLogon
      `);
      return res.json({ success: true, data: result.recordset || [] });
    } catch (error) {
      console.error('Error listando roles ERP:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/usuarios-erp/buscar', requireAprobacionRole, async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;

      const termRaw = String(req.query?.term || '').trim();
      if (termRaw.length < 2) {
        return res.json({ success: true, data: [] });
      }

      const term = `%${termRaw}%`;
      const result = await getPool().request()
        .input('Term', sql.VarChar(120), term)
        .query(`
          SELECT TOP 20
            U.User_Logon,
            U.User_Fullname,
            U.User_Email,
            U.User_Estado,
            ${rolAppFromSwNivelSql('AU')} AS RolApp,
            CASE WHEN ISNULL(AU.Activo, '1') IN ('0', '2') THEN '0' ELSE '1' END AS RolActivo
          FROM dbo.vw_ERP_Usuarios U
          LEFT JOIN dbo.TBL_USUARIOS_ERP_APP AU
            ON AU.UserLogon = U.User_Logon
          WHERE
            U.User_Logon LIKE @Term
            OR U.User_Fullname LIKE @Term
          ORDER BY
            CASE
              WHEN U.User_Logon = REPLACE(@Term, '%', '') THEN 0
              WHEN U.User_Logon LIKE REPLACE(@Term, '%', '') + '%' THEN 1
              ELSE 2
            END,
            U.User_Logon
        `);

      return res.json({ success: true, data: result.recordset || [] });
    } catch (error) {
      console.error('Error buscando usuarios ERP:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/usuarios-erp/panel', requireAprobacionRole, async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      await ensureErpAuditTable();

      const segment = String(req.query?.segment || 'all').trim().toLowerCase();
      const whereSegment = segment === 'admin'
        ? `WHERE ISNULL(UA.sw_nivel, 1) >= 4`
        : (segment === 'standard' ? `WHERE ISNULL(UA.sw_nivel, 1) < 4` : ``);

      const usersResult = await getPool().request().query(`
        SELECT TOP 400
          U.User_Logon,
          U.User_Fullname,
          U.User_Email,
          U.User_Estado,
          ${rolAppFromSwNivelSql('UA')} AS RolApp,
          CASE WHEN ISNULL(UA.Activo, '1') IN ('0', '2') THEN '0' ELSE '1' END AS RolActivo,
          L.FechaEvento AS UltimaConexion
        FROM dbo.vw_ERP_Usuarios U
        LEFT JOIN dbo.TBL_USUARIOS_ERP_APP UA
          ON UA.UserLogon = U.User_Logon
        OUTER APPLY (
          SELECT MAX(X.FechaEvento) AS FechaEvento
          FROM (
            SELECT A1.FechaEvento
            FROM (
              SELECT TOP 1 A.FechaEvento
              FROM dbo.TBL_USUARIOS_ERP_AUDITORIA A
              WHERE A.UserLogon = U.User_Logon
                AND A.TipoEvento = 'LOGIN_OK'
              ORDER BY A.FechaEvento DESC
            ) A1

            UNION ALL

            SELECT A2.FechaHora
            FROM (
              SELECT TOP 1 A.FechaHora
              FROM dbo.TBL_AUDITORIA A
              WHERE A.Tabla = 'AUTH'
                AND A.Accion = 'LOGIN_OK'
                AND A.Usuario = U.User_Logon
              ORDER BY A.FechaHora DESC
            ) A2
          ) X
        ) L
        ${whereSegment}
        ORDER BY U.User_Logon
      `);

      const statsResult = await getPool().request().query(`
        SELECT
          TotalUsuarios = COUNT(1),
          UsuariosERPActivos = SUM(
            CASE
              WHEN UPPER(LTRIM(RTRIM(ISNULL(U.User_Estado, '')))) IN ('INACTIVO','I','BLOQUEADO','B','NO','N','2','9')
                THEN 0
              ELSE 1
            END
          ),
          Administradores = SUM(CASE WHEN ISNULL(UA.sw_nivel, 1) >= 4 THEN 1 ELSE 0 END),
          UsuariosEstandar = SUM(CASE WHEN ISNULL(UA.sw_nivel, 1) < 4 THEN 1 ELSE 0 END)
        FROM dbo.vw_ERP_Usuarios U
        LEFT JOIN dbo.TBL_USUARIOS_ERP_APP UA
          ON UA.UserLogon = U.User_Logon
      `);

      return res.json({
        success: true,
        stats: statsResult.recordset?.[0] || {
          TotalUsuarios: 0,
          UsuariosERPActivos: 0,
          Administradores: 0,
          UsuariosEstandar: 0
        },
        data: usersResult.recordset || []
      });
    } catch (error) {
      console.error('Error cargando panel ERP:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.put('/api/usuarios-erp/roles/:userLogon', requireAprobacionRole, async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      await ensureErpAuditTable();

      const userLogon = String(req.params.userLogon || '').trim();
      const rolApp = normalizeRole(req.body?.rolApp || 'USUARIO');
      const activo = dbActivoFromApi(req.body?.activo ?? '1');
      const swNivel = swNivelFromRolApp(rolApp);
      const actualizadoPor = String(req.user?.usuario || 'SYSTEM').trim();

      if (!userLogon) {
        return res.status(400).json({ success: false, message: 'UserLogon es requerido' });
      }

      const allowed = new Set(['USUARIO', 'RRHH', 'ADMIN', 'SUPERADMIN']);
      if (!allowed.has(rolApp)) {
        return res.status(400).json({ success: false, message: 'Rol invalido. Use USUARIO, RRHH, ADMIN o SUPERADMIN' });
      }

      await getPool().request()
        .input('UserLogon', sql.VarChar(80), userLogon)
        .input('Activo', sql.Char(1), activo)
        .input('sw_nivel', sql.Int, swNivel)
        .input('ActualizadoPor', sql.VarChar(80), actualizadoPor)
        .query(`
          MERGE dbo.TBL_USUARIOS_ERP_APP AS T
          USING (SELECT @UserLogon AS UserLogon) AS S
             ON T.UserLogon = S.UserLogon
          WHEN MATCHED THEN
            UPDATE SET
              Activo = @Activo,
              sw_nivel = @sw_nivel,
              FechaActualizacion = GETDATE(),
              ActualizadoPor = @ActualizadoPor
          WHEN NOT MATCHED THEN
            INSERT (UserLogon, sw_nivel, Activo, FechaCreacion, FechaActualizacion, ActualizadoPor)
            VALUES (@UserLogon, @sw_nivel, @Activo, GETDATE(), GETDATE(), @ActualizadoPor);
        `);

      await getPool().request()
        .input('UserLogon', sql.VarChar(80), userLogon)
        .input('TipoEvento', sql.VarChar(40), 'ROLE_UPDATED')
        .input('Detalle', sql.NVarChar(500), `Rol=${rolApp};sw_nivel=${swNivel};Activo=${apiActivoFromDb(activo)}`)
        .input('RealizadoPor', sql.VarChar(80), actualizadoPor)
        .query(`
          INSERT INTO dbo.TBL_USUARIOS_ERP_AUDITORIA (UserLogon, TipoEvento, Detalle, RealizadoPor)
          VALUES (@UserLogon, @TipoEvento, @Detalle, @RealizadoPor)
        `);

      return res.json({ success: true, message: 'Rol ERP actualizado correctamente' });
    } catch (error) {
      console.error('Error guardando rol ERP:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post('/api/usuarios-erp/acciones/:userLogon', requireAprobacionRole, async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      await ensureErpAuditTable();

      const userLogon = String(req.params.userLogon || '').trim();
      const accion = normalizeRole(req.body?.accion || '');
      const actualizadoPor = String(req.user?.usuario || 'SYSTEM').trim();
      if (!userLogon) {
        return res.status(400).json({ success: false, message: 'UserLogon es requerido' });
      }

      const doUpsertActivo = async (activo, tipoEvento) => {
        await getPool().request()
          .input('UserLogon', sql.VarChar(80), userLogon)
          .input('Activo', sql.Char(1), activo)
          .input('ActualizadoPor', sql.VarChar(80), actualizadoPor)
          .query(`
            MERGE dbo.TBL_USUARIOS_ERP_APP AS T
            USING (SELECT @UserLogon AS UserLogon) AS S
               ON T.UserLogon = S.UserLogon
            WHEN MATCHED THEN
              UPDATE SET
                Activo = @Activo,
                FechaActualizacion = GETDATE(),
                ActualizadoPor = @ActualizadoPor
            WHEN NOT MATCHED THEN
              INSERT (UserLogon, sw_nivel, Activo, FechaCreacion, FechaActualizacion, ActualizadoPor)
              VALUES (@UserLogon, 1, @Activo, GETDATE(), GETDATE(), @ActualizadoPor);
          `);

        await getPool().request()
          .input('UserLogon', sql.VarChar(80), userLogon)
          .input('TipoEvento', sql.VarChar(40), tipoEvento)
          .input('Detalle', sql.NVarChar(500), `Accion=${tipoEvento}`)
          .input('RealizadoPor', sql.VarChar(80), actualizadoPor)
          .query(`
            INSERT INTO dbo.TBL_USUARIOS_ERP_AUDITORIA (UserLogon, TipoEvento, Detalle, RealizadoPor)
            VALUES (@UserLogon, @TipoEvento, @Detalle, @RealizadoPor)
          `);
      };

      if (accion === 'BLOCK_ACCOUNT') {
        await doUpsertActivo('2', 'ACCOUNT_BLOCKED');
        return res.json({ success: true, message: 'Cuenta bloqueada en el sistema' });
      }

      if (accion === 'UNBLOCK_ACCOUNT') {
        await doUpsertActivo('1', 'ACCOUNT_UNBLOCKED');
        return res.json({ success: true, message: 'Cuenta desbloqueada en el sistema' });
      }

      if (accion === 'RESET_PASSWORD') {
        await getPool().request()
          .input('UserLogon', sql.VarChar(80), userLogon)
          .input('TipoEvento', sql.VarChar(40), 'RESET_REQUESTED')
          .input('Detalle', sql.NVarChar(500), 'Solicitud de reseteo registrada (Fase 1, sin cambio en ERP)')
          .input('RealizadoPor', sql.VarChar(80), actualizadoPor)
          .query(`
            INSERT INTO dbo.TBL_USUARIOS_ERP_AUDITORIA (UserLogon, TipoEvento, Detalle, RealizadoPor)
            VALUES (@UserLogon, @TipoEvento, @Detalle, @RealizadoPor)
          `);

        return res.json({ success: true, message: 'Solicitud de reseteo registrada' });
      }

      return res.status(400).json({ success: false, message: 'Accion no soportada' });
    } catch (error) {
      console.error('Error ejecutando accion ERP:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/usuarios-erp/historial/:userLogon', requireAprobacionRole, async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      await ensureErpAuditTable();

      const userLogon = String(req.params.userLogon || '').trim();
      if (!userLogon) {
        return res.status(400).json({ success: false, message: 'UserLogon es requerido' });
      }

      const result = await getPool().request()
        .input('UserLogon', sql.VarChar(80), userLogon)
        .query(`
          SELECT TOP 80
            TipoEvento,
            Detalle,
            RealizadoPor,
            FechaEvento
          FROM dbo.TBL_USUARIOS_ERP_AUDITORIA
          WHERE UserLogon = @UserLogon
          ORDER BY FechaEvento DESC
        `);

      return res.json({ success: true, data: result.recordset || [] });
    } catch (error) {
      console.error('Error cargando historial ERP:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });
}

module.exports = { registerUsuariosRoutes };
