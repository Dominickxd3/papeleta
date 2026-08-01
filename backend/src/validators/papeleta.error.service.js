const getFriendlySqlErrorMessage = (error) => {
  const raw = String(error?.message || '').trim();
  if (!raw) return 'Ocurrio un error inesperado.';

  const isDuplicateKey =
    Number(error?.number) === 2601 ||
    Number(error?.number) === 2627 ||
    /Cannot insert duplicate key row/i.test(raw);

  if (isDuplicateKey && /UX_Papeleta_Trabajador_Fecha_Activa/i.test(raw)) {
    return 'Ya existe una papeleta activa para este trabajador en la fecha seleccionada.';
  }

  return raw;
};

module.exports = {
  getFriendlySqlErrorMessage
};
