const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { createAuthTools } = require('./middlewares/auth');
const { createActivityService, getClientIp } = require('./services/activity.service');
const { convertirHoraSQL } = require('./services/time.service');
const { registerPapeletasRoutes } = require('./routes/papeletas.routes');
const { registerUsuariosRoutes } = require('./routes/usuarios.routes');
const { registerTrabajadoresRoutes } = require('./routes/trabajadores.routes');
const { registerCatalogosRoutes } = require('./routes/catalogos.routes');
const { registerSystemRoutes } = require('./routes/system.routes');
const { registerAuthRoutes } = require('./routes/auth.routes');
const { registerMonitoringRoutes } = require('./routes/monitoring.routes');

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const idx = trimmed.indexOf('=');
    if (idx <= 0) {
      continue;
    }

    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const app = express();
const appRootDir = path.resolve(__dirname, '..');
const frontendRootDir = process.env.FRONTEND_DIR
  ? path.resolve(process.env.FRONTEND_DIR)
  : appRootDir;
const APP_BASE_PATH = (() => {
  const raw = String(process.env.APP_BASE_PATH || '').trim();
  if (!raw) return '';
  const normalized = `/${raw.replace(/^\/+|\/+$/g, '')}`;
  return normalized === '/' ? '' : normalized;
})();
const prefixedUrl = (req, targetPath) => {
  const safePath = String(targetPath || '/').startsWith('/') ? String(targetPath || '/') : `/${targetPath}`;
  if (!APP_BASE_PATH) return safePath;
  const original = String(req.originalUrl || '');
  return original.startsWith(`${APP_BASE_PATH}/`) || original === APP_BASE_PATH
    ? `${APP_BASE_PATH}${safePath}`
    : safePath;
};

// 1. CONFIGURACIÓN
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '5mb';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);
const PUBLIC_APP_ORIGIN = String(
  process.env.PUBLIC_APP_ORIGIN ||
  process.env.APP_PUBLIC_ORIGIN ||
  ''
).trim();
const defaultAllowedOrigins = new Set([
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5500'
]);
if (PUBLIC_APP_ORIGIN) {
  defaultAllowedOrigins.add(PUBLIC_APP_ORIGIN);
}
const configuredOrigins = new Set(CORS_ORIGINS);

app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (configuredOrigins.size > 0) {
      return configuredOrigins.has(origin)
        ? callback(null, true)
        : callback(new Error('Origen no permitido por CORS'));
    }
    return defaultAllowedOrigins.has(origin)
      ? callback(null, true)
      : callback(new Error('Origen no permitido por CORS'));
  }
}));
app.use((err, req, res, next) => {
  if (err && /CORS/i.test(String(err.message || ''))) {
    return res.status(403).json({ success: false, message: err.message });
  }
  return next(err);
});

// Permite exponer toda la app bajo un subpath, por ejemplo:
// APP_BASE_PATH=/SistemasPapeletas
if (APP_BASE_PATH) {
  app.use((req, res, next) => {
    if (req.url === APP_BASE_PATH || req.url.startsWith(`${APP_BASE_PATH}/`)) {
      req.url = req.url.slice(APP_BASE_PATH.length) || '/';
    }
    next();
  });
}

const uploadsDir = path.join(__dirname, 'uploads');
const profilePhotosDir = path.join(uploadsDir, 'perfiles');
if (!fs.existsSync(profilePhotosDir)) {
  fs.mkdirSync(profilePhotosDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Middleware de Logs (solo desarrollo / debug explicito)
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_REQUEST_LOGS === 'true') {
    console.log(`${req.method} ${req.url}`);
  }
  next();
});

// 2. CONFIGURACIÓN SQL SERVER - DB_GP_Trabajos_TEST
const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
    enableArithAbort: true
  }
};

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const JWT_SECRET = process.env.JWT_SECRET || process.env.TOKEN_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';
const JWT_ISSUER = process.env.JWT_ISSUER || 'papeletas-gp';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'papeletas-gp-web';

let pool;

async function connectDB() {
  try {
    if (!config.user || !config.password || !config.server || !config.database) {
      throw new Error('Faltan variables de entorno DB_USER, DB_PASSWORD, DB_SERVER o DB_NAME');
    }

    if (!JWT_SECRET) {
      throw new Error('Falta variable de entorno JWT_SECRET (o TOKEN_SECRET por compatibilidad)');
    }

    pool = await sql.connect(config);
    console.log('✅ Conexión exitosa a SQL Server');
    console.log(`   📍 Servidor: ${config.server}`);
    console.log(`   💾 Base de datos: ${config.database}`);
  } catch (err) {
    console.error('❌ Error FATAL al conectar a SQL:', err);
    process.exit(1);
  }
}

const { authorizeRoles, createToken, requireAuth } = createAuthTools({
  JWT_SECRET,
  JWT_EXPIRES_IN,
  JWT_ISSUER,
  JWT_AUDIENCE
});

