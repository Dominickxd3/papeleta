// src/controllers/papeletas.controller.js
// Handlers de las 13 rutas de papeletas de permiso. Solo reciben req/res,
// llaman al servicio de flujo y replican el contrato HTTP del legacy
// (routes/papeletas.routes.js). Sin SQL y sin reglas de negocio: la orquestacion
// vive en flujo.service/repositories y las vistas documentales (PDF/Excel) se
// delegan a src/documents/*.

const { createPapeletaFlujoService } = require('../services/papeleta.flujo.service');
const { createPapeletaPdfDocument } = require('../documents/papeleta-pdf.document');
const { createPapeletaExcelDocument } = require('../documents/papeleta-excel.document');

function createPapeletasController(deps) {
  const flujo = deps.flujo || createPapeletaFlujoService(deps);
  const pdfDocument = deps.pdfDocument || createPapeletaPdfDocument(deps);
  const excelDocument = deps.excelDocument || createPapeletaExcelDocument(deps);

  const responder = (res, resultado) => {
    if (!resultado || typeof resultado.status !== 'number') {
      return res.status(500).json({ success: false, message: 'Respuesta inesperada del servicio' });
    }
    return res.status(resultado.status).json(resultado.body);
  };

  const mostrar = async (req, res) => responder(res, await flujo.mostrarPapeletas());

  const listar = async (req, res) => responder(res, await flujo.listarPapeletas({ user: req.user, query: req.query }));

  const exportarExcel = async (req, res) => {
    const resultado = await flujo.exportarExcel({ user: req.user, query: req.query });
    if (resultado.status !== 200 || !resultado.body) {
      return responder(res, resultado);
    }
    try {
      const { workbook, file } = await excelDocument.construirWorkbook(resultado.body);
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Disposition', file.contentDisposition);
      await workbook.xlsx.write(res);
      return res.end();
    } catch (error) {
      console.error('Error exportando Excel de papeletas:', error);
      if (!res.headersSent) return res.status(500).json({ success: false, message: error.message });
      return res.end();
    }
  };

  const ultimoNumero = async (req, res) => responder(res, await flujo.obtenerUltimoNumero());

  const insertar = async (req, res) => responder(res, await flujo.registrarCreacion(req.body || {}, req.user, req));

  const editar = async (req, res) => responder(res, await flujo.editarPapeleta(req.body || {}, req.user, req));

  const eliminar = async (req, res) => responder(res, await flujo.anularPapeleta(req.body?.IdPP, req.user, req));

  const restaurar = async (req, res) => responder(res, await flujo.restaurarPapeleta(req.body?.IdPP, req.user, req));

  const historial = async (req, res) => responder(res, await flujo.obtenerHistorial(req.params?.id));

  const reporte = async (req, res) => responder(res, await flujo.obtenerReporte(req.params?.id));

  const generarPdf = async (req, res) => {
    const resultado = await flujo.obtenerPorIdParaPDF(req.params?.id, req.user, req.query);
    if (resultado.status !== 200 || !resultado.pdf) {
      return responder(res, resultado);
    }
    return pdfDocument.renderPapeletaPdf(res, resultado.pdf);
  };

  const porEstado = async (req, res) => responder(res, await flujo.obtenerPorEstado());

  const gestionar = async (req, res) => responder(res, await flujo.gestionarEstado(req.body || {}, req.user, req));

  return {
    mostrar,
    listar,
    exportarExcel,
    ultimoNumero,
    insertar,
    editar,
    eliminar,
    restaurar,
    historial,
    reporte,
    generarPdf,
    porEstado,
    gestionar
  };
}

module.exports = { createPapeletasController };
