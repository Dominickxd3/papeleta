// Estado global del Slide
let trabajadoresCache = [];
let slidePapeletaEditando = null; // null = creando

document.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ Slide Controller: Iniciado');

  await cargarTrabajadoresCache();
  setupSlideEvents();
  setupAutocomplete();
});

async function cargarTrabajadoresCache() {
  try {
    const data = await TrabajadoresAPI.listar();

    trabajadoresCache = data.map(t => ({
      id: t.IdTra || t.id,
      dni: t.DOI || t.DniTra || '',
      nombreCompleto: t.Trabajador || `${t.NombresTra || ''} ${t.ApellidosTra || ''}`.trim(),
      cargo: t.Ocupacion || t.CargoTra || '',
      area: t.Area || t.AreaTra || ''
    }));

    console.log(`📦 Cache: ${trabajadoresCache.length} trabajadores listos.`);
  } catch (error) {
    console.error('❌ Error cacheando trabajadores:', error);
  }
}

function setupAutocomplete() {
  const inputDni = document.getElementById('dni_slide');
  const inputNombre = document.getElementById('trabajador_slide');
  const boxDni = document.getElementById('autocomplete_dni_box');
  const boxNombre = document.getElementById('autocomplete_nombre_box');

  if (!inputDni || !inputNombre) return;

  // DNI
  inputDni.addEventListener('input', e => {
    const texto = e.target.value.trim();
    limpiarSiVacio(texto);

    if (texto.length < 2) { ocultarBox(boxDni); return; }

    const resultados = trabajadoresCache.filter(t => t.dni.startsWith(texto));
    renderizarResultados(resultados, boxDni, 'dni');
  });

  // Nombre
  inputNombre.addEventListener('input', e => {
    const texto = e.target.value.toLowerCase().trim();
    if (texto.length < 2) { ocultarBox(boxNombre); return; }

    const resultados = trabajadoresCache.filter(t =>
      t.nombreCompleto.toLowerCase().includes(texto)
    );
    renderizarResultados(resultados, boxNombre, 'nombre');
  });

  // Cerrar al hacer clic fuera
  document.addEventListener('click', e => {
    if (!inputDni.contains(e.target) && !boxDni.contains(e.target)) ocultarBox(boxDni);
    if (!inputNombre.contains(e.target) && !boxNombre.contains(e.target)) ocultarBox(boxNombre);
  });
}

function renderizarResultados(lista, box, modo) {
  box.innerHTML = '';
  if (lista.length === 0) {
    box.classList.remove('show');
    return;
  }

  box.classList.add('show');
  lista.slice(0, 6).forEach(t => {
    const item = document.createElement('div');
    item.className = 'autocomplete-item';

    const inicial = t.nombreCompleto.charAt(0).toUpperCase();

    item.innerHTML = `
      <div class="autocomplete-item-avatar">${inicial}</div>
      <div>
        <div style="font-weight: bold;">
          ${modo === 'dni' ? t.dni : t.nombreCompleto}
        </div>
        <div style="font-size: 0.85rem; color: #666;">
          ${modo === 'dni' ? t.nombreCompleto : t.dni} - ${t.cargo}
        </div>
      </div>
    `;

    item.addEventListener('click', () => {
      seleccionarTrabajador(t);
      ocultarBox(box);
    });

    box.appendChild(item);
  });
}

function seleccionarTrabajador(t) {
  document.getElementById('dni_slide').value = t.dni;
  document.getElementById('trabajador_slide').value = t.nombreCompleto;
  document.getElementById('cargo_slide').value = t.cargo;
  document.getElementById('area_slide').value = t.area;
}

function limpiarSiVacio(texto) {
  if (texto.length === 0) {
    document.getElementById('trabajador_slide').value = '';
    document.getElementById('cargo_slide').value = '';
    document.getElementById('area_slide').value = '';
  }
}

function ocultarBox(box) {
  if (box) box.classList.remove('show');
}

// ==========================================
// 3. EVENTOS DEL SLIDE Y BOTONES
// ==========================================
function setupSlideEvents() {
  const btnNuevo = document.getElementById('btnNuevaPapeleta');
  const btnCerrar = document.getElementById('btnCerrarSlide');
  const btnCancelar = document.getElementById('btnCancelarSlide');
  const btnGuardar = document.getElementById('btnGuardarSlide');
  const overlay = document.getElementById('slideOverlay');

  if (btnNuevo) btnNuevo.addEventListener('click', abrirSlideNuevo);
  if (btnCerrar) btnCerrar.addEventListener('click', cerrarSlide);
  if (btnCancelar) btnCancelar.addEventListener('click', cerrarSlide);
  if (overlay) overlay.addEventListener('click', e => {
    if (e.target === overlay) cerrarSlide();
  });

  if (btnGuardar) btnGuardar.addEventListener('click', guardarPapeleta);

  const radiosConsiderar = document.getElementsByName('considerar');
  const boxOtro = document.getElementById('considerar_otro_box');

  radiosConsiderar.forEach(radio => {
    radio.addEventListener('change', e => {
      if (e.target.value === 'OTRO') {
        boxOtro.style.display = 'block';
        setTimeout(() => document.getElementById('considerar_otro_slide').focus(), 100);
      } else {
        boxOtro.style.display = 'none';
        document.getElementById('considerar_otro_slide').value = '';
      }
    });
  });
}

