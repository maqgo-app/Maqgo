/**
 * Mensajes HTTP/ red para UI (axios y errores típicos de fetch).
 * No exponer stack traces; priorizar `detail` del backend cuando es string legible (FastAPI).
 */

const DEFAULT_FALLBACK = 'Algo salió mal. Intenta de nuevo.';

function normalizeDetail(data) {
  if (!data) return null;
  const d = data.detail;
  if (typeof d === 'string' && d.trim()) return d.trim();
  if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg);
  if (data.message && typeof data.message === 'string') return data.message;
  return null;
}

/**
 * @param {unknown} error - Error de axios o Error nativo (fetch / AbortError)
 * @param {object} [options]
 * @param {string} [options.fallback]
 * @param {Record<number, string>} [options.statusMessages] - override por código (ej. 401 en login)
 * @param {boolean} [options.preferDetail=true] - usar `response.data.detail` si existe
 */
export function getHttpErrorMessage(error, options = {}) {
  const {
    fallback = DEFAULT_FALLBACK,
    statusMessages = {},
    preferDetail = true
  } = options;

  if (!error) return fallback;

  if (error.name === 'AbortError') {
    return 'La solicitud tardó demasiado. Intenta de nuevo.';
  }

  const msg = String(error.message || '');
  if (error.code === 'ECONNABORTED' || msg.includes('timeout')) {
    return 'El servidor tardó demasiado en responder. Revisa tu conexión.';
  }

  const isFetchNetwork =
    error.name === 'TypeError' && /failed to fetch|network|load failed/i.test(msg);

  const res = error.response;
  if (!res) {
    if (error.request || isFetchNetwork) {
      return 'Sin conexión o el servidor no responde. Verifica tu internet.';
    }
    return fallback;
  }

  const status = res.status;
  if (statusMessages[status]) return statusMessages[status];

  const data = res.data;
  if (preferDetail) {
    const detail = normalizeDetail(data);
    if (detail) return detail;
  }

  if (status === 401) return 'Credenciales incorrectas o sesión expirada.';
  if (status === 403) return 'No tienes permiso para esta acción.';
  if (status === 404) return 'No encontramos lo que buscabas.';
  if (status === 422 || status === 400) return normalizeDetail(data) || fallback;
  if (status >= 500) return 'Error del servidor. Intenta más tarde.';

  return fallback;
}
