
let datosOriginales = [];
let datosFiltrados = [];
let trabajadoresCache = [];
let registroSeleccionado = null;
let modoEdicion = false;

let paginaActual = 1;
let registrosPorPagina = 10;
let totalPaginas = 0;


document.addEventListener('DOMContentLoaded', async () => {
  console.log('Iniciando sistema de permisos...');
  
  // Verificar conexi?n con backend
  try {
    const health = await HealthAPI.check();
    if (!health || health.status === 'ERROR') {
      mostrarError('No se puede conectar con el servidor. Verifica que est? corriendo.');
      return;
    }
    console.log('Conexión con backend establecida');
  } catch (error) {
    mostrarError('Backend no disponible. Verifica que la API esté en ejecución.');
    return;
  }
  
  inicializarEventos();
  await cargarTrabajadores();
  await cargarPapeletas();
});


function inicializarEventos() {
  // B?squeda
  document.getElementById('txtBuscar').addEventListener('input', aplicarFiltros);
  
  // Filtros
  document.getElementById('filtroArea').addEventListener('change', aplicarFiltros);
  document.getElementById('chkEliminar').addEventListener('change', aplicarFiltros);
  
  // Filtros r?pidos
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', function() {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      this.classList.add('active');
      aplicarFiltros();
    });
  });
  
  // Botones principales
  document.getElementById('btnActualizar').addEventListener('click', cargarPapeletas);
  document.getElementById('btnExportar').addEventListener('click', exportarExcel);
  document.getElementById('btnEditar').addEventListener('click', editarSeleccionado);
  document.getElementById('btnEliminar').addEventListener('click', eliminarSeleccionado);
  
  // Formulario slide
  document.getElementById('considerar_slide').addEventListener('change', function() {
    const otroGroup = document.getElementById('otro_considerar_group');
    otroGroup.style.display = this.value === 'Otros' ? 'block' : 'none';
  });
  
  // Autocomplete DNI
  document.getElementById('doi_slide').addEventListener('input', buscarPorDNI);
  
  // Autocomplete Trabajador
  document.getElementById('trabajador_search_slide').addEventListener('input', buscarTrabajador);
  
  // Calcular tiempo
  document.getElementById('horaSalida_slide').addEventListener('change', calcularTiempo);
  document.getElementById('horaRetorno_slide').addEventListener('change', calcularTiempo);
}

// ==========================================
// CARGAR DATOS
// ==========================================
async function cargarPapeletas() {
  try {
    mostrarLoading(true);
    
    const datos = await PapeletaPermisoAPI.listar();
    
    if (!datos || datos.length === 0) {
      mostrarMensajeVacio();
      datosOriginales = [];
      return;
    }
    
    datosOriginales = datos;
    aplicarFiltros();
    
    console.log(`${datos.length} papeletas cargadas`);
    
  } catch (error) {
    console.error('Error al cargar papeletas:', error);
    mostrarError('No se pudieron cargar las papeletas');
  } finally {
    mostrarLoading(false);
  }
}

async function cargarTrabajadores() {
  try {
    trabajadoresCache = await TrabajadoresAPI.listar();
    console.log(`${trabajadoresCache.length} trabajadores cargados`);
  } catch (error) {
    console.error('Error al cargar trabajadores:', error);
  }
}


function aplicarFiltros() {
  const textoBusqueda = document.getElementById('txtBuscar').value.toLowerCase();
  const areaSeleccionada = document.getElementById('filtroArea').value;
  const mostrarEliminados = document.getElementById('chkEliminar').checked;
  const filtroEstado = document.querySelector('.filter-chip.active').dataset.filter;
  
  datosFiltrados = datosOriginales.filter(item => {
    // Filtro de texto
    const cumpleTexto = !textoBusqueda || 
      item.TrabajadorPP?.toLowerCase().includes(textoBusqueda) ||
      item.DOIPP?.toLowerCase().includes(textoBusqueda) ||
      item.CargoPP?.toLowerCase().includes(textoBusqueda) ||
      item.MotivoPP?.toLowerCase().includes(textoBusqueda) ||
      item.NumeroPP?.toString().includes(textoBusqueda);
    
    // Filtro de ?rea
    const cumpleArea = areaSeleccionada === 'Todas las ?reas' || 
      item.AreaPP === areaSeleccionada;
    
    // Filtro de eliminados
    const cumpleEliminado = mostrarEliminados || item.ActivoPP === '1';
    
    // Filtro de estado
    let cumpleEstado = true;
    if (filtroEstado === 'pendientes') {
      cumpleEstado = item.EstadoPP === 'Pendiente';
    } else if (filtroEstado === 'aprobadas') {
      cumpleEstado = item.EstadoPP === 'Aprobado por Jefe' || item.EstadoPP === 'Aprobado por RRHH';
    } else if (filtroEstado === 'rechazadas') {
      cumpleEstado = item.EstadoPP === 'Rechazado';
    }
    
    return cumpleTexto && cumpleArea && cumpleEliminado && cumpleEstado;
  });
  
  paginaActual = 1;
  renderizarTabla();
  actualizarPaginacion();
}