// --- Apertura / cierre ---
function abrirSlideNuevo() {
  slidePapeletaEditando = null;
  document.getElementById('formSlidePapeleta').reset();
  document.getElementById('tituloSlide').textContent = 'Nueva Papeleta';

  const now = new Date();
  document.getElementById('fechaPermiso_slide').value =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  document.getElementById('considerar_otro_box').style.display = 'none';
  document.getElementById('numero_slide').value = 'Generando...';

  mostrarSlide();
}

window.abrirSlideEdicion = function (papeleta) {
  slidePapeletaEditando = papeleta;
  document.getElementById('formSlidePapeleta').reset();
  document.getElementById('tituloSlide').textContent =
    `Editar Papeleta #${papeleta.NumeroPP}`;

  document.getElementById('numero_slide').value = papeleta.NumeroPP;
  document.getElementById('fechaPermiso_slide').value =
    formatearFechaInput(papeleta.FechaPermisoPP);
  document.getElementById('dni_slide').value = papeleta.DOIPP;
  document.getElementById('trabajador_slide').value = papeleta.TrabajadorPP;
  document.getElementById('cargo_slide').value = papeleta.CargoPP;
  document.getElementById('area_slide').value = papeleta.AreaPP;
  document.getElementById('motivo_slide').value = papeleta.MotivoPP;

  document.getElementById('horaSalida_slide').value =
    formatearHoraInput(papeleta.HSalidaPP);
  document.getElementById('horaRetorno_slide').value =
    formatearHoraInput(papeleta.HRetornoPP);
  document.getElementById('tiempo_slide').value =
    formatearHoraInput(papeleta.TiempoPP);
  document.getElementById('observaciones_slide').value =
    papeleta.ObservacionesPP || '';

  const radios = document.getElementsByName('considerar');
  let encontrado = false;
  radios.forEach(r => {
    if (r.value === papeleta.ConsiderarPP) {
      r.checked = true;
      encontrado = true;
    }
  });

  const boxOtro = document.getElementById('considerar_otro_box');
  if (!encontrado && papeleta.ConsiderarPP) {
    document.querySelector('input[name="considerar"][value="OTRO"]').checked = true;
    boxOtro.style.display = 'block';
    document.getElementById('considerar_otro_slide').value = papeleta.ConsiderarPP;
  } else {
    boxOtro.style.display = 'none';
  }

  mostrarSlide();
};

function mostrarSlide() {
  const panel = document.getElementById('slidePapeleta');
  const overlay = document.getElementById('slideOverlay');
  panel.classList.add('show');
  overlay.classList.add('show');
  document.body.classList.add('slide-open');
}

function cerrarSlide() {
  const panel = document.getElementById('slidePapeleta');
  const overlay = document.getElementById('slideOverlay');
  panel.classList.remove('show');
  overlay.classList.remove('show');
  document.body.classList.remove('slide-open');
  ocultarBox(document.getElementById('autocomplete_dni_box'));
  ocultarBox(document.getElementById('autocomplete_nombre_box'));
}

// ==========================================
// 4. GUARDADO (INSERT/UPDATE)
// ==========================================
async function guardarPapeleta() {
  const btn = document.getElementById('btnGuardarSlide');

  const getVal = id => document.getElementById(id).value.trim();

  let considerarVal = '';
  const radioChecked = document.querySelector('input[name="considerar"]:checked');
  if (radioChecked) {
    considerarVal = radioChecked.value;
    if (considerarVal === 'OTRO') {
      considerarVal = getVal('considerar_otro_slide');
    }
  }

  if (!getVal('dni_slide') || !getVal('trabajador_slide')) {
    alert('⚠️ Por favor seleccione un trabajador válido.');
    return;
  }

  const payload = {
    id: slidePapeletaEditando ? slidePapeletaEditando.IdPP : null,
    numero: getVal('numero_slide'),
    fechaPermiso: getVal('fechaPermiso_slide'),
    doi: getVal('dni_slide'),
    trabajador: getVal('trabajador_slide'),
    cargo: getVal('cargo_slide'),
    area: getVal('area_slide'),
    motivo: getVal('motivo_slide'),
    considerar: considerarVal,
    horaSalida: getVal('horaSalida_slide'),
    horaRetorno: getVal('horaRetorno_slide'),
    tiempo: getVal('tiempo_slide'),
    observaciones: getVal('observaciones_slide'),
    activo: true
  };

  try {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    const permiso = PapeletasService.construirPermisoDesdeSlide(payload);

    if (slidePapeletaEditando) {
      await PapeletasAPI.editar(permiso);
      alert('✅ Papeleta actualizada correctamente');
    } else {
      await PapeletasAPI.insertar(permiso);
      alert('✅ Papeleta creada correctamente');
    }

    cerrarSlide();
    window.location.reload();
  } catch (error) {
    console.error('Error al guardar:', error);
    alert('❌ Ocurrió un error al guardar: ' + (error.message || error));
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Guardar';
  }
}

// Helpers de formato
function formatearFechaInput(isoString) {
  if (!isoString) return '';
  return isoString.split('T')[0];
}

function formatearHoraInput(hora) {
  if (!hora) return '';
  if (hora.includes('T')) {
    const date = new Date(hora);
    return date.toLocaleTimeString('es-PE', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }
  return hora.substring(0, 5);
}
