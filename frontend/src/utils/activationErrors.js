import { normalizeDetail } from './httpErrors';

export const ACTIVATION_UNDETERMINED_MESSAGE = 'No se pudo activar el código. Intenta nuevamente.';

const LEGACY_UNDETERMINED_MESSAGE =
  'No fue posible determinar la causa del error. Inténtalo nuevamente o contacta a soporte.';
const INTERNAL_ERROR_PREFIX = 'Error interno:';

export function getActivationErrorMessage(error) {
  if (!error) return ACTIVATION_UNDETERMINED_MESSAGE;

  if (error.name === 'AbortError') {
    return ACTIVATION_UNDETERMINED_MESSAGE;
  }

  const msg = String(error.message || '');
  if (error.code === 'ECONNABORTED' || msg.includes('timeout')) {
    return ACTIVATION_UNDETERMINED_MESSAGE;
  }

  const res = error.response;
  if (!res) return ACTIVATION_UNDETERMINED_MESSAGE;

  const detail = normalizeDetail(res.data);

  const status = Number(res.status || 0);
  if (status >= 500) {
    const d = String(detail || '').trim();
    if (d && d.startsWith(INTERNAL_ERROR_PREFIX)) return d;
    return ACTIVATION_UNDETERMINED_MESSAGE;
  }

  if (detail) {
    const d = String(detail || '').trim();
    if (d === LEGACY_UNDETERMINED_MESSAGE) return ACTIVATION_UNDETERMINED_MESSAGE;
    return d;
  }

  return ACTIVATION_UNDETERMINED_MESSAGE;
}
