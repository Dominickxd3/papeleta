// js/controllers/formulario-papeleta.controller.js

document.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ formulario-papeleta.controller.js cargado');

  // ✅ Ocultar "Procesando..." si existe
  try {
    const proc = document.querySelector(".procesando, #procesando, [data-procesando]");
    if (proc) proc.style.display = "none";

    const overlay = document.getElementById("loadingOverlay");
    if (overlay) overlay.style.display = "none";
  } catch (_) {}

  const form = document.getElementById('formPapeleta');
  if (!form) return;

  // ✅ Helpers de acceso a campos por ID (tu HTML usa ids como: doi, trabajador, cargo, area, numero, etc.)
  const $ = (id) => document.getElementById(id);

  // ✅ Garantiza que exista un input hidden para el ID (editar)
  asegurarHiddenId();

  inicializarEventosFormulario(form);

  const params = new URLSearchParams(window.location.search);
  const idPP = params.get('id');
  // Cargar selectores base
  await UISelectorService.cargarAreas('area');
  await UISelectorService.cargarTiposPermiso('considerar');

  // ✅ Cargar trabajadores SIEMPRE (para búsqueda DNI / autocomplete / select)
  await cargarTrabajadoresEnFormulario();

  inicializarAutocompleteNombre();
  if (idPP) {
    const titulo = $('tituloFormulario');
    if (titulo) titulo.textContent = 'Editar Papeleta de Permiso';
    await cargarPapeletaExistente(form, idPP);
  } else {
    const titulo = $('tituloFormulario');
    if (titulo) titulo.textContent = 'Nueva Papeleta de Permiso';
    await inicializarPapeletaNueva(form);
  }

});

const MOTIVO_MAX_LEN = 120;
const SOLO_LETRAS_REGEX = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$/;

// ======================
// ✅ CARGA TRABAJADORES + AUTOCOMPLETE
// ======================
let __TRABAJADORES_CACHE__ = [];

