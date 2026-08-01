// ==========================================
// FORMULARIO PAPELETA - Controller
// Coordinador del formulario: carga, eventos y envío.
// Delega lógica de negocio en FormularioPapeletaService
// y manipulación del DOM en FormularioPapeletaView.
// Expuesto en window.FormularioPapeletaController.
// ==========================================

const FormularioPapeletaController = {
  inicializar() {
    const view = window.FormularioPapeletaView;
    const service = window.FormularioPapeletaService;

    if (!view || !service) {
      console.error('FormularioPapeletaController: dependencias no disponibles.');
      return;
    }

    this.init(view, service);
  },

  async init(view, service) {
    // Ocultar "Procesando..." si existe
    view.ocultarProcesando();

    const form = view.$('formPapeleta');
    if (!form) return;

    // Garantiza que exista un input hidden para el ID (editar)
    view.asegurarHiddenId();

    this.inicializarEventosFormulario(form, view, service);

    const params = new URLSearchParams(window.location.search);
    const idPP = params.get('id');

    // Cargar selectores base
    await UISelectorService.cargarAreas('area');
    await UISelectorService.cargarTiposPermiso('considerar');

    // Cargar trabajadores SIEMPRE (para búsqueda DNI / autocomplete / select)
    await this.cargarTrabajadoresEnFormulario(view, service);

    view.inicializarAutocompleteNombre();

    if (idPP) {
      const titulo = view.$('tituloFormulario');
      if (titulo) titulo.textContent = 'Editar Papeleta de Permiso';
      await this.cargarPapeletaExistente(form, idPP, view, service);
    } else {
      const titulo = view.$('tituloFormulario');
      if (titulo) titulo.textContent = 'Nueva Papeleta de Permiso';
      await this.inicializarPapeletaNueva(form, view, service);
    }
  },

  // ======================
  // CARGA TRABAJADORES + BÚSQUEDA POR DNI
  // ======================
  async cargarTrabajadoresEnFormulario(view, service) {
    try {
      await service.cargarTrabajadores();

      view.poblarSelectTrabajadores(service.trabajadores);

      // Buscar por DNI (botón) y (Enter)
      view.bindBuscarTrabajador((dni) => {
        this.buscarPorDniYAutocompletar(dni, view, service);
      });
    } catch (e) {
      console.error("❌ Error cargando trabajadores en formulario:", e);
    }
  },

  buscarPorDniYAutocompletar(dni, view, service) {
    const clean = FormularioFormatters.sanitizeDni(dni);
    if (clean.length !== 8) {
      alert("Ingrese un DNI de 8 dígitos");
      return;
    }

    const t = service.buscarPorDni(clean);
    if (!t) {
      alert("No se encontró trabajador con ese DNI");
      return;
    }
    view.autocompletarCamposTrabajador(t);
  },

  // ======================
  // CARGA DE DATOS (EDITAR)
  // ======================
  async cargarPapeletaExistente(form, idPP, view, service) {
    try {
      const p = await PapeletasAPI.obtenerReporte(idPP);
      if (!p) {
        alert('No se encontró la papeleta');
        return;
      }

      // Llenar campos (mismo orden que el controller original)
      view.llenarEdicion(p, idPP);

      // Seleccionar trabajador: intenta por DNI primero
      const dni = (p.DOIPP || "").toString().trim();
      if (dni) {
        const t = service.buscarPorDni(dni);
        if (t) view.autocompletarCamposTrabajador(t);
      }

      // Si vino el nombre, intenta match por nombre
      if (p.TrabajadorPP) {
        const t2 = service.buscarPorNombreExacto(p.TrabajadorPP);
        if (t2) view.autocompletarCamposTrabajador(t2);
      }
    } catch (error) {
      console.error('❌ Error al cargar papeleta:', error);
      alert('Error al cargar la papeleta: ' + error.message);
    }
  },

  // ======================
  // NUEVA PAPELETA
  // ======================
  async inicializarPapeletaNueva(form, view, service) {
    const ahora = new Date();
    const isoFecha = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;

    view.setVal("fechaPermiso", isoFecha);

    // Número de papeleta automático
    try {
      const siguiente = await service.obtenerUltimoNumero();
      view.setVal("numero", String(siguiente));
    } catch (e) {
      console.error('Error obteniendo último número:', e);
    }

    // Limpia ID hidden
    view.setVal("IdPPHidden", "");
    view.actualizarContadores();
  },

  // ======================
  // EVENTOS FORMULARIO (GUARDAR / CANCELAR)
  // ======================
  inicializarEventosFormulario(form, view, service) {
    const btnCancelar = view.$('btnCancelarPapeleta');
    const btnCerrar = view.$('btnClosePapeleta');

    [btnCancelar, btnCerrar].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener('click', (e) => {
        e.preventDefault();

        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: "CERRAR_MODAL_PAPELETA" }, "*");
          return;
        }
        window.location.href = 'permisos.html';
      });
    });

    view.setupDniMask();
    view.setupCounters();
    view.setupMotivoSoloLetras();
    view.setupSinRetorno();

    // Recalcular tiempo cuando cambian horas
    view.$("horaSalida")?.addEventListener("change", () => view.recalcularTiempo());
    view.$("horaRetorno")?.addEventListener("change", () => view.recalcularTiempo());

    form.addEventListener('submit', (e) => this.onSubmit(e, view, service));
  },

  async onSubmit(e, view, service) {
    e.preventDefault();
    console.log('👉 SUBMIT form-papeleta');

    const datos = view.recogerDatos();
    const papeleta = service.construirPayload(datos);
    const { errores, ops } = service.validarPayload(papeleta);

    // Aplica ops de campo siempre (igual que el controller original), en orden.
    ops.forEach(op => view.showFieldError(op.field, op.message));

    if (errores.length === 0) { view.clearFieldError("doi"); }

    if (errores.length > 0) {
      await view.mostrarErroresValidacion(errores);
      return;
    }

    try {
      if (papeleta.id) {
        await PapeletasAPI.editar(papeleta);
        await view.mostrarExitoGuardado({ editando: true });
      } else {
        const resp = await PapeletasAPI.insertar(papeleta);
        if (resp && resp.numero) view.setVal("numero", resp.numero);
        if (resp && resp.id) view.setVal("IdPPHidden", resp.id);
        await view.mostrarExitoGuardado({ editando: false, numero: resp?.numero });
      }

      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "PAPELETA_GUARDADA" }, "*");
        return;
      }

      window.location.href = 'permisos.html';
    } catch (error) {
      console.error(error);
      await view.mostrarErrorGuardado(error);
    }
  }
};

window.FormularioPapeletaController = FormularioPapeletaController;