const requireTrabajadoresRole = authorizeRoles([
  'ADMIN',
  'ADMINISTRADOR',
  'ADMINISTRADOR DEL SISTEMA',
  'RRHH',
  'RR HH',
  'RECURSOS HUMANOS'
]);

const {
  registrarAuditoria,
  crearNotificacionUsuario,
  crearNotificacionRRHH
} = createActivityService(sql);
const requireAprobacionRole = authorizeRoles([
  'ADMIN',
  'ADMINISTRADOR',
  'ADMINISTRADOR DEL SISTEMA',
  'RRHH',
  'RR HH',
  'RECURSOS HUMANOS'
]);

const profilePhotoCache = new Map();
const PROFILE_PHOTO_CACHE_TTL_MS = 10_000;

function normalizeProfileKey(userRef) {
  const id = Number(userRef);
  if (Number.isFinite(id) && id > 0) return `id:${id}`;
  const raw = String(userRef || '').trim().toLowerCase();
  if (!raw) return null;
  return `logon:${raw.replace(/[^a-z0-9._-]/g, '_')}`;
}

function invalidateProfilePhotoCache(userRef) {
  const key = normalizeProfileKey(userRef);
  if (key) profilePhotoCache.delete(key);
}

async function getProfilePhotoUrl(userRef) {
  try {
    const key = normalizeProfileKey(userRef);
    if (!key) return null;

    const isId = key.startsWith('id:');
    const suffix = key.slice(isId ? 3 : 6);
    const prefix = isId ? `user-${suffix}.` : `erp-${suffix}.`;

    const now = Date.now();
    const cached = profilePhotoCache.get(key);
    if (cached && (now - cached.ts) < PROFILE_PHOTO_CACHE_TTL_MS) {
      return cached.url;
    }

    const files = await fsp.readdir(profilePhotosDir);
    const file = files.find((f) => f.startsWith(prefix));
    const url = file ? `/uploads/perfiles/${file}` : null;
    profilePhotoCache.set(key, { url, ts: now });
    return url;
  } catch {
    return null;
  }
}


// ==========================================
// AUTH
// ==========================================
registerAuthRoutes(app, {
  getPool: () => pool,
  sql,
  createToken,
  requireAuth,
  getProfilePhotoUrl,
  registrarAuditoria,
  getClientIp
});

app.use('/api', (req, res, next) => {
  const publicPaths = new Set(['/', '/auth/login', '/health']);
  if (publicPaths.has(req.path)) {
    return next();
  }
  return requireAuth(req, res, next);
});

registerMonitoringRoutes(app, {
  getPool: () => pool,
  sql,
  requireAprobacionRole
});
// ==========================================
// USUARIOS
// ==========================================
registerUsuariosRoutes(app, {
  getPool: () => pool,
  sql,
  fs,
  path,
  profilePhotosDir,
  getProfilePhotoUrl,
  invalidateProfilePhotoCache,
  requireAprobacionRole
});

// ==========================================
// PAPELETAS DE PERMISO
// ==========================================
registerPapeletasRoutes(app, {
  getPool: () => pool,
  sql,
  requireAprobacionRole,
  convertirHoraSQL,
  registrarAuditoria,
  crearNotificacionUsuario,
  crearNotificacionRRHH,
  getClientIp,
  PDFDocument,
  fs,
  path,
  backendDir: __dirname
});

// ==========================================
// TRABAJADORES
// ==========================================
registerTrabajadoresRoutes(app, {
  getPool: () => pool,
  sql,
  requireTrabajadoresRole,
  registrarAuditoria,
  getClientIp
});

// ==========================================
// CATALOGOS
// ==========================================
registerCatalogosRoutes(app, { getPool: () => pool });
registerSystemRoutes(app, { getPool: () => pool, sql });

// ==========================================
// FRONTEND (RUTAS WEB + ARCHIVOS ESTATICOS)
// ==========================================
app.use('/css', express.static(path.join(frontendRootDir, 'css')));
app.use('/js', express.static(path.join(frontendRootDir, 'js')));
app.use('/img', express.static(path.join(frontendRootDir, 'img')));
app.use('/icons', express.static(path.join(frontendRootDir, 'icons')));
app.use('/lib', express.static(path.join(frontendRootDir, 'lib')));
app.use('/HTML', express.static(path.join(frontendRootDir, 'HTML')));

// Compatibilidad local/produccion: algunos navegadores pueden conservar el
// manifest anterior con scope /SistemasPapeletas aunque APP_BASE_PATH no este activo.
app.use('/SistemasPapeletas/css', express.static(path.join(frontendRootDir, 'css')));
app.use('/SistemasPapeletas/js', express.static(path.join(frontendRootDir, 'js')));
app.use('/SistemasPapeletas/img', express.static(path.join(frontendRootDir, 'img')));
app.use('/SistemasPapeletas/icons', express.static(path.join(frontendRootDir, 'icons')));
app.use('/SistemasPapeletas/lib', express.static(path.join(frontendRootDir, 'lib')));
app.use('/SistemasPapeletas/HTML', express.static(path.join(frontendRootDir, 'HTML')));

