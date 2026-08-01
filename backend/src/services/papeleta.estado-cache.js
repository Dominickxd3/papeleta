// src/services/papeleta.estado-cache.js
// Cache de contadores por estado (GET /api/papeletas/por-estado) con TTL de 10s.
// Logica identica al original (routes/papeletas.routes.js, porEstadoCache).
// La consulta SQL vive en PapeletaRepository.porEstado(); este servicio solo
// gestiona el TTL para que el flujo lo invalide en crear/editar/anular/restaurar/gestionar.

class PapeletaEstadoCache {
  constructor() {
    this.data = null;
    this.expiresAt = 0;
  }

  // Devuelve el dato cacheado si sigue fresco, o null si caduco.
  obtener(now = Date.now()) {
    if (this.data && now < this.expiresAt) {
      return this.data;
    }
    return null;
  }

  // Guarda el dato y lo deja vigente ttlMs milisegundos (legacy: 10000).
  fijar(data, ttlMs = 10000) {
    this.data = data;
    this.expiresAt = Date.now() + ttlMs;
  }

  // Invalida el cache (equivale a porEstadoCache.expiresAt = 0 del original).
  invalidar() {
    this.expiresAt = 0;
  }
}

function createPapeletaEstadoCache() {
  return new PapeletaEstadoCache();
}

module.exports = { createPapeletaEstadoCache, PapeletaEstadoCache };