async function cargarTrabajadoresEnFormulario() {
  try {
    // Si existe TrabajadoresService úsalo, sino usa API directo
    if (window.TrabajadoresService?.cargar) {
      await window.TrabajadoresService.cargar();
      __TRABAJADORES_CACHE__ = window.TrabajadoresService.trabajadores || window.TrabajadoresService.datos || [];
    } else if (window.TrabajadoresAPI?.listar) {
      __TRABAJADORES_CACHE__ = await window.TrabajadoresAPI.listar();
    }

    // Normaliza array si vino como {status,data}
    if (!Array.isArray(__TRABAJADORES_CACHE__)) {
    if (Array.isArray(__TRABAJADORES_CACHE__?.data)) __TRABAJADORES_CACHE__ = __TRABAJADORES_CACHE__.data;
    else if (Array.isArray(__TRABAJADORES_CACHE__?.data?.data)) __TRABAJADORES_CACHE__ = __TRABAJADORES_CACHE__.data.data;
    else if (Array.isArray(__TRABAJADORES_CACHE__?.data?.rows)) __TRABAJADORES_CACHE__ = __TRABAJADORES_CACHE__.data.rows;
    else if (Array.isArray(__TRABAJADORES_CACHE__?.rows)) __TRABAJADORES_CACHE__ = __TRABAJADORES_CACHE__.rows;
}

    if (!Array.isArray(__TRABAJADORES_CACHE__)) __TRABAJADORES_CACHE__ = [];
    console.log(`✅ Trabajadores disponibles en formulario: ${__TRABAJADORES_CACHE__.length}`);

    const elTrab = document.getElementById("trabajador");
    const isSelect = elTrab && elTrab.tagName === "SELECT";

    if (isSelect) {
      // Poblar select trabajador
      const first = elTrab.querySelector("option[value='']") ? elTrab.querySelector("option[value='']") : null;
      elTrab.innerHTML = "";
      if (first) elTrab.appendChild(first);
      else {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "Seleccione un trabajador...";
        elTrab.appendChild(opt);
      }

      __TRABAJADORES_CACHE__.forEach(t => {
        const opt = document.createElement("option");
        opt.value = getIdTrabajador(t);
        opt.textContent = `${getNombreTrabajador(t)}${getDni(t) ? " - DNI: " + getDni(t) : ""}`;
        elTrab.appendChild(opt);
      });

      // Eventos: al cambiar trabajador => autocompleta DNI, cargo, área
      elTrab.addEventListener("change", () => {
        const id = elTrab.value;
        const t = __TRABAJADORES_CACHE__.find(x => String(getIdTrabajador(x)) === String(id));
        if (t) autocompletarCamposTrabajador(t);
      });

      // Búsqueda por nombre o DNI (input) => filtra el select en caliente
      document.getElementById("doi")?.addEventListener("input", () => {
        const q = (document.getElementById("doi").value || "").trim().toLowerCase();
        if (!q) return;

        const placeholder = elTrab.querySelector("option[value='']") ? elTrab.querySelector("option[value='']") : null;
        elTrab.innerHTML = "";
        if (placeholder) elTrab.appendChild(placeholder);

        const filtrados = __TRABAJADORES_CACHE__.filter(t => {
          const dni = (getDni(t) || "").toLowerCase();
          const nom = (getNombreTrabajador(t) || "").toLowerCase();
          return dni.includes(q) || nom.includes(q);
        });

        filtrados.slice(0, 50).forEach(t => {
          const opt = document.createElement("option");
          opt.value = getIdTrabajador(t);
          opt.textContent = `${getNombreTrabajador(t)}${getDni(t) ? " - DNI: " + getDni(t) : ""}`;
          elTrab.appendChild(opt);
        });
      });
    }

    // Buscar por DNI (botón)
    document.getElementById("btnBuscarDNI")?.addEventListener("click", () => {
      const dni = (document.getElementById("doi")?.value || "").trim();
      buscarPorDniYAutocompletar(dni);
    });

    // Buscar por DNI (Enter)
    document.getElementById("doi")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const dni = (document.getElementById("doi")?.value || "").trim();
        buscarPorDniYAutocompletar(dni);
      }
    });

  } catch (e) {
    console.error("❌ Error cargando trabajadores en formulario:", e);
  }
}

function buscarPorDniYAutocompletar(dni) {
  const clean = sanitizeDni(dni);
  if (clean.length !== 8) {
    alert("Ingrese un DNI de 8 dígitos");
    return;
  }

  const t = __TRABAJADORES_CACHE__.find(x => String(getDni(x)) === String(clean));
  if (!t) {
    alert("No se encontró trabajador con ese DNI");
    return;
  }
  autocompletarCamposTrabajador(t);
}

function autocompletarCamposTrabajador(t) {
  const doi = document.getElementById("doi");
  const cargo = document.getElementById("cargo");
  const area = document.getElementById("area");
  const elTrab = document.getElementById("trabajador");

  if (doi) doi.value = getDni(t) || "";
  if (cargo) cargo.value = getCargo(t) || "";

  // Área puede venir como texto o id; intentamos setear por value.
  const areaVal = getArea(t) || "";
  if (area) {
    setSelectPorValueOTxt("area", areaVal, { allowCreate: true });
  }

  if (elTrab) {
    if (elTrab.tagName === "SELECT") {
      if (elTrab.value !== String(getIdTrabajador(t))) {
        elTrab.value = String(getIdTrabajador(t));
      }
    } else {
      elTrab.value = getNombreTrabajador(t) || "";
    }
  }
}

function inicializarAutocompleteNombre() {
  const inputNombre = document.getElementById("trabajador");
  const boxNombre = document.getElementById("autocomplete_nombre_box");
  if (!inputNombre || !boxNombre) return;
  if (inputNombre.tagName === "SELECT") return;

  let tId = null;
  inputNombre.addEventListener("input", (e) => {
    const texto = (e.target.value || "").trim().toLowerCase();
    clearTimeout(tId);

    tId = setTimeout(() => {
      if (texto.length < 3) return ocultarAutocomplete(boxNombre);

      const resultados = __TRABAJADORES_CACHE__.filter(t => {
        const nom = (getNombreTrabajador(t) || "").toLowerCase();
        return nom.includes(texto);
      });

      renderAutocompleteNombre(boxNombre, resultados);
    }, 120);
  });

  document.addEventListener("click", (e) => {
    if (!inputNombre.contains(e.target) && !boxNombre.contains(e.target)) {
      ocultarAutocomplete(boxNombre);
    }
  });
}

