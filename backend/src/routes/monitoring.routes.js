// src/routes/monitoring.routes.js
// Define los mismos endpoints que routes/monitoring.routes.js (contrato sin cambios).

const { createMonitoringController } = require('../controllers/monitoring.controller');

function registerMonitoringRoutes(app, deps) {
  const controller = createMonitoringController(deps);

  app.get('/api/notificaciones/mias', controller.listarMisNotificaciones);
  app.put('/api/notificaciones/:id/leido', controller.marcarLeida);
  app.get('/api/auditoria/listar', deps.requireAprobacionRole, controller.listarAuditoria);
}

module.exports = { registerMonitoringRoutes };
