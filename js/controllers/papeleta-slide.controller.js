let slidePapeletaEditando = null; // null = creando

document.addEventListener("DOMContentLoaded", async () => {
  console.log("✅ Slide Controller: Iniciado");
  await initTrabajadores();
  setupSlideEvents();
  setupAutocomplete();
});

async function initTrabajadores() {
  try {
    await TrabajadoresCacheService.cargar();
    console.log("📦 Cache listo:", TrabajadoresCacheService.cache.length);
  } catch (e) {
    console.error("❌ Error cargando trabajadores:", e);
  }
}

function setupAutocomplete() {
  const inputDni = document.getElementById("dni_slide");
  const inputNombre = document.getElementById("trabajador_slide");
  const boxDni = document.getElementById("autocomplete_dni_box");
  const boxNombre = document.getElementById("autocomplete_nombre_box");

  if (!inputDni || !inputNombre) return;

  // DNI
  inputDni.addEventListener("input", (e) => {
    const texto = String(e.target.value || "").replace(/\D/g, ""); // ✅ solo números
    e.target.value = texto;

    limpiarSiVacio(texto);

    if (texto.length < 2) return AutocompleteView.hide(boxDni);

    const resultados = TrabajadoresCacheService.buscarPorDniPrefix(texto);
    AutocompleteView.render({
      box: boxDni,
      items: resultados,
      mode: "dni",
      onPick: seleccionarTrabajador
    });
  });

  // Nombre
  inputNombre.addEventListener("input", (e) => {
    const texto = String(e.target.value || "").trim();
    if (texto.length < 2) return AutocompleteView.hide(boxNombre);

    const resultados = TrabajadoresCacheService.buscarPorNombre(texto);
    AutocompleteView.render({
      box: boxNombre,
      items: resultados,
      mode: "nombre",
      onPick: seleccionarTrabajador
    });
  });

  // Cerrar al click fuera
  document.addEventListener("click", (e) => {
    if (!inputDni.contains(e.target) && !boxDni.contains(e.target)) AutocompleteView.hide(boxDni);
    if (!inputNombre.contains(e.target) && !boxNombre.contains(e.target)) AutocompleteView.hide(boxNombre);
  });
}

function seleccionarTrabajador(t) {
  document.getElementById("dni_slide").value = t.dni;
  document.getElementById("trabajador_slide").value = t.nombreCompleto;
  document.getElementById("cargo_slide").value = t.cargo;
  document.getElementById("area_slide").value = t.area;
}

function limpiarSiVacio(texto) {
  if (texto.length === 0) {
    document.getElementById("trabajador_slide").value = "";
    document.getElementById("cargo_slide").value = "";
    document.getElementById("area_slide").value = "";
  }
}

// ============================
// Eventos slide (igual que tuyo)
// ============================
function setupSlideEvents() {
  const btnNuevo = document.getElementById("btnNuevaPapeleta");
  const btnCerrar = document.getElementById("btnCerrarSlide");
  const btnCancelar = document.getElementById("btnCancelarSlide");
  const btnGuardar = document.getElementById("btnGuardarSlide");
  const overlay = document.getElementById("slideOverlay");

  btnNuevo?.addEventListener("click", abrirSlideNuevo);
  btnCerrar?.addEventListener("click", cerrarSlide);
  btnCancelar?.addEventListener("click", cerrarSlide);

  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) cerrarSlide();
  });

  btnGuardar?.addEventListener("click", guardarPapeleta);

  const radios = document.getElementsByName("considerar");
  const boxOtro = document.getElementById("considerar_otro_box");

  radios?.forEach?.((radio) => {
    radio.addEventListener("change", (e) => {
      if (e.target.value === "OTRO") {
        boxOtro.style.display = "block";
        setTimeout(() => document.getElementById("considerar_otro_slide")?.focus(), 100);
      } else {
        boxOtro.style.display = "none";
        document.getElementById("considerar_otro_slide").value = "";
      }
    });
  });
}

function abrirSlideNuevo() {
  slidePapeletaEditando = null;
  document.getElementById("formSlidePapeleta").reset();
  document.getElementById("tituloSlide").textContent = "Nueva Papeleta";

  const now = new Date();
  document.getElementById("fechaPermiso_slide").value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  document.getElementById("considerar_otro_box").style.display = "none";
  document.getElementById("numero_slide").value = "Generando...";

  mostrarSlide();
}

window.abrirSlideEdicion = function (papeleta) {
  slidePapeletaEditando = papeleta;
  // (tu código de llenado queda igual)
  // ...
  mostrarSlide();
};

function mostrarSlide() {
  document.getElementById("slidePapeleta").classList.add("show");
  document.getElementById("slideOverlay").classList.add("show");
  document.body.classList.add("slide-open");
}

function cerrarSlide() {
  document.getElementById("slidePapeleta").classList.remove("show");
  document.getElementById("slideOverlay").classList.remove("show");
  document.body.classList.remove("slide-open");
  AutocompleteView.hide(document.getElementById("autocomplete_dni_box"));
  AutocompleteView.hide(document.getElementById("autocomplete_nombre_box"));
}

// Guardado (tu lógica queda; aquí solo consejo: no reload si quieres SPA)
async function guardarPapeleta() {
  // tu implementación actual está OK
  // (si quieres, luego lo dejamos con toast + refresh parcial sin reload)
}