function renderAutocompleteNombre(box, items) {
  box.innerHTML = "";
  if (!items || items.length === 0) {
    box.classList.remove("show");
    return;
  }

  box.classList.add("show");
  items.slice(0, 8).forEach(t => {
    const item = document.createElement("div");
    item.className = "autocomplete-item";

    const nombre = getNombreTrabajador(t) || "";
    const dni = getDni(t) || "";
    const cargo = getCargo(t) || "";
    const inicial = (nombre.trim().charAt(0) || "").toUpperCase();

    item.innerHTML = `
      <div class="autocomplete-item-avatar">${inicial}</div>
      <div>
        <div style="font-weight: bold;">${nombre}</div>
        <div style="font-size: 0.85rem; color: #666;">${dni ? dni + " - " : ""}${cargo}</div>
      </div>
    `;

    item.addEventListener("click", () => {
      autocompletarCamposTrabajador(t);
      ocultarAutocomplete(box);
    });

    box.appendChild(item);
  });
}

function ocultarAutocomplete(box) {
  if (!box) return;
  box.classList.remove("show");
}

// ======================
// ✅ CARGA DE DATOS (EDITAR)
// ======================
async function cargarPapeletaExistente(form, idPP) {
  try {
    const p = await PapeletasAPI.obtenerReporte(idPP);
    if (!p) {
      alert('No se encontró la papeleta');
      return;
    }

    // ✅ Asigna ID
    setVal("IdPPHidden", p.IdPP ?? idPP);

    // ✅ Mapea a IDs reales de tu HTML
    setVal("numero", p.NumeroPP ?? "");
    setVal("fechaPermiso", formatearFechaInput(p.FechaPermisoPP));
    setVal("doi", p.DOIPP ?? "");
    setVal("cargo", p.CargoPP ?? "");
    setVal("motivo", p.MotivoPP ?? "");
    setVal("observaciones", p.ObservacionesPP ?? "");
    setConsiderarDesdeDB(p.ConsiderarPP ?? "");
    setVal("horaSalida", formatearHoraParaInput(p.HSalidaPP));
    setVal("horaRetorno", formatearHoraParaInput(p.HRetornoPP));
    setVal("tiempo", formatearHoraParaInput(p.TiempoPP));
    const chkSinRet = document.getElementById("sinRetorno");
    if (chkSinRet) {
      chkSinRet.checked = esValorSinRetorno(p.HRetornoPP);
      chkSinRet.dispatchEvent(new Event("change"));
    }

    // Área (texto o value)
    if (p.AreaPP != null) setSelectPorValueOTxt("area", p.AreaPP, { allowCreate: true });

    // ✅ Seleccionar trabajador: intenta por DNI primero
    const dni = (p.DOIPP || "").toString().trim();
    if (dni) {
      const t = __TRABAJADORES_CACHE__.find(x => String(getDni(x)) === String(dni));
      if (t) {
        autocompletarCamposTrabajador(t);
      }
    }

    // Si vino el nombre, intenta match por nombre
    if (p.TrabajadorPP) {
      const t2 = __TRABAJADORES_CACHE__.find(x => (getNombreTrabajador(x) || "").trim() === (p.TrabajadorPP || "").trim());
      if (t2) autocompletarCamposTrabajador(t2);
    }

    actualizarContadores();

  } catch (error) {
    console.error('❌ Error al cargar papeleta:', error);
    alert('Error al cargar la papeleta: ' + error.message);
  }
}

