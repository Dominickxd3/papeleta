// src/routes/system.routes.js
// Define los mismos endpoints que routes/system.routes.js (contrato sin cambios).

const { createSystemController } = require('../controllers/system.controller');

function registerSystemRoutes(app, deps) {
  const controller = createSystemController(deps);

  app.get('/api/estadisticas/general', controller.estadisticasGeneral);
  app.get('/api/estadisticas/top-usuarios', controller.topUsuarios);
  app.get('/api', controller.apiRoot);
  app.get('/api/health', controller.health);
  app.get('/api/health/database', controller.healthDatabase);
  app.get('/api/estadisticas/por-area', controller.estadisticasPorArea);
  app.get('/api/estadisticas/por-mes/:year', controller.estadisticasPorMes);
}

module.exports = { registerSystemRoutes };
