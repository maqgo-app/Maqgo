/** Evita `https://host/api` + `/api/auth/...` → `/api/api/...` (404 en FastAPI). */
export function normalizeBackendBase(raw) {
  let s = String(raw ?? '').trim().replace(/\/+$/, '');
  if (/\/api$/i.test(s)) {
    s = s.replace(/\/api$/i, '');
  }
  return s;
}

function isLocalHostname(hostname) {
  if (!hostname) return true;
  const h = String(hostname).toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h.startsWith('127.') ||
    h.endsWith('.local')
  );
}

/**
 * Base URL del API para axios (`${BACKEND_URL}/api/...`).
 *
 * En **www.maqgo.cl / maqgo.cl** (prod): sin env, base **`https://api.maqgo.cl`** (llamada directa a Railway).
 * Antes se usaba base vacía + rewrite Vercel `/api` → mismo origen; en móvil a veces no hay respuesta HTTP.
 * `CORS_ORIGINS` en Railway debe incluir `https://www.maqgo.cl` y `https://maqgo.cl`.
 * Si `VITE_BACKEND_URL` es explícitamente `https://api*.maqgo.cl`, se respeta.
 * `VITE_FORCE_ABSOLUTE_API=true` fuerza URL absoluta del env (p. ej. depurar llamada directa a la API).
 *
 * Otros hosts: si hay `VITE_BACKEND_URL` se usa; si no, mismos fallbacks que antes.
 */
export function resolveBackendBaseUrl(rawFromEnv) {
  const raw = String(rawFromEnv ?? '').trim();
  const forceAbsolute = import.meta.env.VITE_FORCE_ABSOLUTE_API === 'true';

  if (typeof window === 'undefined') {
    if (!raw) {
      throw new Error('BACKEND URL NOT CONFIGURED');
    }
    return normalizeBackendBase(raw);
  }

  const host = (window.location.hostname || '').toLowerCase();
  const isMaqgoCl =
    import.meta.env.PROD && (host === 'www.maqgo.cl' || host === 'maqgo.cl');

  if (isMaqgoCl && !forceAbsolute) {
    const compact = raw.replace(/\/+$/, '');
    if (/^https?:\/\/api[0-9]*\.maqgo\.cl$/i.test(compact)) {
      return normalizeBackendBase(raw);
    }
    if (!compact) {
      return 'https://api.maqgo.cl';
    }
    return '';
  }

  if (raw) {
    return normalizeBackendBase(raw);
  }

  if (import.meta.env.DEV) {
    return '';
  }

  // Producción sin VITE_BACKEND_URL: no usar base vacía en hosts remotos (Vercel preview, etc.):
  // rutas relativas `/api/...` pegan al servidor estático → fallo de red en el cliente.
  // Misma API canónica que www.maqgo.cl (CORS debe incluir el origen del front en Railway).
  if (import.meta.env.PROD) {
    if (!isLocalHostname(host)) {
      return 'https://api.maqgo.cl';
    }
    return normalizeBackendBase('http://localhost:8000');
  }

  throw new Error('BACKEND URL NOT CONFIGURED');
}
