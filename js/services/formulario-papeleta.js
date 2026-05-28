// ==========================================
// VARIABLES GLOBALES
// ==========================================
let modoEdicion = false;
let papeletaId = null;
let trabajadoresData = [];

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📝 Formulario de papeleta iniciado');
    
    // Verificar autenticación
    if (typeof verificarAutenticacion === 'function') {
        verificarAutenticacion();
    }

    // Obtener parámetros de URL
    const urlParams = new URLSearchParams(window.location.search);
    papeletaId = urlParams.get('id');

    if (papeletaId) {
        modoEdicion = true;
        document.getElementById('tituloFormulario').textContent = 'Editar Papeleta';
        await cargarPapeleta(papeletaId);
    } else {
        await generarNumero();
    }

    // Cargar trabajadores
    await cargarTrabajadores();

    // Configurar fecha mínima (hoy)
    const now = new Date();
    const hoy = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    document.getElementById('fechaPermiso').value = hoy;
    document.getElementById('fechaPermiso').min = hoy;

    // Inicializar event listeners
    inicializarEventos();
    
    // Actualizar progreso inicial
    actualizarProgreso();
});

// ==========================================
// EVENT LISTENERS
// ==========================================
function inicializarEventos() {
    // DNI
    document.getElementById('doi').addEventListener('input', validarDNI);
    document.getElementById('btnBuscarDNI').addEventListener('click', buscarPorDNI);
    document.getElementById('doi').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            buscarPorDNI();
        }
    });

    // Trabajador
    document.getElementById('trabajador').addEventListener('change', cargarDatosTrabajador);
    
    // Área
    document.getElementById('area').addEventListener('change', validarCampo);
    
    // Fechas y horas
    document.getElementById('fechaPermiso').addEventListener('change', validarCampo);
    document.getElementById('horaSalida').addEventListener('change', () => {
        validarCampo();
        calcularTiempo();
    });
    document.getElementById('horaRetorno').addEventListener('change', calcularTiempo);
    
    // Motivo
    const motivoTextarea = document.getElementById('motivo');
    motivoTextarea.addEventListener('input', () => {
        actualizarContador('motivo', 'motivoCount', 500);
        validarMotivo();
        actualizarProgreso();
    });
    
    // Observaciones
    document.getElementById('observaciones').addEventListener('input', () => {
        actualizarContador('observaciones', 'obsCount', 300);
    });
    
    // Formulario
    document.getElementById('formPapeleta').addEventListener('submit', guardarPapeleta);
    
    // Validación en tiempo real de todos los campos
    document.querySelectorAll('input[required], select[required], textarea[required]').forEach(campo => {
        campo.addEventListener('blur', validarCampo);
        campo.addEventListener('change', actualizarProgreso);
    });
}

// ==========================================
// VALIDACIONES EN TIEMPO REAL
// ==========================================
function validarDNI() {
    const doi = document.getElementById('doi');
    const validation = document.getElementById('doiValidation');
    const value = doi.value.replace(/\D/g, ''); // Solo números
    
    doi.value = value;
    
    if (value.length === 0) {
        doi.classList.remove('error', 'success');
        validation.classList.remove('show');
        return false;
    }
    
    if (value.length < 8) {
        doi.classList.add('error');
        doi.classList.remove('success');
        validation.innerHTML = '<i class="fas fa-times-circle"></i> El DNI debe tener 8 dígitos';
        validation.classList.add('show', 'error');
        validation.classList.remove('success');
        return false;
    }
    
    doi.classList.remove('error');
    doi.classList.add('success');
    validation.innerHTML = '<i class="fas fa-check-circle"></i> DNI válido';
    validation.classList.add('show', 'success');
    validation.classList.remove('error');
    return true;
}

function validarMotivo() {
    const motivo = document.getElementById('motivo');
    const validation = document.getElementById('motivoValidation');
    const value = motivo.value.trim();
    
    if (value.length === 0) {
        motivo.classList.remove('error', 'success');
        validation.classList.remove('show');
        return false;
    }
    
    if (value.length < 10) {
        motivo.classList.add('error');
        motivo.classList.remove('success');
        validation.innerHTML = '<i class="fas fa-times-circle"></i> El motivo debe tener al menos 10 caracteres';
        validation.classList.add('show', 'error');
        validation.classList.remove('success');
        return false;
    }
    
    motivo.classList.remove('error');
    motivo.classList.add('success');
    validation.innerHTML = '<i class="fas fa-check-circle"></i> Motivo válido';
    validation.classList.add('show', 'success');
    validation.classList.remove('error');
    return true;
}

