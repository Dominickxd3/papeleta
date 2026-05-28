// /js/slides/papeleta-slide.controller.js

const PapeletaSlideController = (() => {
  let editando = null;

  const $ = (id) => document.getElementById(id);
  const dniOnly = (v) => String(v || "").replace(/\D/g, "");

  function init() {
    document.addEventListener("DOMContentLoaded", onReady);
  }

  async function onReady() {
    console.log("✅ PapeletaSlideController: iniciado");

    await safeLoadTrabajadores();
    bindEvents();
    bindAutocomplete();
  }

  async function safeLoadTrabajadores() {
    try {
      await TrabajadoresService.cargar();
      console.log("📦 Cache trabajadores listo:", TrabajadoresService.getCache().length);
    } catch (e) {
      console.error("❌ No se pudo cargar trabajadores:", e);
    }
  }

  function bindEvents() {
    $("btnNuevaPapeleta")?.addEventListener("click", abrirNuevo);
    $("btnCerrarSlide")?.addEventListener("click", cerrar);
    $("btnCancelarSlide")?.addEventListener("click", cerrar);
    $("slideOverlay")?.addEventListener("click", (e) => { if (e.target === $("slideOverlay")) cerrar(); });

    $("btnGuardarSlide")?.addEventListener("click", guardar);

    // radios considerar
    document.getElementsByName("considerar")?.forEach?.(r => {
      r.addEventListener("change", (e) => {
        const boxOtro = $("considerar_otro_box");
        if (!boxOtro) return;
        if (e.target.value === "OTRO") {
          boxOtro.style.display = "block";
          setTimeout(() => $("considerar_otro_slide")?.focus(), 80);
        } else {
          boxOtro.style.display = "none";
          $("considerar_otro_slide").value = "";
        }
      });
    });
  }

  function bindAutocomplete() {
    const inputDni = $("dni_slide");
    const inputNombre = $("trabajador_slide");
    const boxDni = $("autocomplete_dni_box");
    const boxNombre = $("autocomplete_nombre_box");

    if (!inputDni || !inputNombre) return;

    inputDni.addEventListener("input", (e) => {
      const texto = dniOnly(e.target.value);
      e.target.value = texto;

      if (texto.length < 2) return AutocompleteView.hide(boxDni);

      const results = TrabajadoresService.searchByDniPrefix(texto);
      AutocompleteView.render({
        box: boxDni,
        items: results,
        mode: "dni",
        onPick: seleccionarTrabajador
      });
    });

    inputNombre.addEventListener("input", (e) => {
      const texto = String(e.target.value || "").trim();
      if (texto.length < 2) return AutocompleteView.hide(boxNombre);

      const results = TrabajadoresService.searchByNameContains(texto);
      AutocompleteView.render({
        box: boxNombre,
        items: results,
        mode: "nombre",
        onPick: seleccionarTrabajador
      });
    });

    document.addEventListener("click", (e) => {
      if (!inputDni.contains(e.target) && !boxDni.contains(e.target)) AutocompleteView.hide(boxDni);
      if (!inputNombre.contains(e.target) && !boxNombre.contains(e.target)) AutocompleteView.hide(boxNombre);
    });
  }

  function seleccionarTrabajador(t) {
    $("dni_slide").value = t.dni;
    $("trabajador_slide").value = t.nombreCompleto;
    $("cargo_slide").value = t.cargo;
    $("area_slide").value = t.area;

    // esconder cajas
    AutocompleteView.hide($("autocomplete_dni_box"));
    AutocompleteView.hide($("autocomplete_nombre_box"));
  }

  function abrirNuevo() {
    editando = null;
    $("formSlidePapeleta")?.reset();
    $("tituloSlide").textContent = "Nueva Papeleta";

    $("fechaPermiso_slide").value = new Date().toISOString().split("T")[0];
    $("considerar_otro_box").style.display = "none";
    $("numero_slide").value = "Generando...";

    mostrar();
  }

  // expuesto para edición
  function abrirEdicion(papeleta) {
    editando = papeleta;
    $("formSlidePapeleta")?.reset();
    $("tituloSlide").textContent = `Editar Papeleta #${papeleta.NumeroPP}`;

    $("numero_slide").value = papeleta.NumeroPP ?? "";
    $("fechaPermiso_slide").value = toDateInput(papeleta.FechaPermisoPP);
    $("dni_slide").value = dniOnly(papeleta.DOIPP);
    $("trabajador_slide").value = papeleta.TrabajadorPP ?? "";
    $("cargo_slide").value = papeleta.CargoPP ?? "";
    $("area_slide").value = papeleta.AreaPP ?? "";
    $("motivo_slide").value = papeleta.MotivoPP ?? "";

    $("horaSalida_slide").value = toHHMM(papeleta.HSalidaPP);
    $("horaRetorno_slide").value = toHHMM(papeleta.HRetornoPP);
    $("tiempo_slide").value = toHHMM(papeleta.TiempoPP);
    $("observaciones_slide").value = papeleta.ObservacionesPP || "";

    // considerar
    const radios = document.getElementsByName("considerar");
    let match = false;
    radios?.forEach?.(r => {
      if (r.value === papeleta.ConsiderarPP) {
        r.checked = true;
        match = true;
      }
    });

    const boxOtro = $("considerar_otro_box");
    if (!match && papeleta.ConsiderarPP) {
      document.querySelector('input[name="considerar"][value="OTRO"]')?.click();
      boxOtro.style.display = "block";
      $("considerar_otro_slide").value = papeleta.ConsiderarPP;
    } else {
      boxOtro.style.display = "none";
    }

    mostrar();
  }

  function mostrar() {
    $("slidePapeleta")?.classList.add("show");
    $("slideOverlay")?.classList.add("show");
    document.body.classList.add("slide-open");
  }

  function cerrar() {
    $("slidePapeleta")?.classList.remove("show");
    $("slideOverlay")?.classList.remove("show");
    document.body.classList.remove("slide-open");
    AutocompleteView.hide($("autocomplete_dni_box"));
    AutocompleteView.hide($("autocomplete_nombre_box"));
  }

  async function guardar() {
    const btn = $("btnGuardarSlide");
    const getVal = (id) => ($(`${id}`)?.value || "").trim();

    // considerar
    let considerarVal = "";
    const radio = document.querySelector('input[name="considerar"]:checked');
    if (radio) {
      considerarVal = radio.value === "OTRO" ? getVal("considerar_otro_slide") : radio.value;
    }

    const doi = dniOnly(getVal("dni_slide"));
    if (!doi || doi.length !== 8 || !getVal("trabajador_slide")) {
      alert("⚠️ Por favor seleccione un trabajador válido (DNI 8 dígitos).");
      return;
    }

    const payload = {
      id: editando ? editando.IdPP : null,
      numero: getVal("numero_slide"),
      fechaPermiso: getVal("fechaPermiso_slide"),
      doi,
      trabajador: getVal("trabajador_slide"),
      cargo: getVal("cargo_slide"),
      area: getVal("area_slide"),
      motivo: getVal("motivo_slide"),
      considerar: considerarVal,
      horaSalida: getVal("horaSalida_slide"),
      horaRetorno: getVal("horaRetorno_slide"),
      tiempo: getVal("tiempo_slide"),
      observaciones: getVal("observaciones_slide"),
      activo: true
    };

    try {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

      const permiso = PapeletasService.construirPermisoDesdeSlide(payload);

      if (editando) {
        await PapeletasAPI.editar(permiso);
        alert("✅ Papeleta actualizada correctamente");
      } else {
        await PapeletasAPI.insertar(permiso);
        alert("✅ Papeleta creada correctamente");
      }

      cerrar();
      window.location.reload();
    } catch (err) {
      console.error("Error al guardar:", err);
      alert("❌ Ocurrió un error al guardar: " + (err?.message || err));
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Guardar';
    }
  }

  // helpers
  function toDateInput(iso) {
    if (!iso) return "";
    return String(iso).split("T")[0];
  }
  function toHHMM(h) {
    if (!h) return "";
    const s = String(h);
    if (s.includes("T")) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        return `${hh}:${mm}`;
      }
    }
    return s.substring(0, 5);
  }

  // API pública
  return {
    init,
    abrirEdicion
  };
})();

window.PapeletaSlideController = PapeletaSlideController;
window.abrirSlideEdicion = PapeletaSlideController.abrirEdicion; // compat
PapeletaSlideController.init();