// ======================
// ✅ NUEVA PAPELETA
// ======================
async function inicializarPapeletaNueva(form) {
  const ahora = new Date();
  const isoFecha = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;

  // Tus IDs reales
  setVal("fechaPermiso", isoFecha);

  // Número de papeleta automático (arregla el [object Object]1)
  try {
    const raw = await PapeletasAPI.obtenerUltimoNumero();

    // Puede venir: number | {ultimoNumero: n} | {status:"OK", data:n} | {status:"OK", data:{ultimoNumero:n}}
    let ultimo = extraerNumeroUltimo(raw);

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

    const siguiente = (Number(ultimo) || 0) + 1;
    setVal("numero", String(siguiente));
  } catch (e) {
    console.error('Error obteniendo último número:', e);
  }

  // Limpia ID hidden
  setVal("IdPPHidden", "");
  actualizarContadores();
}

// ======================
// ✅ EVENTOS FORMULARIO (GUARDAR / CANCELAR)
// ======================
function inicializarEventosFormulario(form) {
  const btnCancelar = document.getElementById('btnCancelarPapeleta');
  const btnCerrar = document.getElementById('btnClosePapeleta');

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

  setupDniMask();
  setupCounters();
  setupMotivoSoloLetras();
  setupSinRetorno();

  // Recalcular tiempo cuando cambian horas
  document.getElementById("horaSalida")?.addEventListener("change", recalcularTiempo);
  document.getElementById("horaRetorno")?.addEventListener("change", recalcularTiempo);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log('👉 SUBMIT form-papeleta');

    const papeleta = construirPayloadDesdeFormulario();
    const errores = validarPayload(papeleta); if (errores.length === 0) { clearFieldError("doi"); }

    if (errores.length > 0) {
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
      return;
    }

    try {
      if (papeleta.id) {
        await PapeletasAPI.editar(papeleta);
        await mostrarExitoGuardado({ editando: true });
      } else {
        const resp = await PapeletasAPI.insertar(papeleta);
        if (resp && resp.numero) setVal("numero", resp.numero);
        if (resp && resp.id) setVal("IdPPHidden", resp.id);
        await mostrarExitoGuardado({ editando: false, numero: resp?.numero });
      }

      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "PAPELETA_GUARDADA" }, "*");
        return;
      }

      window.location.href = 'permisos.html';

    } catch (error) {
      console.error(error);
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
  });
}

// ======================
// ✅ PAYLOAD + VALIDACIÓN
// ======================
function construirPayloadDesdeFormulario() {
  const id = (document.getElementById("IdPPHidden")?.value || "").trim();
  const doi = sanitizeDni(document.getElementById("doi")?.value || "");

  const considerarSel = (document.getElementById("considerar")?.value || "").trim();
  const considerarFinal = considerarSel;

  const sinRetorno = !!document.getElementById("sinRetorno")?.checked;

  const payload = {
    id: id ? Number(id) : null,
    fechaPermiso: (document.getElementById("fechaPermiso")?.value || "").trim(),
    numero: (document.getElementById("numero")?.value || "").trim(),
    doi,
    trabajador: obtenerNombreTrabajadorSeleccionado(),
    cargo: (document.getElementById("cargo")?.value || "").trim(),
    area: obtenerAreaSeleccionada(),
    motivo: (document.getElementById("motivo")?.value || "").trim(),
    considerar: considerarFinal,
    horaSalida: (document.getElementById("horaSalida")?.value || "").trim(),
    horaRetorno: sinRetorno ? "00:00" : (document.getElementById("horaRetorno")?.value || "").trim(),
    tiempo: (document.getElementById("tiempo")?.value || "").trim(),
    observaciones: (document.getElementById("observaciones")?.value || "").trim(),
    vacacionesDesde: "",
    vacacionesHasta: "",
  };

  // si no hay tiempo, intenta calcular
  if (sinRetorno) {
    payload.tiempo = "";
  } else if (!payload.tiempo) {
    payload.tiempo = calcularTiempo(payload.horaSalida, payload.horaRetorno) || "";
  }

  return payload;
}

