function convertirHoraSQL(horaString, nombreCampo = 'hora') {
  if (!horaString || String(horaString).trim() === '') {
    console.warn(`⚠️ ${nombreCampo} vacío, devolviendo null`);
    return null;
  }

  const h = String(horaString).trim();
  const regexHHMMSS = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;
  const regexHHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

  let horaFinal;
  if (regexHHMMSS.test(h)) horaFinal = h;
  else if (regexHHMM.test(h)) horaFinal = `${h}:00`;
  else throw new Error(`${nombreCampo}: Formato inválido "${h}". Use HH:MM o HH:MM:SS`);

  const [hh, mm, ss] = horaFinal.split(':').map(Number);
  const dateObj = new Date(Date.UTC(1970, 0, 1, hh, mm, ss));
  if (isNaN(dateObj.getTime())) {
    throw new Error(`${nombreCampo}: No se pudo convertir "${horaFinal}" a Date`);
  }
  return dateObj;
}

module.exports = { convertirHoraSQL };
