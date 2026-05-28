class PermisosService {
  static datosOriginales = [];
  static datosFiltrados = [];

  // info usuario/rol
  static usuario = null;
  static esPrivilegiado = false; // ADMIN o RRHH

  static setUsuario(usuario) {
    this.usuario = usuario || null;

    const rol = String(
      usuario?.rol || usuario?.Rol || usuario?.role || usuario?.Tipo || ""
    ).toLowerCase();

    this.esPrivilegiado = rol.includes("admin") || rol.includes("rrhh");
  }

  static _getUserDni() {
    return String(
      this.usuario?.doi ||
      this.usuario?.DOI ||
      this.usuario?.dni ||
      this.usuario?.DNI ||
      this.usuario?.Documento ||
      ""
    ).trim();
  }

  static _getUserNombre() {
    return String(
      this.usuario?.nombre ||
      this.usuario?.Nombre ||
      this.usuario?.user ||
      this.usuario?.Usuario ||
      this.usuario?.username ||
      ""
    ).trim();
  }

  static async cargarPapeletas() {
    console.log("📥 Cargando papeletas...");

    // trae de API
    const data = await PapeletaPermisoAPI.listar();
    const arr = Array.isArray(data) ? data : (data?.data || data?.datos || []);
    this.datosOriginales = Array.isArray(arr) ? arr : [];

    // filtrar por rol (ADMIN/RRHH ven todo, otros ven solo las suyas)
    let visibles = this.datosOriginales;

    if (!this.esPrivilegiado) {
      const dni = this._getUserDni();
      const nombre = this._getUserNombre().toLowerCase();

      visibles = visibles.filter(p => {
        const pDni = String(p.DOIPP || p.DOI || "").trim();
        const pNom = String(p.TrabajadorPP || p.Trabajador || "").toLowerCase();
        return (dni && pDni === dni) || (nombre && pNom.includes(nombre));
      });
    }

    this.datosOriginales = visibles;
    this.datosFiltrados = visibles;

    console.log(`✅ ${this.datosOriginales.length} papeletas visibles para el usuario`);
  }

  static aplicarFiltros({ texto = "", area = "", mostrarEliminados = false, estado = "todas" }) {
    const q = String(texto || "").toLowerCase().trim();
    const areaSel = String(area || "").trim();

    this.datosFiltrados = (this.datosOriginales || []).filter(p => {
      // anulados: ActivoPP '2' (anulado/eliminado), activos: '1'
      const activo = String(p.ActivoPP ?? p.Activo ?? "1");
      const esAnulado = activo === "2";

      if (!mostrarEliminados && esAnulado) return false;

      // filtro area
      const pArea = String(p.AreaPP || p.Area || "").trim();
      if (areaSel && pArea !== areaSel) return false;

      // filtro por estado (tabs)
      const est = String(p.EstadoPP || p.EstadoAprobacion || "Pendiente").toLowerCase();
      if (estado === "pendientes" && !est.includes("pendiente")) return false;
      if (estado === "aprobadas" && !est.includes("aprob")) return false;
      if (estado === "rechazadas" && !est.includes("rechaz")) return false;

      // busqueda general
      if (q) {
        const blob = [
          p.NumeroPP, p.FechaPermisoPP,
          p.TrabajadorPP, p.DOIPP, p.CargoPP, p.AreaPP,
          p.MotivoPP, p.ConsiderarPP,
          p.EstadoPP, p.EstadoAprobacion
        ].map(x => String(x || "").toLowerCase()).join(" | ");

        if (!blob.includes(q)) return false;
      }

      return true;
    });
  }

  static obtenerPaginados(pagina, porPagina) {
    const p = Math.max(1, Number(pagina) || 1);
    const n = Math.max(1, Number(porPagina) || 10);
    const ini = (p - 1) * n;
    return (this.datosFiltrados || []).slice(ini, ini + n);
  }

  static getTotalPaginas(porPagina) {
    const n = Math.max(1, Number(porPagina) || 10);
    const total = (this.datosFiltrados || []).length;
    return Math.max(1, Math.ceil(total / n));
  }

  static buscarPorId(id) {
    const nid = Number(id);
    return (this.datosOriginales || []).find(p => Number(p.IdPP) === nid);
  }
}

window.PermisosService = PermisosService;
console.log("✅ PermisosService loaded + exposed");