function validarPayload(p) {
  const errs = [];
  if (!p.numero) errs.push("Número de papeleta es obligatorio.");
  if (!p.fechaPermiso) errs.push("Fecha del permiso es obligatoria.");
  if (!p.doi) { errs.push("DNI es obligatorio."); showFieldError("doi", "DNI es obligatorio."); }
  if (p.doi && p.doi.length !== 8) { errs.push("DNI debe tener 8 dígitos."); showFieldError("doi", "DNI debe tener 8 dígitos."); }
  if (!p.trabajador) errs.push("Trabajador es obligatorio.");
  if (!p.area) errs.push("Área es obligatoria.");

  if (!p.horaSalida) errs.push("Hora de salida es obligatoria.");
  if (!p.horaRetorno) {
    errs.push("Debe indicar una hora de retorno o seleccionar 'Sin retorno'.");
    showFieldError("horaRetorno", "Requerido");
  } else {
    clearFieldError("horaRetorno");
  }

  if (!p.motivo) errs.push("Motivo es obligatorio.");
  if (p.motivo && p.motivo.length > MOTIVO_MAX_LEN) {
    errs.push(`Motivo debe tener máximo ${MOTIVO_MAX_LEN} caracteres.`);
    showFieldError("motivo", `Máximo ${MOTIVO_MAX_LEN} caracteres.`);
  }
  if (p.motivo && !SOLO_LETRAS_REGEX.test(p.motivo)) {
    errs.push("Motivo solo debe contener letras y espacios.");
    showFieldError("motivo", "Use solo letras y espacios.");
  }

  return errs;
}

// ======================
// ✅ TIEMPO TOTAL
// ======================
function recalcularTiempo() {
  const sinRetorno = !!document.getElementById("sinRetorno")?.checked;
  if (sinRetorno) {
    if (document.getElementById("tiempo")) document.getElementById("tiempo").value = "";
    return;
  }
  const hs = (document.getElementById("horaSalida")?.value || "").trim();
  const hr = (document.getElementById("horaRetorno")?.value || "").trim();
  const t = calcularTiempo(hs, hr);
  if (t && document.getElementById("tiempo")) document.getElementById("tiempo").value = t;
}