// ==========================================
// RENDERIZAR TABLA
// ==========================================
function renderizarTabla() {
  const tbody = document.getElementById('tabla-body');
  const mobileCards = document.getElementById('mobileCards');
  
  const inicio = (paginaActual - 1) * registrosPorPagina;
  const fin = inicio + registrosPorPagina;
  const datosPagina = datosFiltrados.slice(inicio, fin);
  
  if (datosPagina.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; padding: 2rem; color: #999;">No se encontraron registros</td></tr>';
    mobileCards.innerHTML = '<p style="text-align: center; padding: 2rem; color: #999;">No se encontraron registros</p>';
    return;
  }
  
  // Renderizar tabla desktop
  tbody.innerHTML = datosPagina.map(item => {
    const estaEliminado = item.ActivoPP === '2';
    const claseFila = estaEliminado ? 'style="opacity: 0.5;"' : '';
    
    return `
      <tr ${claseFila} data-id="${item.IdPP}" onclick="seleccionarFila(this, ${item.IdPP})">
        <td>${item.NumeroPP || '#'}</td>
        <td>${formatearFechaCorta(item.FechaPermisoPP)}</td>
        <td>
          <div style="display: flex; align-items: center;">
            <span class="worker-avatar">${obtenerIniciales(item.TrabajadorPP)}</span>
            <div>
              <div style="font-weight: 600;">${item.TrabajadorPP || 'N/A'}</div>
              <div style="font-size: 0.85rem; color: #6c757d;">DNI: ${item.DOIPP || 'N/A'}</div>
            </div>
          </div>
        </td>
        <td>${item.CargoPP || 'N/A'}</td>
        <td>${item.AreaPP || 'N/A'}</td>
        <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${item.MotivoPP || 'Sin motivo'}
        </td>
        <td class="text-center">${formatearHoraCorta(item.HSalidaPP)}</td>
        <td class="text-center">${formatearHoraCorta(item.HRetornoPP)}</td>
        <td class="text-center"><strong>${item.TiempoPP || '00:00'}</strong></td>
        <td class="text-center">${obtenerBadgeEstado(item.EstadoPP)}</td>
        <td class="text-center">
          <button class="action-btn btn-ver" data-tooltip="Ver detalles" onclick="event.stopPropagation(); verDetalle(${item.IdPP})">
            <i class="fas fa-eye"></i>
          </button>
          <button class="action-btn btn-editar" data-tooltip="Editar" onclick="event.stopPropagation(); editarPapeleta(${item.IdPP})">
            <i class="fas fa-edit"></i>
          </button>
          <button class="action-btn btn-pdf" data-tooltip="Generar PDF" onclick="event.stopPropagation(); generarPDF(${item.IdPP})">
            <i class="fas fa-file-pdf"></i>
          </button>
          ${estaEliminado ? 
            `<button class="action-btn btn-ver" data-tooltip="Restaurar" onclick="event.stopPropagation(); restaurarPapeleta(${item.IdPP})">
              <i class="fas fa-undo"></i>
            </button>` :
            `<button class="action-btn btn-eliminar" data-tooltip="Eliminar" onclick="event.stopPropagation(); eliminarPapeleta(${item.IdPP})">
              <i class="fas fa-trash"></i>
            </button>`
          }
        </td>
      </tr>
    `;
  }).join('');
  
  // Renderizar mobile cards
  mobileCards.innerHTML = datosPagina.map(item => {
    const estaEliminado = item.ActivoPP === '2';
    const claseCard = estaEliminado ? 'style="opacity: 0.5;"' : '';
    
    return `
      <div class="mobile-card" ${claseCard} data-id="${item.IdPP}" onclick="seleccionarFila(this, ${item.IdPP})">
        <div class="mobile-card-header">
          <div class="mobile-card-worker">
            <div class="mobile-card-worker-name">${item.TrabajadorPP || 'N/A'}</div>
            <div class="mobile-card-worker-position">${item.CargoPP || 'N/A'} - ${item.AreaPP || 'N/A'}</div>
          </div>
          ${obtenerBadgeEstado(item.EstadoPP)}
        </div>
        <div class="mobile-card-body">
          <div class="mobile-card-row">
            <span class="mobile-card-label">N? Papeleta:</span>
            <span class="mobile-card-value">${item.NumeroPP || '#'}</span>
          </div>
          <div class="mobile-card-row">
            <span class="mobile-card-label">Fecha:</span>
            <span class="mobile-card-value">${formatearFechaCorta(item.FechaPermisoPP)}</span>
          </div>
          <div class="mobile-card-row">
            <span class="mobile-card-label">DNI:</span>
            <span class="mobile-card-value">${item.DOIPP || 'N/A'}</span>
          </div>
          <div class="mobile-card-row">
            <span class="mobile-card-label">Horario:</span>
            <span class="mobile-card-value">${formatearHoraCorta(item.HSalidaPP)} - ${formatearHoraCorta(item.HRetornoPP)}</span>
          </div>
          <div class="mobile-card-row">
            <span class="mobile-card-label">Total:</span>
            <span class="mobile-card-value"><strong>${item.TiempoPP || '00:00'}</strong></span>
          </div>
          <div class="mobile-card-row">
            <span class="mobile-card-label">Motivo:</span>
            <span class="mobile-card-value">${item.MotivoPP || 'Sin motivo'}</span>
          </div>
        </div>
        <div class="mobile-card-footer">
          <div>
            <button class="action-btn btn-ver" onclick="event.stopPropagation(); verDetalle(${item.IdPP})">
              <i class="fas fa-eye"></i>
            </button>
            <button class="action-btn btn-editar" onclick="event.stopPropagation(); editarPapeleta(${item.IdPP})">
              <i class="fas fa-edit"></i>
            </button>
            <button class="action-btn btn-pdf" onclick="event.stopPropagation(); generarPDF(${item.IdPP})">
              <i class="fas fa-file-pdf"></i>
            </button>
            ${!estaEliminado ?
              `<button class="action-btn btn-eliminar" onclick="event.stopPropagation(); eliminarPapeleta(${item.IdPP})">
                <i class="fas fa-trash"></i>
              </button>` : ''
            }
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// PAGINACI?"N
// ==========================================
function actualizarPaginacion() {
  totalPaginas = Math.ceil(datosFiltrados.length / registrosPorPagina);
  
  // Actualizar info
  const inicio = (paginaActual - 1) * registrosPorPagina + 1;
  const fin = Math.min(inicio + registrosPorPagina - 1, datosFiltrados.length);
  document.getElementById('paginaActualInfo').textContent = datosFiltrados.length > 0 ? `${inicio}-${fin}` : '0-0';
  document.getElementById('totalRegistros').textContent = datosFiltrados.length;
  
  // Botones
  document.getElementById('btnPrimera').disabled = paginaActual === 1;
  document.getElementById('btnAnterior').disabled = paginaActual === 1;
  document.getElementById('btnSiguiente').disabled = paginaActual === totalPaginas || totalPaginas === 0;
  document.getElementById('btnUltima').disabled = paginaActual === totalPaginas || totalPaginas === 0;
  
  // N?meros de p?gina
  renderizarNumerosPagina();
}

function renderizarNumerosPagina() {
  const container = document.getElementById('paginationNumbers');
  const maxBotones = 5;
  let html = '';
  
  let inicio = Math.max(1, paginaActual - Math.floor(maxBotones / 2));
  let fin = Math.min(totalPaginas, inicio + maxBotones - 1);
  
  if (fin - inicio < maxBotones - 1) {
    inicio = Math.max(1, fin - maxBotones + 1);
  }
  
  for (let i = inicio; i <= fin; i++) {
    html += `
      <button class="btn-pagination ${i === paginaActual ? 'active' : ''}" 
              onclick="irPagina(${i})">
        ${i}
      </button>
    `;
  }
  
  container.innerHTML = html;
}

function irPagina(pagina) {
  if (pagina === 'prev') {
    paginaActual = Math.max(1, paginaActual - 1);
  } else if (pagina === 'next') {
    paginaActual = Math.min(totalPaginas, paginaActual + 1);
  } else if (pagina === 'last') {
    paginaActual = totalPaginas;
  } else {
    paginaActual = pagina;
  }
  
  renderizarTabla();
  actualizarPaginacion();
}

function cambiarTamanoPagina() {
  registrosPorPagina = parseInt(document.getElementById('registrosPorPagina').value);
  paginaActual = 1;
  renderizarTabla();
  actualizarPaginacion();
}

// ==========================================
// SELECCI?"N DE FILAS
// ==========================================
function seleccionarFila(elemento, id) {
  // Remover selecci?n anterior
  document.querySelectorAll('tbody tr, .mobile-card').forEach(el => {
    el.classList.remove('selected');
  });
  
  // Seleccionar nueva fila
  elemento.classList.add('selected');
  registroSeleccionado = id;
  
  // Habilitar botones
  document.getElementById('btnEditar').disabled = false;
  document.getElementById('btnEliminar').disabled = false;
}

// ==========================================
// FUNCIONES DE FORMATO
// ==========================================
function formatearFechaCorta(fecha) {
  if (!fecha) return 'N/A';
  const raw = String(fecha).trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const date = new Date(fecha);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function formatearHoraCorta(hora) {
  if (!hora) return '--:--';
  if (typeof hora === 'string') {
    return hora.substring(0, 5);
  }
  return '--:--';
}

function obtenerIniciales(nombre) {
  if (!nombre) return 'N/A';
  const palabras = nombre.trim().split(' ');
  if (palabras.length >= 2) {
    return (palabras[0][0] + palabras[1][0]).toUpperCase();
  }
  return nombre.substring(0, 2).toUpperCase();
}

function obtenerBadgeEstado(estado) {
  if (!estado) {
    return '<span class="badge badge-info"><i class="fas fa-question-circle"></i> Sin Estado</span>';
  }
  
  switch (estado.toLowerCase()) {
    case 'pendiente':
      return '<span class="badge badge-pendiente"><i class="fas fa-clock"></i> Pendiente</span>';
    case 'aprobado por jefe':
      return '<span class="badge badge-aprobado-jefe"><i class="fas fa-check"></i> Aprob. Jefe</span>';
    case 'aprobado por rrhh':
      return '<span class="badge badge-aprobado-rrhh"><i class="fas fa-check-double"></i> Aprob. RRHH</span>';
    case 'rechazado':
      return '<span class="badge badge-rechazado"><i class="fas fa-times"></i> Rechazado</span>';
    default:
      return `<span class="badge badge-info"><i class="fas fa-info-circle"></i> ${estado}</span>`;
  }
}

// ==========================================
// LOADING Y MENSAJES
// ==========================================
function mostrarLoading(mostrar) {
  const tbody = document.getElementById('tabla-body');
  if (mostrar) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11">
          <div class="loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Cargando papeletas...</p>
          </div>
        </td>
      </tr>
    `;
  }
}

function mostrarMensajeVacio() {
  const tbody = document.getElementById('tabla-body');
  tbody.innerHTML = `
    <tr>
      <td colspan="11" style="text-align: center; padding: 3rem;">
        <i class="fas fa-inbox" style="font-size: 3rem; color: #ccc;"></i>
        <p style="margin-top: 1rem; color: #999;">No hay papeletas registradas</p>
      </td>
    </tr>
  `;
}

function mostrarError(mensaje) {
  const tbody = document.getElementById('tabla-body');
  tbody.innerHTML = `
    <tr>
      <td colspan="11" style="text-align: center; padding: 3rem;">
        <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #dc3545;"></i>
        <p style="margin-top: 1rem; color: #dc3545;">${mensaje}</p>
      </td>
    </tr>
  `;
}

// ==========================================
// FORMULARIO SLIDE
// ==========================================
function abrirFormularioNuevo() {
  modoEdicion = false;
  document.getElementById('slideTitle').innerHTML = '<i class="fas fa-file-alt"></i> Nueva Papeleta';
  limpiarFormulario();
  generarNumeroPapeleta();
  abrirSlide();
}

function abrirSlide() {
  document.getElementById('slideOverlay').classList.add('show');
  document.getElementById('slidePanel').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function cerrarSlide() {
  document.getElementById('slideOverlay').classList.remove('show');
  document.getElementById('slidePanel').classList.remove('show');
  document.body.style.overflow = 'auto';
  limpiarFormulario();
}

function limpiarFormulario() {
  document.getElementById('formPapeleta').reset();
  document.getElementById('alertaFormulario').style.display = 'none';
  document.getElementById('otro_considerar_group').style.display = 'none';
  modoEdicion = false;
  registroSeleccionado = null;
}

async function generarNumeroPapeleta() {
  const numero = 'PP-' + Date.now();
  document.getElementById('numero_slide').value = numero;
}

// ==========================================
// AUTOCOMPLETE DNI
// ==========================================
function buscarPorDNI(e) {
  const valor = e.target.value.trim();
  const resultsContainer = document.getElementById('dni_results_slide');
  
  if (valor.length < 3) {
    resultsContainer.classList.remove('show');
    return;
  }
  
  const resultados = trabajadoresCache.filter(t => 
    t.DOIT?.toString().includes(valor)
  );
  
  if (resultados.length === 0) {
    resultsContainer.classList.remove('show');
    return;
  }
  
  resultsContainer.innerHTML = resultados.map(t => `
    <div class="autocomplete-item" onclick="seleccionarTrabajadorPorDNI('${t.DOIT}', '${t.NombreCompletoT}', '${t.CargoT}', '${t.AreaT}')">
      <span><strong>${t.DOIT}</strong> - ${t.NombreCompletoT}</span>
      <span style="font-size: 0.8rem; color: #999;">${t.CargoT}</span>
    </div>
  `).join('');
  
  resultsContainer.classList.add('show');
}

function seleccionarTrabajadorPorDNI(dni, nombre, cargo, area) {
  document.getElementById('doi_slide').value = dni;
  document.getElementById('trabajador_search_slide').value = nombre;
  document.getElementById('cargo_slide').value = cargo || '';
  document.getElementById('area_slide').value = area || '';
  
  document.getElementById('dni_results_slide').classList.remove('show');
  document.getElementById('trabajador_results_slide').classList.remove('show');
}


function buscarTrabajador(e) {
  const valor = e.target.value.trim().toLowerCase();
  const resultsContainer = document.getElementById('trabajador_results_slide');
  
  if (valor.length < 3) {
    resultsContainer.classList.remove('show');
    return;
  }
  
  const resultados = trabajadoresCache.filter(t => 
    t.NombreCompletoT?.toLowerCase().includes(valor)
  );
  
  if (resultados.length === 0) {
    resultsContainer.classList.remove('show');
    return;
  }
  
  resultsContainer.innerHTML = resultados.map(t => `
    <div class="autocomplete-item" onclick="seleccionarTrabajador('${t.DOIT}', '${t.NombreCompletoT}', '${t.CargoT}', '${t.AreaT}')">
      <span><strong>${t.NombreCompletoT}</strong></span>
      <span style="font-size: 0.8rem; color: #999;">DNI: ${t.DOIT}</span>
    </div>
  `).join('');
  
  resultsContainer.classList.add('show');
}

function seleccionarTrabajador(dni, nombre, cargo, area) {
  document.getElementById('doi_slide').value = dni;
  document.getElementById('trabajador_search_slide').value = nombre;
  document.getElementById('cargo_slide').value = cargo || '';
  document.getElementById('area_slide').value = area || '';
  
  document.getElementById('dni_results_slide').classList.remove('show');
  document.getElementById('trabajador_results_slide').classList.remove('show');
}


function calcularTiempo() {
  const horaSalida = document.getElementById('horaSalida_slide').value;
  const horaRetorno = document.getElementById('horaRetorno_slide').value;
  
  if (!horaSalida || !horaRetorno) {
    document.getElementById('tiempo_slide').value = '00:00';
    return;
  }
  
  const [h1, m1] = horaSalida.split(':').map(Number);
  const [h2, m2] = horaRetorno.split(':').map(Number);
  
  let minutosTotales = (h2 * 60 + m2) - (h1 * 60 + m1);
  
  if (minutosTotales < 0) {
    minutosTotales += 24 * 60;
  }
  
  const horas = Math.floor(minutosTotales / 60);
  const minutos = minutosTotales % 60;
  
  document.getElementById('tiempo_slide').value = 
    `${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}`;
}


async function guardarPapeletaSlide() {
  const alerta = document.getElementById('alertaFormulario');
  
  // Validar campos requeridos
  const fechaPermiso = document.getElementById('fechaPermiso_slide').value;
  const doi = document.getElementById('doi_slide').value;
  const trabajador = document.getElementById('trabajador_search_slide').value;
  const motivo = document.getElementById('motivo_slide').value;
  
  if (!fechaPermiso || !doi || !trabajador || !motivo) {
    alerta.style.display = 'flex';
    return;
  }
  
  alerta.style.display = 'none';
  
  // Construir objeto
  const considerar = document.getElementById('considerar_slide').value;
  const permiso = {
    numero: document.getElementById('numero_slide').value,
    fechaPermiso: fechaPermiso,
    doi: doi,
    trabajador: trabajador,
    cargo: document.getElementById('cargo_slide').value,
    area: document.getElementById('area_slide').value,
    motivo: motivo,
    considerar: considerar === 'Otros'
      ? document.getElementById('otro_considerar_input').value
      : considerar,
    horaSalida: document.getElementById('horaSalida_slide').value || '00:00:00',
    horaRetorno: document.getElementById('horaRetorno_slide').value || '00:00:00',
    tiempo: document.getElementById('tiempo_slide').value || '00:00',
    observaciones: document.getElementById('observaciones_slide').value
  };
  
  try {
    document.getElementById('btnGuardarSlide').disabled = true;
    document.getElementById('btnGuardarSlide').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    
    if (modoEdicion && registroSeleccionado) {
      permiso.id = registroSeleccionado;
      await PapeletaPermisoAPI.editar(permiso);
      mostrarNotificacion('Papeleta actualizada correctamente', 'success');
    } else {
      await PapeletaPermisoAPI.insertar(permiso);
      mostrarNotificacion('Papeleta creada correctamente', 'success');
    }
    
    cerrarSlide();
    await cargarPapeletas();
    
  } catch (error) {
    console.error('Error al guardar:', error);
    mostrarNotificacion('Error al guardar la papeleta', 'error');
  } finally {
    document.getElementById('btnGuardarSlide').disabled = false;
    document.getElementById('btnGuardarSlide').innerHTML = '<i class="fas fa-save"></i> Guardar';
  }
}


function editarSeleccionado() {
  if (!registroSeleccionado) {
    mostrarNotificacion('Selecciona una papeleta primero', 'warning');
    return;
  }
  editarPapeleta(registroSeleccionado);
}

async function editarPapeleta(id) {
  const papeleta = datosOriginales.find(p => p.IdPP === id);
  
  if (!papeleta) {
    mostrarNotificacion('No se encontro la papeleta', 'error');
    return;
  }
  
  modoEdicion = true;
  registroSeleccionado = id;
  
  document.getElementById('slideTitle').innerHTML = '<i class="fas fa-edit"></i> Editar Papeleta';
  
  // Llenar formulario
  document.getElementById('numero_slide').value = papeleta.NumeroPP || '';
  document.getElementById('fechaPermiso_slide').value = formatearFechaInput(papeleta.FechaPermisoPP);
  document.getElementById('doi_slide').value = papeleta.DOIPP || '';
  document.getElementById('trabajador_search_slide').value = papeleta.TrabajadorPP || '';
  document.getElementById('cargo_slide').value = papeleta.CargoPP || '';
  document.getElementById('area_slide').value = papeleta.AreaPP || '';
  document.getElementById('motivo_slide').value = papeleta.MotivoPP || '';
  document.getElementById('considerar_slide').value = papeleta.ConsiderarPP || '1/2 dia a cuenta de vacaciones';
  document.getElementById('horaSalida_slide').value = formatearHoraInput(papeleta.HSalidaPP);
  document.getElementById('horaRetorno_slide').value = formatearHoraInput(papeleta.HRetornoPP);
  document.getElementById('tiempo_slide').value = papeleta.TiempoPP || '00:00';
  document.getElementById('observaciones_slide').value = papeleta.ObservacionesPP || '';
  
  abrirSlide();
}

function formatearFechaInput(fecha) {
  if (!fecha) return '';
  const date = new Date(fecha);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatearHoraInput(hora) {
  if (!hora) return '';
  if (typeof hora === 'string') {
    return hora.substring(0, 5);
  }
  return '';
}

// ==========================================
// ELIMINAR
// ==========================================
function eliminarSeleccionado() {
  if (!registroSeleccionado) {
    mostrarNotificacion('Selecciona una papeleta primero', 'warning');
    return;
  }
  eliminarPapeleta(registroSeleccionado);
}

async function eliminarPapeleta(id) {
  const confirmar = confirm('Estas seguro de eliminar esta papeleta?');
  
  if (!confirmar) return;
  
  try {
    await PapeletaPermisoAPI.eliminar(id);
    mostrarNotificacion('Papeleta eliminada correctamente', 'success');
    await cargarPapeletas();
    
    // Limpiar selecci?n
    registroSeleccionado = null;
    document.getElementById('btnEditar').disabled = true;
    document.getElementById('btnEliminar').disabled = true;
    
  } catch (error) {
    console.error('Error al eliminar:', error);
    mostrarNotificacion('Error al eliminar la papeleta', 'error');
  }
}

async function restaurarPapeleta(id) {
  const confirmar = confirm('Deseas restaurar esta papeleta?');
  
  if (!confirmar) return;
  
  try {
    const papeleta = datosOriginales.find(p => p.IdPP === id);
    if (papeleta) {
      await PapeletaPermisoAPI.editar({
        id: id,
        numero: papeleta.NumeroPP,
        fechaPermiso: papeleta.FechaPermisoPP,
        doi: papeleta.DOIPP,
        trabajador: papeleta.TrabajadorPP,
        cargo: papeleta.CargoPP,
        area: papeleta.AreaPP,
        motivo: papeleta.MotivoPP,
        considerar: papeleta.ConsiderarPP,
        horaSalida: papeleta.HSalidaPP,
        horaRetorno: papeleta.HRetornoPP,
        tiempo: papeleta.TiempoPP,
        observaciones: papeleta.ObservacionesPP
      });
      mostrarNotificacion('Papeleta restaurada correctamente', 'success');
      await cargarPapeletas();
    }
  } catch (error) {
    console.error('Error al restaurar:', error);
    mostrarNotificacion('Error al restaurar la papeleta', 'error');
  }
}


function verDetalle(id) {
  const papeleta = datosOriginales.find(p => p.IdPP === id);
  
  if (!papeleta) {
    mostrarNotificacion('No se encontro la papeleta', 'error');
    return;
  }
  
  const html = `
    <div style="padding: 20px; max-width: 600px;">
      <h3 style="margin-bottom: 20px; color: #667eea;">
        <i class="fas fa-file-alt"></i> Detalle de Papeleta
      </h3>
      
      <div style="display: grid; gap: 15px;">
        <div style="display: grid; grid-template-columns: 150px 1fr; gap: 10px;">
          <strong>N? Papeleta:</strong>
          <span>${papeleta.NumeroPP || 'N/A'}</span>
        </div>
        
        <div style="display: grid; grid-template-columns: 150px 1fr; gap: 10px;">
          <strong>Fecha Permiso:</strong>
          <span>${formatearFechaCorta(papeleta.FechaPermisoPP)}</span>
        </div>
        
        <div style="display: grid; grid-template-columns: 150px 1fr; gap: 10px;">
          <strong>Trabajador:</strong>
          <span>${papeleta.TrabajadorPP || 'N/A'}</span>
        </div>
        
        <div style="display: grid; grid-template-columns: 150px 1fr; gap: 10px;">
          <strong>DNI:</strong>
          <span>${papeleta.DOIPP || 'N/A'}</span>
        </div>
        
        <div style="display: grid; grid-template-columns: 150px 1fr; gap: 10px;">
          <strong>Cargo:</strong>
          <span>${papeleta.CargoPP || 'N/A'}</span>
        </div>
        
        <div style="display: grid; grid-template-columns: 150px 1fr; gap: 10px;">
          <strong>?rea:</strong>
          <span>${papeleta.AreaPP || 'N/A'}</span>
        </div>
        
        <div style="display: grid; grid-template-columns: 150px 1fr; gap: 10px;">
          <strong>Motivo:</strong>
          <span>${papeleta.MotivoPP || 'N/A'}</span>
        </div>
        
        <div style="display: grid; grid-template-columns: 150px 1fr; gap: 10px;">
          <strong>Considerar como:</strong>
          <span>${papeleta.ConsiderarPP || 'N/A'}</span>
        </div>
        
        <div style="display: grid; grid-template-columns: 150px 1fr; gap: 10px;">
          <strong>Hora Salida:</strong>
          <span>${formatearHoraCorta(papeleta.HSalidaPP)}</span>
        </div>
        
        <div style="display: grid; grid-template-columns: 150px 1fr; gap: 10px;">
          <strong>Hora Retorno:</strong>
          <span>${formatearHoraCorta(papeleta.HRetornoPP)}</span>
        </div>
        
        <div style="display: grid; grid-template-columns: 150px 1fr; gap: 10px;">
          <strong>Tiempo Total:</strong>
          <span><strong>${papeleta.TiempoPP || '00:00'}</strong></span>
        </div>
        
        <div style="display: grid; grid-template-columns: 150px 1fr; gap: 10px;">
          <strong>Estado:</strong>
          <span>${obtenerBadgeEstado(papeleta.EstadoPP)}</span>
        </div>
        
        ${papeleta.ObservacionesPP ? `
          <div style="display: grid; grid-template-columns: 150px 1fr; gap: 10px;">
            <strong>Observaciones:</strong>
            <span>${papeleta.ObservacionesPP}</span>
          </div>
        ` : ''}
        
        <div style="display: grid; grid-template-columns: 150px 1fr; gap: 10px; border-top: 1px solid #eee; padding-top: 15px; margin-top: 10px;">
          <strong>Fecha Registro:</strong>
          <span style="font-size: 0.9rem; color: #666;">${formatearFechaHora(papeleta.FechaRegistroPP)}</span>
        </div>
      </div>
      
      <div style="margin-top: 20px; text-align: right;">
        <button onclick="this.closest('.swal2-popup').querySelector('.swal2-close').click()" 
                class="btn btn-secondary">
          Cerrar
        </button>
      </div>
    </div>
  `;
  
  Swal.fire({
    html: html,
    showConfirmButton: false,
    width: 650,
    customClass: {
      popup: 'swal-wide'
    }
  });
}

function formatearFechaHora(fecha) {
  if (!fecha) return 'N/A';
  const date = new Date(fecha);
  return date.toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}


async function generarPDF(id) {
  if (!id) {
    mostrarNotificacion("ID de papeleta no v?lido", "error");
    return;
  }
  const token = localStorage.getItem("token");
  if (!token || token === "undefined" || token === "null" || token === "temp-token") {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    window.location.href = window.location.origin + "/index.html";
    return;
  }

  try {
    const response = await fetch(API_CONFIG.baseURL + "/papeletas/" + Number(id) + "/pdf", {
      method: "GET",
      headers: (typeof getAuthHeaders === "function" ? getAuthHeaders() : {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.message || ("Error " + response.status + " al generar PDF"));
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    mostrarNotificacion(error?.message || "No se pudo generar el PDF", "error");
  }
}


function exportarExcel() {
  if (datosFiltrados.length === 0) {
    mostrarNotificacion('No hay datos para exportar', 'warning');
    return;
  }
  
  try {
    const datosExportar = datosFiltrados.map(item => ({
      'N?': item.NumeroPP || '',
      'Fecha': formatearFechaCorta(item.FechaPermisoPP),
      'DNI': item.DOIPP || '',
      'Trabajador': item.TrabajadorPP || '',
      'Cargo': item.CargoPP || '',
      '?rea': item.AreaPP || '',
      'Motivo': item.MotivoPP || '',
      'Considerar': item.ConsiderarPP || '',
      'Hora Salida': formatearHoraCorta(item.HSalidaPP),
      'Hora Retorno': formatearHoraCorta(item.HRetornoPP),
      'Tiempo Total': item.TiempoPP || '',
      'Estado': item.EstadoPP || '',
      'Observaciones': item.ObservacionesPP || ''
    }));
    
    const headers = Object.keys(datosExportar[0]);
    let csv = headers.join(',') + '\n';
    
    datosExportar.forEach(row => {
      csv += headers.map(header => {
        const value = row[header] || '';
        return `"${value.toString().replace(/"/g, '""')}"`;
      }).join(',') + '\n';
    });
    
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `papeletas_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    mostrarNotificacion('Datos exportados correctamente', 'success');
    
  } catch (error) {
    console.error('Error al exportar:', error);
    mostrarNotificacion('Error al exportar los datos', 'error');
  }
}


function mostrarNotificacion(mensaje, tipo = 'info') {
  Swal.fire({
    icon: tipo,
    title: mensaje,
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true
  });
}


document.addEventListener('click', function(e) {
  if (!e.target.closest('.autocomplete-wrapper')) {
    document.querySelectorAll('.autocomplete-results').forEach(el => {
      el.classList.remove('show');
    });
  }
});

console.log('permisos corriendo correctamente');




