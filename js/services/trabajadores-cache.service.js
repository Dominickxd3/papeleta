class TrabajadoresCacheService {
  static cache = [];
  static loaded = false;

  static _dni(v) {
    return String(v || "").replace(/\D/g, "");
  }

  static normalizar(t) {
    const dni = this._dni(t?.DOI ?? t?.DniTra ?? t?.DOIT ?? t?.dni ?? t?.DNI ?? "");
    const nombreCompleto = String(
      t?.Trabajador ??
      `${t?.NombresTra ?? t?.Nombres ?? ""} ${t?.ApellidosTra ?? t?.Apellidos ?? ""}`.trim()
    ).trim();

    return {
      id: t?.IdTra ?? t?.IdTrabajador ?? t?.id ?? t?.ID ?? null,
      dni,
      nombreCompleto,
      cargo: String(t?.Ocupacion ?? t?.CargoTra ?? t?.Cargo ?? "").trim(),
      area: String(t?.Area ?? t?.AreaTra ?? "").trim(),
      raw: t
    };
  }

  static async cargar() {
    const data = await TrabajadoresAPI.listar();
    this.cache = (data || []).map(t => this.normalizar(t));
    this.loaded = true;
    return this.cache;
  }

  static buscarPorDniPrefix(prefix, limit = 6) {
    const p = this._dni(prefix);
    if (p.length < 2) return [];
    return this.cache.filter(t => t.dni.startsWith(p)).slice(0, limit);
  }

  static buscarPorNombre(texto, limit = 6) {
    const q = String(texto || "").toLowerCase().trim();
    if (q.length < 2) return [];
    return this.cache
      .filter(t => t.nombreCompleto.toLowerCase().includes(q))
      .slice(0, limit);
  }
}

window.TrabajadoresCacheService = TrabajadoresCacheService;
