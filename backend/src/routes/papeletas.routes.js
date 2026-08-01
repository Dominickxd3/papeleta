// src/routes/papeletas.routes.js
// Replica exactamente el registro de routes/papeletas.routes.js: mismas rutas,
// mismos metodos HTTP, mismos middlewares, mismos parametros y mismos nombres,
// pero delegando cada handler en src/controllers/papeletas.controller.js.
// Sin SQL, sin logica de negocio, sin PDF ni Excel en este archivo: solo
// ensambla las dependencias y registra los endpoints.

const ExcelJS = require('exceljs');

const { createPapeletasController } = require('../controllers/papeletas.controller');
const { PapeletaRepository } = require('../repositories/papeleta.repository');
const { PapeletaAuditoriaRepository } = require('../repositories/papeleta.auditoria.repository');
const { PapeletaEsquemaRepository } = require('../repositories/papeleta.esquema.repository');
const { ErpAccesoRepository } = require('../repositories/erp.acceso.repository');
const { createPapeletaNegocioService } = require('../services/papeleta.negocio.service');
const { createPapeletaEstadoCache } = require('../services/papeleta.estado-cache');

function registerPapeletasRoutes(app, deps) {
  const { getPool, sql, requireAprobacionRole } = deps;

  const repository = deps.repository || new PapeletaRepository(getPool, sql);
  const auditoriaRepository = deps.auditoriaRepository || new PapeletaAuditoriaRepository(getPool, sql);
  const esquemaRepository = deps.esquemaRepository || new PapeletaEsquemaRepository(getPool, sql);
  const erpRepository = deps.erpRepository || new ErpAccesoRepository(getPool, sql);
  const negocio = deps.negocio || createPapeletaNegocioService();
  const estadoCache = deps.estadoCache || createPapeletaEstadoCache();

  const controller = createPapeletasController({
    ...deps,
    ExcelJS,
    repository,
    auditoriaRepository,
    esquemaRepository,
    erpRepository,
    negocio,
    estadoCache
  });

  app.get('/api/papeletas/mostrar', controller.mostrar);
  app.get('/api/papeletas/listar', controller.listar);
  app.get('/api/papeletas/exportar-excel', controller.exportarExcel);
  app.get('/api/papeletas/ultimo-numero', controller.ultimoNumero);
  app.post('/api/papeletas/insertar', controller.insertar);
  app.put('/api/papeletas/editar', controller.editar);
  app.delete('/api/papeletas/eliminar', controller.eliminar);
  app.patch('/api/papeletas/restaurar', requireAprobacionRole, controller.restaurar);
  app.get('/api/papeletas/:id/historial', controller.historial);
  app.get('/api/papeletas/reporte/:id', controller.reporte);
  app.get('/api/papeletas/:id/pdf', controller.generarPdf);
  app.get('/api/papeletas/por-estado', controller.porEstado);
  app.post('/api/papeletas/gestionar', requireAprobacionRole, controller.gestionar);
}

module.exports = { registerPapeletasRoutes };
