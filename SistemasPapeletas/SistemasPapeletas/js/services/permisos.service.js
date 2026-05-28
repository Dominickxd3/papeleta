class PermisosService {
  static datosOriginales = [];
  static datosFiltrados = [];
  static totalRegistros = 0;
  static totalPaginas = 1;
  static paginaActual = 1;
  static registrosPorPagina = 10;

  static usuario = null;
  static esPrivilegiado = false; // ADMIN o RRHH

  static setUsuario(usuario) {
    this.usuario = usuario || null;
    const rol = String(usuario?.rol || usuario?.Rol || usuario?.role || usuario?.Tipo || '').toLowerCase();
    this.esPrivilegiado = rol.includes('admin') || rol.includes('rrhh');
  }

  static _ordenarRecientesPrimero(items) {
    const arr = Array.isArray(items) ? [...items] : [];
    arr.sort((a, b) => {
      const na = Number(a?.NumeroPP ?? 0);
      const nb = Number(b?.NumeroPP ?? 0);
      if (nb !== na) return nb - na;
      const ia = Number(a?.IdPP ?? 0);
      const ib = Number(b?.IdPP ?? 0);
      return ib - ia;
    });
    return arr;
  }

  static async cargarPapeletas({
    page = 1,
    pageSize = 10,
    texto = '',
    area = '',
    mostrarEliminados = false,
    estado = 'todas'
  } = {}) {
    this.paginaActual = Math.max(1, Number(page) || 1);
    this.registrosPorPagina = Math.max(1, Number(pageSize) || 10);

    const payload = await PapeletaPermisoAPI.listar({
      page: this.paginaActual,
      pageSize: this.registrosPorPagina,
      texto,
      area,
      mostrarAnulados: !!mostrarEliminados,
      estado
    });

    const hasPagination = payload && typeof payload === 'object' && Array.isArray(payload.data);
    if (hasPagination) {
      this.datosOriginales = Array.isArray(payload.data) ? payload.data : [];
      this.datosFiltrados = this.datosOriginales;
      this.totalRegistros = Number(payload.pagination?.total || this.datosOriginales.length || 0);
      this.totalPaginas = Math.max(1, Number(payload.pagination?.totalPages || 1));
      return;
    }

    // Fallback legado: el endpoint devolvio arreglo completo
    const arr = Array.isArray(payload) ? payload : (payload?.data || payload?.datos || []);
    const ordenadas = this._ordenarRecientesPrimero(arr);
    this.datosOriginales = ordenadas;
    this.datosFiltrados = ordenadas;
    this.totalRegistros = ordenadas.length;
    this.totalPaginas = Math.max(1, Math.ceil(this.totalRegistros / this.registrosPorPagina));
  }

  static obtenerPaginados() {
    return Array.isArray(this.datosFiltrados) ? this.datosFiltrados : [];
  }

  static getTotalPaginas() {
    return this.totalPaginas;
  }

  static buscarPorId(id) {
    const nid = Number(id);
    return (this.datosOriginales || []).find((p) => Number(p.IdPP) === nid);
  }
}

window.PermisosService = PermisosService;
