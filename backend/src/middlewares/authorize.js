// src/middlewares/authorize.js
// Ayudantes para aplicar políticas de src/security/policy.js sobre peticiones.
// Preserva el contrato HTTP de las rutas (success:false + message + status).

// Aplica una política dentro de un handler. Retorna true si pasa,
// o escribe la respuesta 4xx y retorna false si no.
function assertPolicy(decision, res) {
  if (decision.allowed) return true;
  res.status(decision.status || 403).json({ success: false, message: decision.message });
  return false;
}

// Middleware para rutas que ya tienen req.user (requiere requireAuth previo).
function requirePolicy(policyFn) {
  return (req, res, next) => {
    const decision = policyFn(req.user, req);
    if (decision.allowed) return next();
    return res.status(decision.status || 403).json({ success: false, message: decision.message });
  };
}

module.exports = { assertPolicy, requirePolicy };