function validarCampo(event) {
    const campo = event ? event.target : this;
    
    if (!campo.required) return true;
    
    if (!campo.value || campo.value === '') {
        campo.classList.add('error');
        campo.classList.remove('success');
        return false;
    }
    
    campo.classList.remove('error');
    campo.classList.add('success');
    return true;
}

// ==========================================
// BUSCAR TRABAJADOR POR DNI
// ==========================================
function buscarPorDNI() {
    const doi = document.getElementById('doi').value.trim();
    
    if (!validarDNI()) {
        mostrarError('Ingrese un DNI válido de 8 dígitos');
        return;
    }
    
    const trabajador = trabajadoresData.find(t => 
        (t.DOI || t.doi || '').toString() === doi
    );
    
    const selectTrabajador = document.getElementById('trabajador');
    
    if (trabajador) {
        // Buscar y seleccionar en el select
        for (let i = 0; i < selectTrabajador.options.length; i++) {
            if (selectTrabajador.options[i].dataset.doi === doi) {
                selectTrabajador.selectedIndex = i;
                cargarDatosTrabajador();
                mostrarExito(`Trabajador encontrado: ${trabajador.Trabajador}`);
                return;
            }
        }
    }
    
    mostrarError('No se encontró ningún trabajador con ese DNI');
    selectTrabajador.selectedIndex = 0;
    document.getElementById('cargo').value = '';
    document.getElementById('area').value = '';
}

// ==========================================
// CARGAR TRABAJADORES
// ==========================================
async function cargarTrabajadores() {
    try {
        mostrarLoading('Cargando trabajadores...');
        trabajadoresData = await TrabajadoresAPI.listar();
        const select = document.getElementById('trabajador');
        
        select.innerHTML = '<option value="">Seleccione un trabajador...</option>';
        
        trabajadoresData
            .filter(t => t.Activo === '1' || t.ACTIVO === 'SI')
            .sort((a, b) => (a.Trabajador || '').localeCompare(b.Trabajador || ''))
            .forEach(t => {
                const option = document.createElement('option');
                option.value = t.DOI || t.Trabajador;
                option.textContent = `${t.Trabajador} - DNI: ${t.DOI}`;
                option.dataset.cargo = t.Ocupacion || '';
                option.dataset.area = t.Area || '';
                option.dataset.doi = t.DOI || '';
                select.appendChild(option);
            });

        ocultarLoading();
        console.log(`✅ ${trabajadoresData.length} trabajadores cargados`);
    } catch (error) {
        console.error('❌ Error al cargar trabajadores:', error);
        ocultarLoading();
        mostrarError('Error al cargar la lista de trabajadores');
    }
}

// ==========================================
// CARGAR DATOS DEL TRABAJADOR
// ==========================================
function cargarDatosTrabajador() {
    const select = document.getElementById('trabajador');
    const option = select.options[select.selectedIndex];
    
    if (option && option.value) {
        document.getElementById('doi').value = option.dataset.doi || '';
        document.getElementById('cargo').value = option.dataset.cargo || '';
        document.getElementById('area').value = option.dataset.area || '';
        
        // Validar campos
        validarDNI();
        actualizarProgreso();
    } else {
        document.getElementById('doi').value = '';
        document.getElementById('cargo').value = '';
        document.getElementById('area').value = '';
    }
}

// ==========================================
// GENERAR NÚMERO DE PAPELETA
// ==========================================
async function generarNumero() {
    try {
        const papeletas = await PapeletaPermisoAPI.listar();
        const ultimoNumero = Math.max(...papeletas.map(p => 
            parseInt(p.NumeroPP || p.NUMERO_PP || 0)
        ), 0);
        
        const nuevoNumero = ultimoNumero + 1;
        document.getElementById('numero').value = nuevoNumero;
        document.getElementById('numeroBadge').textContent = nuevoNumero;
    } catch (error) {
        console.error('❌ Error al generar número:', error);
        const numeroAleatorio = Math.floor(Math.random() * 1000) + 1;
        document.getElementById('numero').value = numeroAleatorio;
        document.getElementById('numeroBadge').textContent = numeroAleatorio;
    }
}

