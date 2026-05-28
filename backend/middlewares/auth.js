const jwt = require('jsonwebtoken');

function normalizeRole(role) {
  return String(role || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function createAuthTools(config) {
  const {
    JWT_SECRET,
    JWT_EXPIRES_IN,
    JWT_ISSUER,
    JWT_AUDIENCE
  } = config;

  function authorizeRoles(allowedRoles = []) {
    const allowed = new Set(allowedRoles.map((r) => normalizeRole(r)));
    return (req, res, next) => {
      const tokenRole = req.user && req.user.rol ? req.user.rol : '';
      const role = normalizeRole(tokenRole || '');

      if (!role) {
        return res.status(401).json({ success: false, message: 'No autorizado' });
      }
      if (!allowed.has(role)) {
        return res.status(403).json({ success: false, message: 'Acceso denegado' });
      }
      return next();
    };
  }

  function createToken(user) {
    if (!JWT_SECRET) throw new Error('JWT_SECRET no configurado');

    const payload = {
      id: user.id,
      usuario: user.usuario,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      sw_nivel: user.sw_nivel,
      origen: user.origen
    };

    return jwt.sign(payload, JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: JWT_EXPIRES_IN,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      subject: String(user.id || user.usuario || 'user')
    });
  }

  function verifyToken(token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE
      });
      return { valid: true, payload };
    } catch (error) {
      if (error && error.name === 'TokenExpiredError') return { valid: false, reason: 'expired' };
      return { valid: false, reason: 'invalid' };
    }
  }

  function getRequestToken(req) {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim();
    return '';
  }

  function requireAuth(req, res, next) {
    const token = getRequestToken(req);
    if (!token) return res.status(401).json({ success: false, message: 'Token requerido' });

    const result = verifyToken(token);
    if (!result.valid) {
      const message = result.reason === 'expired' ? 'Token expirado' : 'Token inválido';
      return res.status(401).json({ success: false, message });
    }

    req.user = result.payload;
    return next();
  }

  return {
    normalizeRole,
    authorizeRoles,
    createToken,
    requireAuth
  };
}

module.exports = { createAuthTools, normalizeRole };
