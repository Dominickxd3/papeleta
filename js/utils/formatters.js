// ==========================================
// FORMATTERS - Funciones de formato
// ==========================================

function formatearFecha(fecha) {
  if (!fecha) return '-';
  
  try {
    const raw = String(fecha).trim();
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;

    const date = new Date(fecha);
    if (isNaN(date.getTime())) return '-';

    const dia = String(date.getDate()).padStart(2, '0');
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const anio = date.getFullYear();

    return `${dia}/${mes}/${anio}`;
  } catch (error) {
    return '-';
  }
}

function formatearFechaCorta(fecha) {
  if (!fecha) return '-';
  
  try {
    const raw = String(fecha).trim();
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;

    const date = new Date(fecha);
    if (isNaN(date.getTime())) return '-';

    const dia = String(date.getDate()).padStart(2, '0');
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const anio = date.getFullYear();

    return `${dia}/${mes}/${anio}`;
  } catch (error) {
    return '-';
  }
}

function formatearFechaHora(fecha) {
  if (!fecha) return '-';
  
  try {
    const date = new Date(fecha);
    if (isNaN(date.getTime())) return '-';
    
    const dia = String(date.getDate()).padStart(2, '0');
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const anio = date.getFullYear();
    const hora = String(date.getHours()).padStart(2, '0');
    const minuto = String(date.getMinutes()).padStart(2, '0');
    
    return `${dia}/${mes}/${anio} ${hora}:${minuto}`;
  } catch (error) {
    return '-';
  }
}

function formatearHora(hora) {
  if (!hora) return '00:00';
  
  try {
    // Si es un string simple "08:00:00" o "14:30"
    if (typeof hora === 'string') {
      // Extraer solo HH:MM
      const partes = hora.split(':');
      if (partes.length >= 2) {
        return `${partes[0].padStart(2, '0')}:${partes[1].padStart(2, '0')}`;
      }
      
      // Si viene con fecha completa "1970-01-01T08:00:00.000Z"
      if (hora.includes('T')) {
        const date = new Date(hora);
        if (!isNaN(date.getTime())) {
          const h = String(date.getHours()).padStart(2, '0');
          const m = String(date.getMinutes()).padStart(2, '0');
          return `${h}:${m}`;
        }
      }
    }
    
    // Si es un objeto Date
    if (hora instanceof Date && !isNaN(hora.getTime())) {
      const h = String(hora.getHours()).padStart(2, '0');
      const m = String(hora.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    }
    
    return '00:00';
  } catch (error) {
    return '00:00';
  }
}

function formatearHoraCorta(hora) {
  if (!hora) return '00:00 AM';
  
  try {
    let h24, m;
    
    // Si es un string con formato ISO "1970-01-01T15:52:00.000Z"
    if (typeof hora === 'string' && (hora.includes('T') || hora.includes('Z'))) {
      const date = new Date(hora);
      if (!isNaN(date.getTime())) {
        h24 = date.getUTCHours();
        m = date.getUTCMinutes();
      }
    }
    
    // Si es un string simple "08:00:00" o "14:30"
    else if (typeof hora === 'string' && hora.includes(':')) {
      const partes = hora.split(':');
      if (partes.length >= 2) {
        h24 = parseInt(partes[0]);
        m = parseInt(partes[1]);
      }
    }
    
    // Si es un objeto Date
    else if (hora instanceof Date && !isNaN(hora.getTime())) {
      h24 = hora.getHours();
      m = hora.getMinutes();
    }
    
    if (h24 !== undefined && m !== undefined) {
      const mStr = String(m).padStart(2, '0');
      
      // Formato AM/PM
      const periodo = h24 >= 12 ? 'PM' : 'AM';
      const h12 = h24 % 12 || 12;
      
      // Retornar con AM/PM
      return `${String(h12).padStart(2, '0')}:${mStr} ${periodo}`;
    }
    
    return '00:00 AM';
  } catch (error) {
    console.warn('⚠️ Error al formatear hora:', hora, error);
    return '00:00 AM';
  }
}

function formatearHora24(hora) {
  if (!hora) return '00:00';
  
  try {
    // Si es un string con formato ISO "1970-01-01T15:52:00.000Z"
    if (typeof hora === 'string' && (hora.includes('T') || hora.includes('Z'))) {
      const date = new Date(hora);
      if (!isNaN(date.getTime())) {
        const h = String(date.getUTCHours()).padStart(2, '0');
        const m = String(date.getUTCMinutes()).padStart(2, '0');
        return `${h}:${m}`;
      }
    }
    
    // Si ya es formato simple "08:00" o "14:30"
    if (typeof hora === 'string' && hora.includes(':')) {
      const partes = hora.split(':');
      if (partes.length >= 2) {
        return `${partes[0].padStart(2, '0')}:${partes[1].padStart(2, '0')}`;
      }
    }
    
    return '00:00';
  } catch (error) {
    return '00:00';
  }
}

function formatearFechaInput(fecha) {
  if (!fecha) return '';
  
  try {
    const raw = String(fecha).trim();
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;

    const date = new Date(fecha);
    if (isNaN(date.getTime())) return '';
    
    const anio = date.getFullYear();
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    
    return `${anio}-${mes}-${dia}`;
  } catch (error) {
    return '';
  }
}

function formatearHoraInput(hora) {
  if (!hora) return '';
  
  try {
    // Si es un string con formato ISO "1970-01-01T15:52:00.000Z"
    if (typeof hora === 'string' && (hora.includes('T') || hora.includes('Z'))) {
      const date = new Date(hora);
      if (!isNaN(date.getTime())) {
        const h = String(date.getUTCHours()).padStart(2, '0');
        const m = String(date.getUTCMinutes()).padStart(2, '0');
        return `${h}:${m}`;
      }
    }
    
    // Si ya es formato simple
    if (typeof hora === 'string' && hora.includes(':')) {
      const partes = hora.split(':');
      if (partes.length >= 2) {
        return `${partes[0].padStart(2, '0')}:${partes[1].padStart(2, '0')}`;
      }
    }
    
    return '';
  } catch (error) {
    return '';
  }
}

function obtenerIniciales(nombreCompleto) {
  if (!nombreCompleto) return '??';
  
  const partes = nombreCompleto.trim().split(' ').filter(p => p.length > 0);
  
  if (partes.length === 0) return '??';
  if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
  
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

function calcularTiempoEntre(horaInicio, horaFin) {
  if (!horaInicio || !horaFin) return '00:00';
  
  try {
    const [h1, m1] = horaInicio.split(':').map(Number);
    const [h2, m2] = horaFin.split(':').map(Number);
    
    let minutosTotales = (h2 * 60 + m2) - (h1 * 60 + m1);
    
    if (minutosTotales < 0) {
      minutosTotales += 24 * 60; // Suma 24 horas si es negativo
    }
    
    const horas = Math.floor(minutosTotales / 60);
    const minutos = minutosTotales % 60;
    
    return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
  } catch (error) {
    return '00:00';
  }
}

console.log('✅ Formatters loaded');
