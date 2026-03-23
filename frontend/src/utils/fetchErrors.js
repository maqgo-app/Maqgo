/**
 * Mensaje legible para fallos de red en fetch (evita solo "Failed to fetch").
 */
export function friendlyFetchError(err, fallback = 'Error de conexión') {
  const m = err && err.message ? String(err.message) : '';
  const low = m.toLowerCase();
  if (err?.name === 'AbortError' || low.includes('aborted') || low.includes('timeout')) {
    return 'El servidor tardó demasiado en responder. Reintenta en unos segundos.';
  }
  if (m === 'Failed to fetch' || err?.name === 'TypeError') {
    return 'Sin respuesta del servidor. Revisa que el backend esté en línea y REACT_APP_BACKEND_URL (Vercel) apunte al API con HTTPS.';
  }
  if (m === 'Sesión expirada') return m;
  return m || fallback;
}

/** True si el listado admin es el fallback local (no hay API / sesión inválida para mutaciones). */
export function isDemoServiceId(id) {
  if (id == null) return false;
  return String(id).startsWith('demo-');
}
