// ==========================================
// VALIDACIONES
// ==========================================

function validarFormularioPapeleta(datos) {
  const errores = [];
  
  if (!datos.fechaPermiso) {
    errores.push('La fecha del permiso es obligatoria');
  }
  
  if (!datos.doi || datos.doi.length < 8) {
    errores.push('El DNI debe tener al menos 8 caracteres');
  }
  
  if (!datos.trabajador || datos.trabajador.trim() === '') {
    errores.push('El nombre del trabajador es obligatorio');
  }
  
  if (!datos.motivo || datos.motivo.trim() === '') {
    errores.push('El motivo del permiso es obligatorio');
  }
  
  return {
    valido: errores.length === 0,
    errores: errores
  };
}

function validarHora(hora) {
  const regexHHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return regexHHMM.test(hora);
}

function validarDNI(dni) {
  return /^\d{8}$/.test(dni);
}

console.log('✅ Validators loaded');
