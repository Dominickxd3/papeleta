// src/controllers/monitoring.controller.js
// Handlers de notificaciones y auditoría. Respuestas JSON y status HTTP idénticos al original.

const { MonitoringRepository } = require('../repositories/monitoring.repository');

function createMonitoringController(deps) {
  const repository = new MonitoringRepository(deps.getPool || (() => deps.pool), deps.sql);

  const listarMisNotificaciones = async (req, res) => {
    try {
      const soloNoLeidas = String(req.query.soloNoLeidas || '').trim() === '1';
      const recordset = await repository.listarNotificaciones(req.user?.usuario || '', soloNoLeidas);
      res.json({ success: true, data: recordset });
    } catch (error) {
      console.error('❌ Error listando notificaciones:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  const marcarLeida = async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: 'Id inválido' });

      await repository.marcarLeida(id, req.user?.usuario || '');
      res.json({ success: true, message: 'Notificación marcada como leída' });
    } catch (error) {
      console.error('❌ Error marcando notificación leída:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  const listarAuditoria = async (req, res) => {
    try {
      const top = Math.max(1, Math.min(Number(req.query.top || 200), 1000));
      const recordset = await repository.listarAuditoria(top);
      res.json({ success: true, data: recordset });
    } catch (error) {
      console.error('❌ Error listando auditoría:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  return {
    listarMisNotificaciones,
    marcarLeida,
    listarAuditoria
  };
}

module.exports = { createMonitoringController };
