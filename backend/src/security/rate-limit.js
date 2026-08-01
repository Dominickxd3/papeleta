// src/security/rate-limit.js
// Limitador de intentos de autenticación en memoria (por clave).
// NO altera la lógica de login: solo añade una capa de protección opcional.
// Activar con LOGIN_RATE_LIMIT_ENABLED=true en el entorno.

function createRateLimiter(options = {}) {
  const maxAttempts = Number(options.maxAttempts) || 5;
  const windowMs = Number(options.windowMs) || 60000;
  const hits = new Map();

  function keyOf(parts) {
    return parts.filter(Boolean).join('|').toLowerCase();
  }

  function check(parts) {
    const key = keyOf(parts);
    const record = hits.get(key);
    if (!record) return { allowed: true, remaining: maxAttempts };
    if (Date.now() - record.startedAt >= windowMs) {
      hits.delete(key);
      return { allowed: true, remaining: maxAttempts };
    }
    if (record.count >= maxAttempts) {
      return { allowed: false, remaining: 0, retryAfterMs: windowMs - (Date.now() - record.startedAt) };
    }
    return { allowed: true, remaining: maxAttempts - record.count };
  }

  function record(parts) {
    const key = keyOf(parts);
    const now = Date.now();
    const record = hits.get(key);
    if (!record || now - record.startedAt >= windowMs) {
      hits.set(key, { startedAt: now, count: 1 });
      return;
    }
    record.count += 1;
  }

  function clear(parts) {
    hits.delete(keyOf(parts));
  }

  return { check, record, clear };
}

module.exports = { createRateLimiter };
