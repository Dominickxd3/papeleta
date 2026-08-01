// src/controllers/catalogos.controller.js
// Handlers de catálogos. Respuestas JSON y status HTTP idénticos al original.

const { CatalogosRepository } = require('../repositories/catalogos.repository');

function createCatalogosController(deps) {
  const repository = new CatalogosRepository(deps.getPool || (() => deps.pool));

  const listarTiposPermiso = async (req, res) => {
    try {
      const recordset = await repository.listarTiposPermiso();
      res.json(recordset);
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  const listarAreas = async (req, res) => {
    try {
      const recordset = await repository.listarAreas();
      res.json(recordset);
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  const listarEstados = async (req, res) => {
    try {
      const recordset = await repository.listarEstados();
      res.json(recordset);
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  const listarFeriados = async (req, res) => {
    try {
      const recordset = await repository.listarFeriados();
      res.json(recordset);
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  const listarConfiguracion = async (req, res) => {
    try {
      const recordset = await repository.listarConfiguracion();
      res.json(recordset);
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  const listarHorarios = async (req, res) => {
    try {
      const recordset = await repository.listarHorarios();
      res.json(recordset);
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  return {
    listarTiposPermiso,
    listarAreas,
    listarEstados,
    listarFeriados,
    listarConfiguracion,
    listarHorarios
  };
}

module.exports = { createCatalogosController };
