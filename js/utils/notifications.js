// ==========================================
// NOTIFICACIONES
// ==========================================

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

function mostrarConfirmacion(titulo, mensaje) {
  return Swal.fire({
    title: titulo,
    text: mensaje,
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#28a745',
    cancelButtonColor: '#dc3545',
    confirmButtonText: 'Sí, confirmar',
    cancelButtonText: 'Cancelar'
  });
}

function mostrarCargando(mensaje = 'Cargando...') {
  Swal.fire({
    title: mensaje,
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });
}

function cerrarCargando() {
  Swal.close();
}

console.log('✅ Notifications loaded');
