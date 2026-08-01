// src/controllers/system.controller.js
// Handlers de estadísticas, API root y health. Respuestas JSON y status HTTP idénticos al original.

const { SystemRepository } = require('../repositories/system.repository');

function createSystemController(deps) {
  const repository = new SystemRepository(deps.getPool || (() => deps.pool), deps.sql);

  const estadisticasGeneral = async (req, res) => {
    try {
      const data = await repository.estadisticasGeneral();
      res.json(data);
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  const topUsuarios = async (req, res) => {
    try {
      const recordset = await repository.topUsuarios();
      return res.json(recordset);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  };

  const apiRoot = (req, res) => {
    res.json({
      message: 'API Papeletas de Permiso - Grupo Pecuario',
      version: '2.1.0',
      endpoints: {
        auth: {
          login: 'POST /api/auth/login',
          verify: 'GET /api/auth/verify'
        },
        health: 'GET /api/health'
      }
    });
  };

  const health = (req, res) => {
    const isConnected = repository.isConnected();
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      connected: isConnected
    });
  };

  const healthDatabase = async (req, res) => {
    try {
      if (!repository.isConnected()) {
        return res.status(503).json({ status: 'ERROR', connected: false, message: 'Sin conexión activa a BD' });
      }
      await repository.ping();
      return res.json({
        status: 'OK',
        connected: true,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return res.status(503).json({
        status: 'ERROR',
        connected: false,
        message: error.message
      });
    }
  };

  const estadisticasPorArea = async (req, res) => {
    try {
      const recordset = await repository.estadisticasPorArea();
      return res.json(recordset);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  };

  const estadisticasPorMes = async (req, res) => {
    try {
      const year = Number(req.params.year);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ success: false, message: 'Año inválido' });
      }

      const recordset = await repository.estadisticasPorMes(year);
      return res.json(recordset);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  };

  return {
    estadisticasGeneral,
    topUsuarios,
    apiRoot,
    health,
    healthDatabase,
    estadisticasPorArea,
    estadisticasPorMes
  };
}

module.exports = { createSystemController };
