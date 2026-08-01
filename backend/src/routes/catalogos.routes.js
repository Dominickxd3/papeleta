// src/routes/catalogos.routes.js
// Define los mismos endpoints que routes/catalogos.routes.js (contrato sin cambios).

const { createCatalogosController } = require('../controllers/catalogos.controller');

function registerCatalogosRoutes(app, deps) {
  const controller = createCatalogosController(deps);

  app.get('/api/tipos-permiso/listar', controller.listarTiposPermiso);
  app.get('/api/areas/listar', controller.listarAreas);
  app.get('/api/estados/listar', controller.listarEstados);
  app.get('/api/feriados/listar', controller.listarFeriados);
  app.get('/api/configuracion/listar', controller.listarConfiguracion);
  app.get('/api/horarios/listar', controller.listarHorarios);
}

module.exports = { registerCatalogosRoutes };
