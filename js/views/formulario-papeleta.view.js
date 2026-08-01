// ==========================================
// FORMULARIO PAPELETA - View
// Manipulación del DOM del formulario (sin lógica de negocio).
// Namespaced en window.FormularioPapeletaView.
// ==========================================

const FormularioPapeletaView = {
  $(id) {
    return document.getElementById(id);
  },

  // Ocultar "Procesando..." si existe y el loading overlay.
  ocultarProcesando() {
    try {
      const proc = document.querySelector(".procesando, #procesando, [data-procesando]");
      if (proc) proc.style.display = "none";

      const overlay = this.$("loadingOverlay");
      if (overlay) overlay.style.display = "none";
    } catch (_) {}
  },

  // Garantiza que exista un input hidden para el ID (editar).
  asegurarHiddenId() {
    if (!this.$("IdPPHidden")) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.id = "IdPPHidden";
      input.name = "IdPPHidden";
      document.querySelector("form")?.appendChild(input);
    }
  },

  setNumeroBadge(value) {
    const badge = this.$("numeroBadge");
    if (!badge) return;
    const v = (value ?? "").toString().trim();
    badge.textContent = v || "--";
  },

  setVal(id, value) {
    const el = this.$(id);
    if (!el) return;
    el.value = value ?? "";
    if (id === "numero") this.setNumeroBadge(el.value);
  },

  setSelectPorValueOTxt(id, valueOrText, opts = {}) {
    const sel = this.$(id);
    if (!sel) return false;
    const raw = String(valueOrText ?? "").trim();
    if (!raw) return false;

    const byValExact = [...sel.options].find(o => FormularioFormatters.normalizarTexto(o.value) === FormularioFormatters.normalizarTexto(raw));
    if (byValExact) { sel.value = byValExact.value; return true; }

    const byTxtExact = [...sel.options].find(o => FormularioFormatters.normalizarTexto(o.textContent) === FormularioFormatters.normalizarTexto(raw));
    if (byTxtExact) { sel.value = byTxtExact.value; return true; }

    // Match flexible: "ADM SISTEMAS - 2020" debe poder seleccionar "Sistemas"
    const normalizedRaw = FormularioFormatters.normalizarTexto(raw);
    const candidates = [...sel.options]
      .filter(o => String(o.value || "").trim() !== "")
      .map(o => ({
        option: o,
        nVal: FormularioFormatters.normalizarTexto(o.value),
        nTxt: FormularioFormatters.normalizarTexto(o.textContent),
        len: Math.max(FormularioFormatters.normalizarTexto(o.value).length, FormularioFormatters.normalizarTexto(o.textContent).length)
      }))
      .filter(x => x.nVal && x.nTxt);

    const containsMatch = candidates
      .filter(x =>
        normalizedRaw.includes(x.nVal) ||
        normalizedRaw.includes(x.nTxt) ||
        x.nVal.includes(normalizedRaw) ||
        x.nTxt.includes(normalizedRaw)
      )
      .sort((a, b) => b.len - a.len)[0];

    if (containsMatch) {
      sel.value = containsMatch.option.value;
      return true;
    }

    // Último fallback: crear opción temporal para no perder dato ERP.
    if (opts.allowCreate) {
      const tmpValue = raw;
      const exists = [...sel.options].some(o => FormularioFormatters.normalizarTexto(o.value) === FormularioFormatters.normalizarTexto(tmpValue));
      if (!exists) sel.add(new Option(raw, tmpValue));
      sel.value = tmpValue;
      return true;
    }

    return false;
  },

  showFieldError(fieldId, message) {
    const el = this.$(fieldId);
    const msgEl = this.$(fieldId + 'Validation');
    if (msgEl) {
      msgEl.textContent = message || '';
      msgEl.style.display = message ? 'block' : 'none';
    }
    if (el) el.classList.toggle('has-error', !!message);
  },

  clearFieldError(fieldId) {
    this.showFieldError(fieldId, '');
  },

  // ==========================================
  // MÁSCARAS / CONTADORES / VALIDACIÓN EN VIVO
  // ==========================================
  setupDniMask() {
    const input = this.$("doi");
    if (!input) return;
    input.addEventListener("input", () => {
      const v = FormularioFormatters.sanitizeDni(input.value);
      if (input.value !== v) input.value = v;
      if (!v) {
        this.clearFieldError("doi");
      } else if (v.length < 8) {
        this.showFieldError("doi", "DNI debe tener 8 dígitos.");
      } else {
        this.clearFieldError("doi");
      }
    });
  },

  setupCounters() {
    this.bindCounter("motivo", "motivoCount", FormularioFormatters.MOTIVO_MAX_LEN);
    this.bindCounter("observaciones", "obsCount", 300);
  },

  actualizarContadores() {
    const motivo = this.$("motivo");
    const motivoCount = this.$("motivoCount");
    const obs = this.$("observaciones");
    const obsCount = this.$("obsCount");

    if (motivo && motivoCount) motivoCount.textContent = String((motivo.value || "").length);
    if (obs && obsCount) obsCount.textContent = String((obs.value || "").length);
  },

  bindCounter(textareaId, counterId, max) {
    const el = this.$(textareaId);
    const counter = this.$(counterId);
    if (!el || !counter) return;
    const update = () => {
      const len = el.value.length;
      counter.textContent = String(len);
    };
    el.addEventListener("input", update);
    update();
  },

  setupMotivoSoloLetras() {
    const txt = this.$("motivo");
    if (!txt) return;

    txt.maxLength = FormularioFormatters.MOTIVO_MAX_LEN;
    txt.addEventListener("input", () => {
      const original = String(txt.value || "");
      const soloLetras = original
        .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]/g, "")
        .replace(/\s{2,}/g, " ");
      const recortado = soloLetras.slice(0, FormularioFormatters.MOTIVO_MAX_LEN);

      if (recortado !== original) {
        txt.value = recortado;
        this.showFieldError("motivo", `Solo letras y espacios. Máximo ${FormularioFormatters.MOTIVO_MAX_LEN} caracteres.`);
      } else {
        this.clearFieldError("motivo");
      }
    });
  },

  setupSinRetorno() {
    const chk = this.$("sinRetorno");
    const hr = this.$("horaRetorno");
    if (!chk || !hr) return;

    const aplicar = () => {
      if (chk.checked) {
        hr.value = "00:00";
        hr.disabled = true;
        this.clearFieldError("horaRetorno");
        if (this.$("tiempo")) this.$("tiempo").value = "";
        return;
      }
      hr.disabled = false;
      if (hr.value === "00:00") hr.value = "";
      this.recalcularTiempo();
    };

    chk.addEventListener("change", aplicar);
    hr.addEventListener("change", () => {
      if (hr.value && hr.value !== "00:00" && chk.checked) chk.checked = false;
      if (hr.value) this.clearFieldError("horaRetorno");
    });
  },

  recalcularTiempo() {
    const sinRetorno = !!this.$("sinRetorno")?.checked;
    if (sinRetorno) {
      if (this.$("tiempo")) this.$("tiempo").value = "";
      return;
    }
    const hs = (this.$("horaSalida")?.value || "").trim();
    const hr = (this.$("horaRetorno")?.value || "").trim();
    const t = FormularioFormatters.calcularTiempo(hs, hr);
    if (t && this.$("tiempo")) this.$("tiempo").value = t;
  },

  // ==========================================
  // TRABAJADOR (autocompletar campos)
  // ==========================================
  autocompletarCamposTrabajador(t) {
    const doi = this.$("doi");
    const cargo = this.$("cargo");
    const area = this.$("area");
    const elTrab = this.$("trabajador");

    if (doi) doi.value = FormularioFormatters.getDni(t) || "";
    if (cargo) cargo.value = FormularioFormatters.getCargo(t) || "";

    // Área puede venir como texto o id; intentamos setear por value.
    const areaVal = FormularioFormatters.getArea(t) || "";
    if (area) {
      this.setSelectPorValueOTxt("area", areaVal, { allowCreate: true });
    }

    if (elTrab) {
      if (elTrab.tagName === "SELECT") {
        if (elTrab.value !== String(FormularioFormatters.getIdTrabajador(t))) {
          elTrab.value = String(FormularioFormatters.getIdTrabajador(t));
        }
      } else {
        elTrab.value = FormularioFormatters.getNombreTrabajador(t) || "";
      }
    }
  },

  inicializarAutocompleteNombre() {
    const inputNombre = this.$("trabajador");
    const boxNombre = this.$("autocomplete_nombre_box");
    if (!inputNombre || !boxNombre) return;
    if (inputNombre.tagName === "SELECT") return;

    let tId = null;
    inputNombre.addEventListener("input", (e) => {
      const texto = (e.target.value || "").trim().toLowerCase();
      clearTimeout(tId);

      tId = setTimeout(() => {
        if (texto.length < 3) return this.ocultarAutocomplete(boxNombre);

        const cache = window.FormularioPapeletaService?.trabajadores || [];
        const resultados = cache.filter(t => {
          const nom = (FormularioFormatters.getNombreTrabajador(t) || "").toLowerCase();
          return nom.includes(texto);
        });

        this.renderAutocompleteNombre(boxNombre, resultados);
      }, 120);
    });

    document.addEventListener("click", (e) => {
      if (!inputNombre.contains(e.target) && !boxNombre.contains(e.target)) {
        this.ocultarAutocomplete(boxNombre);
      }
    });
  },

  renderAutocompleteNombre(box, items) {
    box.innerHTML = "";
    if (!items || items.length === 0) {
      box.classList.remove("show");
      return;
    }

    box.classList.add("show");
    items.slice(0, 8).forEach(t => {
      const item = document.createElement("div");
      item.className = "autocomplete-item";

      const nombre = FormularioFormatters.getNombreTrabajador(t) || "";
      const dni = FormularioFormatters.getDni(t) || "";
      const cargo = FormularioFormatters.getCargo(t) || "";
      const inicial = (nombre.trim().charAt(0) || "").toUpperCase();

      item.innerHTML = `
        <div class="autocomplete-item-avatar">${inicial}</div>
        <div>
          <div style="font-weight: bold;">${nombre}</div>
          <div style="font-size: 0.85rem; color: #666;">${dni ? dni + " - " : ""}${cargo}</div>
        </div>
      `;

      item.addEventListener("click", () => {
        this.autocompletarCamposTrabajador(t);
        this.ocultarAutocomplete(box);
      });

      box.appendChild(item);
    });
  },

  ocultarAutocomplete(box) {
    if (!box) return;
    box.classList.remove("show");
  },

  // Poblado de SELECT (solo si el HTML usara <select> para trabajador).
  poblarSelectTrabajadores(cache) {
    const elTrab = this.$("trabajador");
    const isSelect = elTrab && elTrab.tagName === "SELECT";
    if (!isSelect) return;

    const first = elTrab.querySelector("option[value='']") ? elTrab.querySelector("option[value='']") : null;
    elTrab.innerHTML = "";
    if (first) elTrab.appendChild(first);
    else {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Seleccione un trabajador...";
      elTrab.appendChild(opt);
    }

    (cache || []).forEach(t => {
      const opt = document.createElement("option");
      opt.value = FormularioFormatters.getIdTrabajador(t);
      opt.textContent = `${FormularioFormatters.getNombreTrabajador(t)}${FormularioFormatters.getDni(t) ? " - DNI: " + FormularioFormatters.getDni(t) : ""}`;
      elTrab.appendChild(opt);
    });

    // Eventos: al cambiar trabajador => autocompleta DNI, cargo, área
    elTrab.addEventListener("change", () => {
      const id = elTrab.value;
      const t = (cache || []).find(x => String(FormularioFormatters.getIdTrabajador(x)) === String(id));
      if (t) this.autocompletarCamposTrabajador(t);
    });

    // Búsqueda por nombre o DNI (input) => filtra el select en caliente
    this.$("doi")?.addEventListener("input", () => {
      const q = (this.$("doi").value || "").trim().toLowerCase();
      if (!q) return;

      const placeholder = elTrab.querySelector("option[value='']") ? elTrab.querySelector("option[value='']") : null;
      elTrab.innerHTML = "";
      if (placeholder) elTrab.appendChild(placeholder);

      const filtrados = (cache || []).filter(t => {
        const dni = (FormularioFormatters.getDni(t) || "").toLowerCase();
        const nom = (FormularioFormatters.getNombreTrabajador(t) || "").toLowerCase();
        return dni.includes(q) || nom.includes(q);
      });

      filtrados.slice(0, 50).forEach(t => {
        const opt = document.createElement("option");
        opt.value = FormularioFormatters.getIdTrabajador(t);
        opt.textContent = `${FormularioFormatters.getNombreTrabajador(t)}${FormularioFormatters.getDni(t) ? " - DNI: " + FormularioFormatters.getDni(t) : ""}`;
        elTrab.appendChild(opt);
      });
    });
  },

  // Buscar por DNI (botón / Enter).
  bindBuscarTrabajador(onBuscar) {
    this.$("btnBuscarDNI")?.addEventListener("click", () => {
      const dni = (this.$("doi")?.value || "").trim();
      onBuscar(dni);
    });

    this.$("doi")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const dni = (this.$("doi")?.value || "").trim();
        onBuscar(dni);
      }
    });
  },

  // ==========================================
  // LECTURA DE CAMPOS
  // ==========================================
  obtenerNombreTrabajadorSeleccionado() {
    const el = this.$("trabajador");
    if (!el) return "";
    if (el.tagName === "SELECT") {
      const opt = el.options[el.selectedIndex];
      if (!opt || !opt.textContent) return "";
      return opt.textContent.split(" - DNI:")[0].trim();
    }
    return (el.value || "").trim();
  },

  obtenerAreaSeleccionada() {
    const sel = this.$("area");
    if (!sel) return "";
    const opt = sel.options[sel.selectedIndex];
    return (opt?.value || opt?.textContent || "").trim();
  },

  recogerDatos() {
    const sinRetorno = !!this.$("sinRetorno")?.checked;

    return {
      id: (this.$("IdPPHidden")?.value || "").trim(),
      fechaPermiso: (this.$("fechaPermiso")?.value || "").trim(),
      numero: (this.$("numero")?.value || "").trim(),
      doi: FormularioFormatters.sanitizeDni(this.$("doi")?.value || ""),
      trabajador: this.obtenerNombreTrabajadorSeleccionado(),
      cargo: (this.$("cargo")?.value || "").trim(),
      area: this.obtenerAreaSeleccionada(),
      motivo: (this.$("motivo")?.value || "").trim(),
      considerar: (this.$("considerar")?.value || "").trim(),
      sinRetorno,
      horaSalida: (this.$("horaSalida")?.value || "").trim(),
      horaRetorno: (this.$("horaRetorno")?.value || "").trim(),
      tiempo: (this.$("tiempo")?.value || "").trim(),
      observaciones: (this.$("observaciones")?.value || "").trim(),
    };
  },

  // ==========================================
  // CARGA PARA EDITAR
  // ==========================================
  llenarEdicion(p, idPP) {
    // Asigna ID
    this.setVal("IdPPHidden", p.IdPP ?? idPP);

    // Mapea a IDs reales del HTML
    this.setVal("numero", p.NumeroPP ?? "");
    this.setVal("fechaPermiso", FormularioFormatters.formatearFechaInput(p.FechaPermisoPP));
    this.setVal("doi", p.DOIPP ?? "");
    this.setVal("cargo", p.CargoPP ?? "");
    this.setVal("motivo", p.MotivoPP ?? "");
    this.setVal("observaciones", p.ObservacionesPP ?? "");
    this.setConsiderarDesdeDB(p.ConsiderarPP ?? "");
    this.setVal("horaSalida", FormularioFormatters.formatearHoraParaInput(p.HSalidaPP));
    this.setVal("horaRetorno", FormularioFormatters.formatearHoraParaInput(p.HRetornoPP));
    this.setVal("tiempo", FormularioFormatters.formatearHoraParaInput(p.TiempoPP));

    const chkSinRet = this.$("sinRetorno");
    if (chkSinRet) {
      chkSinRet.checked = FormularioFormatters.esValorSinRetorno(p.HRetornoPP);
      chkSinRet.dispatchEvent(new Event("change"));
    }

    // Área (texto o value)
    if (p.AreaPP != null) this.setSelectPorValueOTxt("area", p.AreaPP, { allowCreate: true });

    this.actualizarContadores();
  },

  setConsiderarDesdeDB(valor) {
    const sel = this.$("considerar");
    if (!sel) return;

    const raw = (valor ?? "").toString().trim();
    if (!raw) return;

    const matchVac = raw.match(/^vacaciones\s*:\s*(\d{4}-\d{2}-\d{2})\s*a\s*(\d{4}-\d{2}-\d{2})$/i);
    if (matchVac) {
      sel.value = "";
      return;
    }

    const matchPref = raw.match(/^([^:]+):\s*(.+)$/);
    if (matchPref) {
      const prefijo = String(matchPref[1] || "").trim();
      if (this.setSelectPorValueOTxt("considerar", prefijo)) return;
    }

    const matched = this.setSelectPorValueOTxt("considerar", raw);
    if (matched) return;

    sel.value = "";
  },

  // ==========================================
  // MENSAJES (Swal / alert)
  // ==========================================
  async mostrarExitoGuardado({ editando = false, numero = null } = {}) {
    const titulo = editando ? "Papeleta actualizada" : "Papeleta registrada";
    const html = numero
      ? `<div style="font-size:.95rem">Correlativo asignado: <strong style="font-size:1.1rem">N° ${numero}</strong></div>`
      : `<div style="font-size:.95rem">Operación completada correctamente.</div>`;

    if (typeof Swal !== "undefined" && Swal?.fire) {
      await Swal.fire({
        icon: "success",
        title: titulo,
        html,
        confirmButtonText: "Continuar"
      });
      return;
    }

    const plain = numero ? `${titulo}. N° ${numero}` : titulo;
    alert(plain);
  },

  async mostrarErroresValidacion(errores) {
    if (typeof Swal !== "undefined" && Swal?.fire) {
      await Swal.fire({
        icon: "warning",
        title: "Revisa el formulario",
        html: `<div style="text-align:left">${errores.map(e => `• ${e}`).join("<br>")}</div>`,
        confirmButtonText: "Entendido"
      });
    } else {
      alert(errores.join('\n'));
    }
  },

  async mostrarErrorGuardado(error) {
    if (typeof Swal !== "undefined" && Swal?.fire) {
      await Swal.fire({
        icon: "error",
        title: "No se pudo guardar",
        text: error?.message || "Error inesperado",
        confirmButtonText: "Cerrar"
      });
    } else {
      alert('No se pudo guardar la papeleta: ' + error.message);
    }
  }
};

window.FormularioPapeletaView = FormularioPapeletaView;