function calcularTiempo(hs, hr) {
  if (!hs || !hr) return ""; // si no retorna el mismo día, puede quedar vacío
  const [h1, m1] = hs.split(":").map(Number);
  const [h2, m2] = hr.split(":").map(Number);
  if ([h1,m1,h2,m2].some(n => Number.isNaN(n))) return "";

  const a = h1 * 60 + m1;
  const b = h2 * 60 + m2;
  if (b <= a) return ""; // inválido o retorno al día siguiente (no manejado)

  const diff = b - a;
  const hh = String(Math.floor(diff / 60)).padStart(2, "0");
  const mm = String(diff % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

// ======================
// ✅ HELPERS DOM + NORMALIZACIÓN
// ======================
function setNumeroBadge(value) {
  const badge = document.getElementById("numeroBadge");
  if (!badge) return;
  const v = (value ?? "").toString().trim();
  badge.textContent = v || "--";
}

async function mostrarExitoGuardado({ editando = false, numero = null } = {}) {
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
}

function setVal(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value ?? "";
  if (id === "numero") setNumeroBadge(el.value);
}
function setSelectPorValueOTxt(id, valueOrText, opts = {}) {
  const sel = document.getElementById(id);
  if (!sel) return false;
  const raw = String(valueOrText ?? "").trim();
  if (!raw) return false;

  const byValExact = [...sel.options].find(o => normalizarTexto(o.value) === normalizarTexto(raw));
  if (byValExact) { sel.value = byValExact.value; return true; }

  const byTxtExact = [...sel.options].find(o => normalizarTexto(o.textContent) === normalizarTexto(raw));
  if (byTxtExact) { sel.value = byTxtExact.value; return true; }

  // Match flexible: "ADM SISTEMAS - 2020" debe poder seleccionar "Sistemas"
  const normalizedRaw = normalizarTexto(raw);
  const candidates = [...sel.options]
    .filter(o => String(o.value || "").trim() !== "")
    .map(o => ({
      option: o,
      nVal: normalizarTexto(o.value),
      nTxt: normalizarTexto(o.textContent),
      len: Math.max(normalizarTexto(o.value).length, normalizarTexto(o.textContent).length)
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
    const exists = [...sel.options].some(o => normalizarTexto(o.value) === normalizarTexto(tmpValue));
    if (!exists) sel.add(new Option(raw, tmpValue));
    sel.value = tmpValue;
    return true;
  }

  return false;
}

function normalizarTexto(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}
function sanitizeDni(v) {
  return String(v || "").replace(/\D/g, "").slice(0, 8);
}

function setupDniMask() {
  const input = document.getElementById("doi");
  if (!input) return;
  input.addEventListener("input", () => {
    const v = sanitizeDni(input.value);
    if (input.value !== v) input.value = v;
    if (!v) {
      clearFieldError("doi");
    } else if (v.length < 8) {
      showFieldError("doi", "DNI debe tener 8 dígitos.");
    } else {
      clearFieldError("doi");
    }
  });
}

function setupCounters() {
  bindCounter("motivo", "motivoCount", MOTIVO_MAX_LEN);
  bindCounter("observaciones", "obsCount", 300);
}

function actualizarContadores() {
  const motivo = document.getElementById("motivo");
  const motivoCount = document.getElementById("motivoCount");
  const obs = document.getElementById("observaciones");
  const obsCount = document.getElementById("obsCount");

  if (motivo && motivoCount) motivoCount.textContent = String((motivo.value || "").length);
  if (obs && obsCount) obsCount.textContent = String((obs.value || "").length);
}

function bindCounter(textareaId, counterId, max) {
  const el = document.getElementById(textareaId);
  const counter = document.getElementById(counterId);
  if (!el || !counter) return;
  const update = () => {
    const len = el.value.length;
    counter.textContent = String(len);
  };
  el.addEventListener("input", update);
  update();
}

function setConsiderarDesdeDB(valor) {
  const sel = document.getElementById("considerar");
  if (!sel) return;

  const raw = (valor ?? "").toString().trim();
  if (!raw) {
    return;
  }

  const matchVac = raw.match(/^vacaciones\s*:\s*(\d{4}-\d{2}-\d{2})\s*a\s*(\d{4}-\d{2}-\d{2})$/i);
  if (matchVac) {
    sel.value = "";
    return;
  }

  const matchPref = raw.match(/^([^:]+):\s*(.+)$/);
  if (matchPref) {
    const prefijo = String(matchPref[1] || "").trim();
    if (setSelectPorValueOTxt("considerar", prefijo)) return;
  }

  const matched = setSelectPorValueOTxt("considerar", raw);
  if (matched) return;

  sel.value = "";
}

function asegurarHiddenId() {
  // agrega hidden para que EDITAR funcione siempre
  if (!document.getElementById("IdPPHidden")) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.id = "IdPPHidden";
    input.name = "IdPPHidden";
    document.querySelector("form")?.appendChild(input);
  }
}

function extraerNumeroUltimo(raw) {
  if (typeof raw === "number") return raw;

  // {ultimoNumero:n}
  if (raw && typeof raw === "object" && raw.ultimoNumero != null) return raw.ultimoNumero;

  // {status:"OK", data:n}
  if (raw && typeof raw === "object" && typeof raw.data === "number") return raw.data;

  // {status:"OK", data:{ultimoNumero:n}}
  if (raw && typeof raw === "object" && raw.data && typeof raw.data === "object" && raw.data.ultimoNumero != null) {
    return raw.data.ultimoNumero;
  }

  return 0;
}

function formatearFechaInput(fechaISO) {
  if (!fechaISO) return '';
  const raw = String(fechaISO).trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(fechaISO);
  if (isNaN(d.getTime())) return fechaISO;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatearHoraParaInput(h) {
  if (!h) return "";
  // acepta "13:00:00" => "13:00"
  const s = String(h);
  const m = s.match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : s;
}

function obtenerNombreTrabajadorSeleccionado() {
  const el = document.getElementById("trabajador");
  if (!el) return "";
  if (el.tagName === "SELECT") {
    const opt = el.options[el.selectedIndex];
    if (!opt || !opt.textContent) return "";
    return opt.textContent.split(" - DNI:")[0].trim();
  }
  return (el.value || "").trim();
}

function setupMotivoSoloLetras() {
  const txt = document.getElementById("motivo");
  if (!txt) return;

  txt.maxLength = MOTIVO_MAX_LEN;
  txt.addEventListener("input", () => {
    const original = String(txt.value || "");
    const soloLetras = original
      .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]/g, "")
      .replace(/\s{2,}/g, " ");
    const recortado = soloLetras.slice(0, MOTIVO_MAX_LEN);

    if (recortado !== original) {
      txt.value = recortado;
      showFieldError("motivo", `Solo letras y espacios. Máximo ${MOTIVO_MAX_LEN} caracteres.`);
    } else {
      clearFieldError("motivo");
    }
  });
}

function esValorSinRetorno(raw) {
  const s = String(raw || "").trim();
  if (!s) return false;
  return s === "00:00" || s === "00:00:00" || /T00:00(?::00)?/.test(s);
}

function setupSinRetorno() {
  const chk = document.getElementById("sinRetorno");
  const hr = document.getElementById("horaRetorno");
  if (!chk || !hr) return;

  const aplicar = () => {
    if (chk.checked) {
      hr.value = "00:00";
      hr.disabled = true;
      clearFieldError("horaRetorno");
      if (document.getElementById("tiempo")) document.getElementById("tiempo").value = "";
      return;
    }
    hr.disabled = false;
    if (hr.value === "00:00") hr.value = "";
    recalcularTiempo();
  };

  chk.addEventListener("change", aplicar);
  hr.addEventListener("change", () => {
    if (hr.value && hr.value !== "00:00" && chk.checked) chk.checked = false;
    if (hr.value) clearFieldError("horaRetorno");
  });
}

function obtenerAreaSeleccionada() {
  const sel = document.getElementById("area");
  if (!sel) return "";
  // si tu API usa texto, devolvemos texto; si usa value, devuelve value
  const opt = sel.options[sel.selectedIndex];
  return (opt?.value || opt?.textContent || "").trim();
}

// Normalización trabajadores (por si los nombres cambian)
function getIdTrabajador(t) {
  return t?.IdT ?? t?.IdTra ?? t?.IdTrabajador ?? t?.Id ?? t?.id ?? "";
}
function getDni(t) {
  return t?.DOI ?? t?.DOIT ?? t?.DniTra ?? t?.DNI ?? t?.dni ?? t?.Doi ?? t?.Dni ?? "";
}
function getNombreTrabajador(t) {
  return t?.NombreCompletoT ?? t?.NombreCompleto ?? t?.TrabajadorT ?? t?.Trabajador ?? t?.NombreT ?? t?.nombre ?? t?.Nombres ?? (() => {
    const n = `${t?.NombresTra ?? t?.Nombres ?? ""} ${t?.ApellidosTra ?? t?.Apellidos ?? ""}`.trim();
    return n || "";
  })();
}
function getCargo(t) {
  return t?.CargoT ?? t?.CargoTra ?? t?.Ocupacion ?? t?.cargo ?? t?.Cargo ?? "";
}
function getArea(t) {
  return t?.AreaT ?? t?.AreaTra ?? t?.area ?? t?.Area ?? "";
}// iframe class
document.addEventListener("DOMContentLoaded", () => {
  if (window.self !== window.top) {
    document.documentElement.classList.add("is-iframe");
  }
});

function showFieldError(fieldId, message) {
  const el = document.getElementById(fieldId);
  const msgEl = document.getElementById(fieldId + 'Validation');
  if (msgEl) {
    msgEl.textContent = message || '';
    msgEl.style.display = message ? 'block' : 'none';
  }
  if (el) el.classList.toggle('has-error', !!message);
}

function clearFieldError(fieldId) {
  showFieldError(fieldId, '');
}
