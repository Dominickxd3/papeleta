
function detectAppBasePath() {
  const path = String(window.location.pathname || '');
  const m = path.match(/^\/SistemasPapeletas(?=\/|$)/i);
  return m ? m[0] : '';
}

function detectApiBaseURL(appBasePath) {
  const { origin, hostname, port } = window.location;
  const isLocalPreviewPort = port === '5500' || port === '5501';
  const isLocalHost = hostname === '127.0.0.1' || hostname === 'localhost';

  // Permite usar Live Server (5500/5501) con backend Node en 3000.
  if (isLocalHost && isLocalPreviewPort) {
    const devOrigin = hostname === 'localhost' ? 'http://localhost:3000' : 'http://127.0.0.1:3000';
    return `${devOrigin}/api`;
  }

  return `${origin}${appBasePath}/api`;
}

const APP_BASE_PATH = detectAppBasePath();

const API_CONFIG = {
  baseURL: detectApiBaseURL(APP_BASE_PATH),
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
};

class APIError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.data = data;
  }
}

async function handleResponse(response) {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      if (!window.location.pathname.toLowerCase().endsWith('/index.html')) {
        window.location.href = `${window.location.origin}${APP_BASE_PATH}/index.html`;
      }
    }
    throw new APIError(
      errorData.message || `HTTP error! status: ${response.status}`,
      response.status,
      errorData
    );
  }
  return response.json();
}

function obtenerNombrePC() {
  return navigator.userAgent.substring(0, 20) || 'WEB_CLIENT';
}

function formatearFecha(fecha) {
  if (!fecha) return '';
  const date = new Date(fecha);
  return date.toISOString().split('T')[0];
}

function formatearFechaHora(fecha) {
  if (!fecha) return '';
  const date = new Date(fecha);
  return date.toISOString();
}

function formatearHora(hora) {
  if (!hora) return '00:00:00';
  if (typeof hora === 'string' && hora.includes(':')) {
    return hora.length === 5 ? `${hora}:00` : hora;
  }
  return '00:00:00';
}

function getAuthHeaders() {
  const headers = { ...API_CONFIG.headers };

  const token = localStorage.getItem('token');
  if (token && token !== 'undefined' && token !== 'null') {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

window.getAuthHeaders = getAuthHeaders;

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

function isLoginPage() {
  const p = window.location.pathname.toLowerCase();
  const base = String(APP_BASE_PATH || '').toLowerCase();
  return p.endsWith('/index.html') || p === '/' || p === base || p === `${base}/`;
}

function hasValidSession() {
  const token = localStorage.getItem('token');
  const usuario = localStorage.getItem('usuario');
  return !!(token && token !== 'undefined' && token !== 'null' && token !== 'temp-token' && usuario && usuario !== 'undefined' && usuario !== 'null');
}

function forceLogoutByInactivity() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  if (!isLoginPage()) {
    window.location.href = `${window.location.origin}${APP_BASE_PATH}/index.html`;
  }
}

function setupInactivityLogout() {
  if (isLoginPage() || !hasValidSession()) {
    return;
  }

  let timerId;
  const resetTimer = () => {
    clearTimeout(timerId);
    timerId = setTimeout(forceLogoutByInactivity, INACTIVITY_TIMEOUT_MS);
  };

  ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach((evt) => {
    window.addEventListener(evt, resetTimer, { passive: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      resetTimer();
    }
  });

  resetTimer();
}

window.setupInactivityLogout = setupInactivityLogout;
setupInactivityLogout();

