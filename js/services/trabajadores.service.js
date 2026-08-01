class TrabajadoresService {
  static trabajadores = [];
  static cargado = false;
  static lastLoadedAt = null;

  static async cargar(force = false) {
    if (this.cargado && !force) {
      return this.trabajadores;
    }

    const data = await this._obtenerDesdeAPI();
    this.trabajadores = Array.isArray(data) ? data.map((item) => this._normalizar(item)) : [];
    this.cargado = true;
    this.lastLoadedAt = new Date();

    return this.trabajadores;
  }

  static async recargar() {
    return this.cargar(true);
  }

  static limpiarCache() {
    this.trabajadores = [];
    this.cargado = false;
    this.lastLoadedAt = null;
  }

  static getCache() {
    return Array.isArray(this.trabajadores) ? this.trabajadores : [];
  }

  static obtenerTodos() {
    return this.getCache();
  }

  static obtenerActivos() {
    return this.getCache().filter((item) => this._esActivo(item));
  }

  static obtenerInactivos() {
    return this.getCache().filter((item) => !this._esActivo(item));
  }

  static buscarPorDni(dni) {
    const valor = this._soloTexto(dni);
    if (!valor) return null;

    return this.getCache().find((item) => item.dni === valor) || null;
  }

  static buscarPorId(id) {
    const nid = Number(id);
    if (!Number.isInteger(nid) || nid <= 0) return null;

    return this.getCache().find((item) => Number(item.id) === nid) || null;
  }

  static buscarPorTexto(texto) {
    const term = this._normalizarTextoBusqueda(texto);
    if (!term) return this.getCache();

    return this.getCache().filter((item) => {
      const bag = this._normalizarTextoBusqueda([
        item.nombreCompleto,
        item.dni,
        item.cargo,
        item.area,
        item.estado
      ].join(' '));

      return bag.includes(term);
    });
  }

  static searchByDniPrefix(texto) {
    const term = this._soloDigitos(texto);
    if (!term) return [];

    return this.getCache()
      .filter((item) => item.dni.startsWith(term))
      .slice(0, 10);
  }

  static searchByNameContains(texto) {
    const term = this._normalizarTextoBusqueda(texto);
    if (!term) return [];

    return this.getCache()
      .filter((item) => this._normalizarTextoBusqueda(item.nombreCompleto).includes(term))
      .slice(0, 10);
  }

  static esTrabajadorActivo(trabajador) {
    if (trabajador.Estado === 'Activo' || trabajador.Estado === 'ACTIVO') return true;
    if (trabajador.ESTADO === 'Activo' || trabajador.ESTADO === 'ACTIVO') return true;
    if (trabajador.Activo === '1' || trabajador.Activo === 1) return true;
    if (trabajador.ACTIVO === '1' || trabajador.ACTIVO === 1) return true;
    return false;
  }

  static validarTrabajador(t) {
    const errores = [];
    if (!t.DOI || t.DOI.length !== 8 || !/^\d{8}$/.test(t.DOI)) errores.push('El DOI/DNI debe tener exactamente 8 digitos');
    if (!t.Nombres?.trim()) errores.push('Los nombres son obligatorios');
    if (!t.Apellidos?.trim()) errores.push('Los apellidos son obligatorios');
    if (!t.Area?.trim()) errores.push('El area es obligatoria');
    return errores;
  }

  static obtenerUltimaSyncLocal(data) {
    const valores = (Array.isArray(data) ? data : [])
      .map((t) => t.FechaSync || t.FECHASYNC)
      .filter(Boolean)
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => b.getTime() - a.getTime());

    return valores[0] || null;
  }

  static filtrar(data, { busqueda = '', area = '', estado = '' } = {}) {
    let resultado = Array.isArray(data) ? [...data] : [];

    const term = normalizeText(busqueda);
    if (term) {
      const tokens = term.split(' ').filter(Boolean);
      resultado = resultado.filter((t) => {
        const haystack = buildTrabajadorSearchText(t);
        return tokens.every((tk) => haystack.includes(tk));
      });
    }

    if (area) resultado = resultado.filter((t) => (t.Area || t.AREA) === area);

    if (estado === 'activo') resultado = resultado.filter((t) => this.esTrabajadorActivo(t));
    else if (estado === 'inactivo') resultado = resultado.filter((t) => !this.esTrabajadorActivo(t));

    return resultado;
  }

  static async _obtenerDesdeAPI() {
    if (window.TrabajadoresAPI?.listarTodos) {
      return await window.TrabajadoresAPI.listarTodos();
    }

    if (window.TrabajadoresAPI?.listar) {
      return await window.TrabajadoresAPI.listar();
    }

    throw new Error('TrabajadoresAPI no esta disponible');
  }

  static _normalizar(item) {
    const id = Number(
      item?.IdTrabajador ??
      item?.id ??
      item?.ID ??
      0
    ) || 0;

    const dni = this._soloTexto(
      item?.DOI ??
      item?.dni ??
      item?.DNI ??
      item?.doi ??
      ''
    );

    const nombreCompleto = this._soloTexto(
      item?.Trabajador ??
      item?.trabajador ??
      item?.NombreCompletoT ??
      item?.nombreCompleto ??
      item?.NOMBRECOMPLETOT ??
      ''
    );

    const cargo = this._soloTexto(
      item?.Ocupacion ??
      item?.ocupacion ??
      item?.Cargo ??
      item?.cargo ??
      item?.CARGO ??
      ''
    );

    const area = this._soloTexto(
      item?.Area ??
      item?.area ??
      item?.AREA ??
      ''
    );

    const activoRaw =
      item?.Activo ??
      item?.activo ??
      item?.ACTIVO ??
      null;

    const estado = this._soloTexto(
      item?.Estado ??
      item?.estado ??
      item?.ESTADO ??
      (String(activoRaw) === '1' ? 'Activo' : 'Inactivo')
    );

    const activo = this._resolverActivo(activoRaw, estado);

    return {
      ...item,
      id,
      dni,
      nombreCompleto,
      trabajador: nombreCompleto,
      cargo,
      area,
      estado,
      activo,
      IdTrabajador: id,
      DOI: dni,
      Trabajador: nombreCompleto,
      Ocupacion: cargo,
      Area: area,
      Estado: estado,
      Activo: activo ? '1' : '0'
    };
  }

  static _resolverActivo(activoRaw, estado) {
    if (String(activoRaw) === '1') return true;
    if (String(activoRaw) === '0') return false;

    const st = this._soloTexto(estado).toUpperCase();
    return st === 'ACTIVO';
  }

  static _esActivo(item) {
    return !!item?.activo || String(item?.Activo || '0') === '1';
  }

  static _soloTexto(value) {
    return String(value || '').trim();
  }

  static _soloDigitos(value) {
    return String(value || '').replace(/\D/g, '');
  }

  static _normalizarTextoBusqueda(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }
}

window.TrabajadoresService = TrabajadoresService;
console.log('Servicio trabajadores cargado');
