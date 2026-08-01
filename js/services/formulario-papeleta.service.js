// ==========================================
// FORMULARIO PAPELETA - Service
// Lógica de negocio del formulario (sin manipular el DOM):
// cache de trabajadores, búsquedas, numeración, payload y validación.
// Namespaced en window.FormularioPapeletaService.
// ==========================================

const FormularioPapeletaService = {
  trabajadores: [],

  // Carga la cache de trabajadores (TrabajadoresService o API directa)
  // y normaliza el array. Lanza error si la carga falla.
  async cargarTrabajadores() {
    if (window.TrabajadoresService?.cargar) {
      await window.TrabajadoresService.cargar();
      this.trabajadores = window.TrabajadoresService.trabajadores || window.TrabajadoresService.datos || [];
    } else if (window.TrabajadoresAPI?.listar) {
      this.trabajadores = await window.TrabajadoresAPI.listar();
    }

    // Normaliza array si vino como {status,data}
    if (!Array.isArray(this.trabajadores)) {
      if (Array.isArray(this.trabajadores?.data)) this.trabajadores = this.trabajadores.data;
      else if (Array.isArray(this.trabajadores?.data?.data)) this.trabajadores = this.trabajadores.data.data;
      else if (Array.isArray(this.trabajadores?.data?.rows)) this.trabajadores = this.trabajadores.data.rows;
      else if (Array.isArray(this.trabajadores?.rows)) this.trabajadores = this.trabajadores.rows;
    }

    if (!Array.isArray(this.trabajadores)) this.trabajadores = [];
    console.log(`✅ Trabajadores disponibles en formulario: ${this.trabajadores.length}`);
    return this.trabajadores;
  },

  getTrabajadores() {
    return this.trabajadores;
  },

  buscarPorDni(dni) {
    const clean = String(dni ?? "").trim();
    return this.trabajadores.find(x => String(FormularioFormatters.getDni(x)) === String(clean)) || null;
  },

  buscarPorNombreExacto(nombre) {
    const q = String(nombre ?? "").trim();
    return this.trabajadores.find(x => (FormularioFormatters.getNombreTrabajador(x) || "").trim() === q) || null;
  },

  // Devuelve el siguiente número de papeleta (último + 1).
  async obtenerUltimoNumero() {
    const raw = await PapeletasAPI.obtenerUltimoNumero();
    let ultimo = FormularioFormatters.extraerNumeroUltimo(raw);

    // Fallback: si el backend no devuelve, intenta calcular desde listado
    if (!ultimo && PapeletasAPI.listar) {
      try {
        const listado = await PapeletasAPI.listar();
        const arr = Array.isArray(listado?.data) ? listado.data : listado;
        if (Array.isArray(arr) && arr.length) {
          ultimo = Math.max(...arr.map(p => Number(p?.NumeroPP ?? p?.numero ?? p?.Numero ?? 0) || 0));
        }
      } catch (_) {}
    }

    return (Number(ultimo) || 0) + 1;
  },

  // Construye el payload de API a partir de los datos crudos del formulario.
  construirPayload(d) {
    const sinRetorno = !!d.sinRetorno;

    const payload = {
      id: d.id ? Number(d.id) : null,
      fechaPermiso: d.fechaPermiso,
      numero: d.numero,
      doi: d.doi,
      trabajador: d.trabajador,
      cargo: d.cargo,
      area: d.area,
      motivo: d.motivo,
      considerar: d.considerar,
      horaSalida: d.horaSalida,
      horaRetorno: sinRetorno ? "00:00" : d.horaRetorno,
      tiempo: d.tiempo,
      observaciones: d.observaciones,
      vacacionesDesde: "",
      vacacionesHasta: "",
    };

    // si no hay tiempo, intenta calcular
    if (sinRetorno) {
      payload.tiempo = "";
    } else if (!payload.tiempo) {
      payload.tiempo = FormularioFormatters.calcularTiempo(payload.horaSalida, payload.horaRetorno) || "";
    }

    return payload;
  },

  // Devuelve la lista de errores (strings) y las operaciones de campo
  // (ops: [{field, message}]) que la vista debe aplicar en orden.
  validarPayload(p) {
    const errs = [];
    const ops = [];

    if (!p.numero) errs.push("Número de papeleta es obligatorio.");
    if (!p.fechaPermiso) errs.push("Fecha del permiso es obligatoria.");

    if (!p.doi) { errs.push("DNI es obligatorio."); ops.push({ field: "doi", message: "DNI es obligatorio." }); }
    if (p.doi && p.doi.length !== 8) { errs.push("DNI debe tener 8 dígitos."); ops.push({ field: "doi", message: "DNI debe tener 8 dígitos." }); }

    if (!p.trabajador) errs.push("Trabajador es obligatorio.");
    if (!p.area) errs.push("Área es obligatoria.");

    if (!p.horaSalida) errs.push("Hora de salida es obligatoria.");
    if (!p.horaRetorno) {
      errs.push("Debe indicar una hora de retorno o seleccionar 'Sin retorno'.");
      ops.push({ field: "horaRetorno", message: "Requerido" });
    } else {
      ops.push({ field: "horaRetorno", message: "" });
    }

    if (!p.motivo) errs.push("Motivo es obligatorio.");
    if (p.motivo && p.motivo.length > FormularioFormatters.MOTIVO_MAX_LEN) {
      errs.push(`Motivo debe tener máximo ${FormularioFormatters.MOTIVO_MAX_LEN} caracteres.`);
      ops.push({ field: "motivo", message: `Máximo ${FormularioFormatters.MOTIVO_MAX_LEN} caracteres.` });
    }
    if (p.motivo && !FormularioFormatters.SOLO_LETRAS_REGEX.test(p.motivo)) {
      errs.push("Motivo solo debe contener letras y espacios.");
      ops.push({ field: "motivo", message: "Use solo letras y espacios." });
    }

    return { errores: errs, ops };
  }
};

window.FormularioPapeletaService = FormularioPapeletaService;