const safeSendFile = (res, absolutePath, fallbackStatus = 404) => {
  if (fs.existsSync(absolutePath)) return res.sendFile(absolutePath);
  return res.status(fallbackStatus).json({
    success: false,
    message: 'Archivo no encontrado',
    path: absolutePath
  });
};

// Archivos raíz de producción
app.get('/manifest.webmanifest', (req, res) => {
  safeSendFile(res, path.join(frontendRootDir, 'manifest.webmanifest'));
});
app.get('/SistemasPapeletas/manifest.webmanifest', (req, res) => {
  safeSendFile(res, path.join(frontendRootDir, 'manifest.webmanifest'));
});
app.get('/robots.txt', (req, res) => {
  safeSendFile(res, path.join(frontendRootDir, 'robots.txt'));
});
app.get('/sitemap.xml', (req, res) => {
  safeSendFile(res, path.join(frontendRootDir, 'sitemap.xml'));
});
app.get('/favicon.ico', (req, res) => {
  safeSendFile(res, path.join(frontendRootDir, 'img', 'logo-gp.png'));
});
app.get('/SistemasPapeletas/favicon.ico', (req, res) => {
  safeSendFile(res, path.join(frontendRootDir, 'img', 'logo-gp.png'));
});

// Compatibilidad con enlaces existentes (*.html en raíz)
const pageFileBySlug = {
  dashboard: path.join(frontendRootDir, 'HTML', 'dashboard.html'),
  papeletas: path.join(frontendRootDir, 'HTML', 'permisos.html'),
  permisos: path.join(frontendRootDir, 'HTML', 'permisos.html'),
  trabajadores: path.join(frontendRootDir, 'HTML', 'trabajadores.html'),
  perfil: path.join(frontendRootDir, 'HTML', 'perfil.html'),
  reportes: path.join(frontendRootDir, 'HTML', 'reporte.html'),
  reporte: path.join(frontendRootDir, 'HTML', 'reporte.html'),
  'nueva-papeleta': path.join(frontendRootDir, 'HTML', 'formulario-papeleta.html'),
  'formulario-papeleta': path.join(frontendRootDir, 'HTML', 'formulario-papeleta.html')
};

// Landing/Login
app.get('/', (req, res) => {
  safeSendFile(res, path.join(frontendRootDir, 'index.html'));
});
app.get('/index.html', (req, res) => {
  safeSendFile(res, path.join(frontendRootDir, 'index.html'));
});

// Rutas limpias de producción
Object.entries(pageFileBySlug).forEach(([slug, file]) => {
  app.get(`/${slug}`, (req, res) => safeSendFile(res, file));
  app.get(`/${slug}.html`, (req, res) => safeSendFile(res, file));
});

// Legacy explícito: /HTML/*.html
app.get('/HTML/:file', (req, res, next) => {
  const file = String(req.params.file || '').toLowerCase();
  const legacyMap = {
    'dashboard.html': '/dashboard',
    'permisos.html': '/papeletas',
    'trabajadores.html': '/trabajadores',
    'perfil.html': '/perfil',
    'reporte.html': '/reportes',
    'formulario-papeleta.html': '/nueva-papeleta'
  };
  const target = legacyMap[file];
  if (!target) return next();
  return res.redirect(302, prefixedUrl(req, target));
});

// Error handler global (500)
app.use((err, req, res, next) => {
  console.error('❌ Error no controlado:', err);
  const accept = String(req.headers.accept || '');
  if (accept.includes('text/html')) {
    const file = path.join(frontendRootDir, '500.html');
    if (fs.existsSync(file)) return res.status(500).sendFile(file);
  }
  return res.status(500).json({
    success: false,
    message: 'Error interno del servidor'
  });
});

// ✅ 404 (SIEMPRE AL FINAL, EL ÚLTIMO MIDDLEWARE)
app.use((req, res) => {
  const accept = String(req.headers.accept || '');
  if (accept.includes('text/html')) {
    const file = path.join(frontendRootDir, '404.html');
    if (fs.existsSync(file)) return res.status(404).sendFile(file);
  }
  res.status(404).json({
    success: false,
    message: 'Endpoint no encontrado',
    url: req.url,
    sugerencia: 'Visita GET / para ver todos los endpoints disponibles'
  });
});

// ARRANQUE
connectDB().then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`\nAPI Papeletas GP corriendo en http://${HOST}:${PORT}`);
  });
});

process.on('SIGINT', async () => {
  console.log('\n⚠️  Cerrando servidor...');
  if (pool) {
    await pool.close();
    console.log('🔌 Conexión cerrada');
  }
  process.exit(0);
});
