// ==========================================
// CALCULAR TIEMPO
// ==========================================
function calcularTiempo() {
    const salida = document.getElementById('horaSalida').value;
    const retorno = document.getElementById('horaRetorno').value;
    const tiempoInput = document.getElementById('tiempo');

    if (!salida) {
        tiempoInput.value = '';
        return;
    }

    if (!retorno) {
        tiempoInput.value = '';
        return;
    }

    const [hSalida, mSalida] = salida.split(':').map(Number);
    const [hRetorno, mRetorno] = retorno.split(':').map(Number);

    const minutosSalida = hSalida * 60 + mSalida;
    const minutosRetorno = hRetorno * 60 + mRetorno;

    if (minutosRetorno <= minutosSalida) {
        mostrarError('La hora de retorno debe ser posterior a la hora de salida');
        tiempoInput.value = '';
        return;
    }

    const diferenciaMinutos = minutosRetorno - minutosSalida;
    const horas = Math.floor(diferenciaMinutos / 60);
    const minutos = diferenciaMinutos % 60;

    tiempoInput.value = `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
}

// ==========================================
// ACTUALIZAR CONTADOR DE CARACTERES
// ==========================================
function actualizarContador(textareaId, counterId, max) {
    const textarea = document.getElementById(textareaId);
    const counter = document.getElementById(counterId);
    const length = textarea.value.length;
    
    counter.textContent = length;
    counter.parentElement.classList.remove('warning', 'danger');
    
    if (length > max * 0.9) {
        counter.parentElement.classList.add('danger');
    } else if (length > max * 0.7) {
        counter.parentElement.classList.add('warning');
    }
}

// ==========================================
// ACTUALIZAR BARRA DE PROGRESO
// ==========================================
function actualizarProgreso() {
    const camposRequeridos = [
        'doi',
        'trabajador',
        'area',
        'fechaPermiso',
        'horaSalida',
        'motivo'
    ];
    
    let camposCompletos = 0;
    
    camposRequeridos.forEach(id => {
        const campo = document.getElementById(id);
        if (campo && campo.value && campo.value.trim() !== '') {
            camposCompletos++;
        }
    });
    
    const progreso = (camposCompletos / camposRequeridos.length) * 100;
    document.getElementById('progressBar').style.width = progreso + '%';
}

// ==========================================
// CARGAR PAPELETA PARA EDITAR
// ==========================================
async function cargarPapeleta(id) {
    try {
        mostrarLoading('Cargando papeleta...');
        const papeleta = await PapeletaPermisoAPI.obtenerReporte(id);

        if (!papeleta) {
            throw new Error('Papeleta no encontrada');
        }

        // Llenar formulario
        const numero = papeleta.NUMERO_PP || papeleta.NumeroPP || '';
        document.getElementById('numero').value = numero;
        document.getElementById('numeroBadge').textContent = numero;
        document.getElementById('doi').value = papeleta.DOI_PP || papeleta.DOIPP || '';
        document.getElementById('cargo').value = papeleta.CARGO_PP || papeleta.CargoPP || '';
        document.getElementById('area').value = papeleta.AREA_PP || papeleta.AreaPP || '';
        document.getElementById('fechaPermiso').value = 
            formatearFechaInput(papeleta.FECHA_PERMISO_PP || papeleta.FechaPermisoPP);
        document.getElementById('horaSalida').value = 
            formatearHoraInput(papeleta.H_SALIDA_PP || papeleta.HSalidaPP);
        document.getElementById('horaRetorno').value = 
            formatearHoraInput(papeleta.H_RETORNO_PP || papeleta.HRetornoPP);
        document.getElementById('tiempo').value = 
            formatearHoraInput(papeleta.TIEMPO_PP || papeleta.TiempoPP);
        document.getElementById('considerar').value = 
            papeleta.CONSIDERAR_PP || papeleta.ConsiderarPP || '';
        document.getElementById('motivo').value = 
            papeleta.MOTIVO_PP || papeleta.MotivoPP || '';
        document.getElementById('observaciones').value = 
            papeleta.OBSERVACIONES_PP || papeleta.ObservacionesPP || '';

        // Actualizar contadores
        actualizarContador('motivo', 'motivoCount', 500);
        actualizarContador('observaciones', 'obsCount', 300);

        // Buscar y seleccionar trabajador
        const selectTrabajador = document.getElementById('trabajador');
        const nombreTrabajador = papeleta.TRABAJADOR_PP || papeleta.TrabajadorPP;
        for (let i = 0; i < selectTrabajador.options.length; i++) {
            if (selectTrabajador.options[i].textContent.includes(nombreTrabajador)) {
                selectTrabajador.selectedIndex = i;
                break;
            }
        }

        // Validar campos
        validarDNI();
        validarMotivo();
        actualizarProgreso();

        ocultarLoading();
        console.log('✅ Papeleta cargada para edición');
    } catch (error) {
        console.error('❌ Error al cargar papeleta:', error);
        ocultarLoading();
        mostrarError('Error al cargar la papeleta');
        setTimeout(() => {
            window.location.href = 'permisos.html';
        }, 2000);
    }
}

// ==========================================
// GUARDAR PAPELETA
// ==========================================
// En formulario-papeleta.js
async function guardarPapeleta() {
    const datos = {
        FechaRegistroPP: new Date().toISOString(),
        PcRegistroPP: obtenerNombrePC(),
        FechaModificacionPP: new Date().toISOString(),
        PcModificacionPP: obtenerNombrePC(),
        FechaEmisionPP: document.getElementById('fechaEmision').value || new Date().toISOString(),
        FechaPermisoPP: document.getElementById('fechaPermiso').value,
        NumeroPP: parseInt(document.getElementById('numeroPapeleta').value) || 0,  // ✅ CORREGIR AQUÍ
        DOIPP: document.getElementById('dni').value,
        TrabajadorPP: document.getElementById('trabajador').value,
        CargoPP: document.getElementById('cargo').value,
        AreaPP: document.getElementById('area').value,
        MotivoPP: document.getElementById('motivo').value,
        ConsiderarPP: document.getElementById('considerar').value,
        HSalidaPP: document.getElementById('horaSalida').value,
        HRetornoPP: document.getElementById('horaRetorno').value,
        TiempoPP: document.getElementById('tiempoTotal').value,
        ObservacionesPP: document.getElementById('observaciones').value,
        ActivoPP: '1'
    };

    console.log('📤 Enviando datos:', datos);

    try {
        const respuesta = await PapeletaPermisoAPI.insertar(datos);
        alert('✅ Papeleta guardada correctamente');
        limpiarFormulario();
    } catch (error) {
        console.error('❌ Error:', error);
        alert('Error al guardar: ' + error.message);
    }
}


// ==========================================
// VALIDAR FORMULARIO COMPLETO
// ==========================================
function validarFormularioCompleto() {
    let valido = true;
    let primerError = null;

    // Validar DNI
    if (!validarDNI()) {
        valido = false;
        if (!primerError) primerError = document.getElementById('doi');
    }

    // Validar trabajador
    const trabajador = document.getElementById('trabajador');
    if (!trabajador.value) {
        mostrarError('Debe seleccionar un trabajador');
        trabajador.classList.add('error');
        valido = false;
        if (!primerError) primerError = trabajador;
    }

    // Validar área
    const area = document.getElementById('area');
    if (!area.value) {
        mostrarError('Debe seleccionar un área');
        area.classList.add('error');
        valido = false;
        if (!primerError) primerError = area;
    }

    // Validar fecha
    const fechaPermiso = document.getElementById('fechaPermiso');
    if (!fechaPermiso.value) {
        mostrarError('Debe seleccionar una fecha');
        fechaPermiso.classList.add('error');
        valido = false;
        if (!primerError) primerError = fechaPermiso;
    }

    // Validar hora de salida
    const horaSalida = document.getElementById('horaSalida');
    if (!horaSalida.value) {
        mostrarError('Debe ingresar la hora de salida');
        horaSalida.classList.add('error');
        valido = false;
        if (!primerError) primerError = horaSalida;
    }

    // Validar motivo
    if (!validarMotivo()) {
        valido = false;
        if (!primerError) primerError = document.getElementById('motivo');
    }

    // Si hay error, hacer scroll al primer campo con error
    if (!valido && primerError) {
        primerError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        primerError.focus();
    }

    return valido;
}

// ==========================================
// CANCELAR
// ==========================================
function cancelar() {
    if (confirm('¿Está seguro que desea cancelar? Los cambios no guardados se perderán.')) {
        window.location.href = 'permisos.html';
    }
}

// ==========================================
// UTILIDADES
// ==========================================
function formatearFechaInput(fecha) {
    if (!fecha) return '';
    const raw = String(fecha).trim();
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatearHoraInput(hora) {
    if (!hora) return '';
    if (typeof hora === 'string' && hora.includes(':')) {
        return hora.substring(0, 5);
    }
    return hora;
}

function mostrarLoading(texto = 'Procesando...') {
    document.getElementById('loadingText').textContent = texto;
    document.getElementById('loadingOverlay').classList.add('show');
}

function ocultarLoading() {
    document.getElementById('loadingOverlay').classList.remove('show');
}

function mostrarExito(mensaje) {
    const alert = document.getElementById('alertSuccess');
    document.getElementById('mensajeSuccess').textContent = mensaje;
    alert.classList.add('show');
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    setTimeout(() => {
        alert.classList.remove('show');
    }, 5000);
}

function mostrarError(mensaje) {
    const alert = document.getElementById('alertError');
    document.getElementById('mensajeError').textContent = mensaje;
    alert.classList.add('show');
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    setTimeout(() => {
        alert.classList.remove('show');
    }, 5000);
}

console.log('✅ Formulario mejorado inicializado correctamente');
