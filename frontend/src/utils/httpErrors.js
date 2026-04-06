/**
 * Mensajes HTTP/ red para UI (axios y errores típicos de fetch).
 * No exponer stack traces; priorizar `detail` del backend cuando es string legible (FastAPI).
 */

const DEFAULT_FALLBACK = 'Algo salió mal. Intenta de nuevo.';

function isLikelyHtmlString(s) {
  const t = String(s || '').trim();
  return t.startsWith('<') || /<!DOCTYPE/i.test(t) || /<html/i.test(t);
}

function normalizeDetail(data) {
  if (!data) return null;
  // Proxy/CDN a veces devuelve HTML en 502/504; no mostrar trozos de página al usuario.
  if (typeof data === 'string') {
    if (isLikelyHtmlString(data)) return null;
    const t = data.trim();
    if (t && t.length < 800) return t;
    return null;
  }
  const d = data.detail;
  if (typeof d === 'string' && d.trim()) {
    if (isLikelyHtmlString(d)) return null;
    return d.trim();
  }
  if (Array.isArray(d) && d.length > 0) {
    const first = d[0];
    if (typeof first === 'string' && first.trim()) return first.trim();
    if (first && typeof first === 'object' && typeof first.msg === 'string' && first.msg.trim()) {
      return first.msg.trim();
    }
  }
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    if (typeof d.message === 'string' && d.message.trim()) {
      return d.message.trim();
    }
    if (typeof d.msg === 'string' && d.msg.trim()) {
      return d.msg.trim();
    }
  }
  if (data.message && typeof data.message === 'string') return data.message;
  return null;
}

/**
 * Mensaje legible cuando hay respuesta HTTP pero sin `detail` JSON (p. ej. HTML de CDN 502).
 */
export function formatHttpErrorWithStatus(error) {
  const res = error?.response;
  if (!res) return null;
  const d = normalizeDetail(res.data);
  if (d) return d;
  const st = res.status;
  const txt = (res.statusText || '').trim();
  if (st === 502 || st === 503 || st === 504) {
    return `El servidor respondió con error ${st}${txt ? ` (${txt})` : ''}. Intenta de nuevo en un minuto.`;
  }
  if (st >= 400) {
    return `Error HTTP ${st}${txt ? ` (${txt})` : ''}.`;
  }
  return null;
}

/**
 * @param {unknown} error - Error de axios o Error nativo (fetch / AbortError)
 * @param {object} [options]
 * @param {string} [options.fallback]
 * @param {Record<number, string>} [options.statusMessages] - override por código (ej. 401 en login)
 * @param {boolean} [options.preferDetail=true] - usar `response.data.detail` si existe
 * @param {string} [options.networkUnavailableMessage] - si no hay `response` (axios/red), sustituye el texto genérico de “sin conexión”
 */
export function getHttpErrorMessage(error, options = {}) {
  const {
    fallback = DEFAULT_FALLBACK,
    statusMessages = {},
    preferDetail = true,
    networkUnavailableMessage
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
      return (
        networkUnavailableMessage ||
        'Sin conexión o el servidor no responde. Verifica tu internet.'
      );
    }
    return fallback;
  }

  const status = res.status;
  if (statusMessages[status]) return statusMessages[status];

  const data = res.data;
  if (preferDetail) {
    const detail = normalizeDetail(data);
    if (detail) {
      // FastAPI devuelve detail "Not Found" en inglés para rutas inexistentes; mejor UX en español.
      if (status === 404 && /^not found$/i.test(String(detail).trim())) {
        return 'No encontramos lo que buscabas.';
      }
      return detail;
    }
  }

  if (status === 401) return 'Credenciales incorrectas o sesión expirada.';
  if (status === 403) return 'No tienes permiso para esta acción.';
  if (status === 404) return 'No encontramos lo que buscabas.';
  if (status === 429) return 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.';
  if (status === 422 || status === 400) return normalizeDetail(data) || fallback;
  if (status >= 500) {
    const d = preferDetail ? normalizeDetail(data) : null;
    if (d) return d;
    // Proxy/CDN suele devolver HTML o cuerpo vacío en 502/503/504
    if (status === 502 || status === 503 || status === 504) {
      return 'El servicio no respondió a tiempo. Revisa tu conexión e intenta en unos minutos.';
    }
    return 'Error del servidor. Intenta más tarde.';
  }

  return fallback;
}
