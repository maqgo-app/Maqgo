/**
 * Base del API: solo REACT_APP_BACKEND_URL (Vercel / .env). Sin fallback ni detección de host.
 * El resto del archivo (axios, interceptores, fetchWith*) es obligatorio para la app; no puede
 * reducirse a solo export default sin romper imports.
 */
import axios from 'axios';

const rawBackend = process.env.REACT_APP_BACKEND_URL;
if (!rawBackend || String(rawBackend).trim() === '') {
  throw new Error('BACKEND URL NOT CONFIGURED');
}
/** Sin barra final: `${BACKEND_URL}/api/...` */
const BACKEND_URL = String(rawBackend).trim().replace(/\/+$/, '');

const DEFAULT_TIMEOUT_MS = 20000;
axios.defaults.timeout = DEFAULT_TIMEOUT_MS;

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/** Rutas donde no debe enviarse Bearer (login/register con token viejo en LS rompe o confunde el backend). */
function isPublicAuthRequestUrl(url) {
  const u = String(url || '');
  return (
    u.includes('/api/auth/login') ||
    u.includes('/api/auth/register') ||
    u.includes('/api/auth/send-otp') ||
    u.includes('/api/auth/verify-otp') ||
    u.includes('/api/auth/verify-sms') ||
    u.includes('/api/auth/resend-code') ||
    u.includes('/api/auth/password-reset/request') ||
    u.includes('/api/auth/password-reset/confirm') ||
    u.includes('/api/communications/sms/send-otp') ||
    u.includes('/api/communications/sms/verify-otp')
  );
}

/** Limpia sesión local (token + roles). Usar al cerrar sesión o tras 401. */
export function clearLocalSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('userId');
  localStorage.removeItem('userRole');
  localStorage.removeItem('userRoles');
  localStorage.removeItem('providerRole');
  localStorage.removeItem('ownerId');
}

function handle401() {
  clearLocalSession();
  if (window.location.pathname !== '/login' && !window.location.pathname.startsWith('/register')) {
    window.location.href = '/login?expired=1';
  }
}

/**
 * fetch con token Bearer.
 * @param {Object} options - fetch options. redirectOn401=true (default) limpia sesión y redirige a login en 401.
 */
export async function fetchWithAuth(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const { redirectOn401 = true, signal: outerSignal, ...fetchOpts } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  const abortBoth = () => controller.abort();
  if (outerSignal) {
    if (outerSignal.aborted) abortBoth();
    else outerSignal.addEventListener('abort', abortBoth, { once: true });
  }
  const headers = { ...(fetchOpts.headers || {}), ...getAuthHeaders() };
  try {
    const res = await fetch(url, { ...fetchOpts, headers, signal: controller.signal });
    clearTimeout(id);
    if (outerSignal) outerSignal.removeEventListener('abort', abortBoth);
    if (res.status === 401 && redirectOn401) {
      handle401();
      throw new Error('Sesión expirada');
    }
    return res;
  } catch (e) {
    clearTimeout(id);
    if (outerSignal) outerSignal.removeEventListener('abort', abortBoth);
    if (e?.name === 'AbortError') {
      const abortErr = new Error('Tiempo de espera agotado');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    throw e;
  }
}

/**
 * fetch con timeout (sin auth) - para rutas públicas
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

axios.interceptors.request.use((config) => {
  const url = config.url || '';
  if (isPublicAuthRequestUrl(url)) return config;
  const auth = getAuthHeaders();
  if (Object.keys(auth).length) config.headers.Authorization = auth.Authorization;
  return config;
});
axios.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      const reqUrl = err.config?.url || '';
      const isPublicAuthFlow =
        reqUrl.includes('/api/auth/login') ||
        reqUrl.includes('/api/auth/register') ||
        reqUrl.includes('/api/auth/password-reset/') ||
        reqUrl.includes('/api/auth/verify-otp') ||
        reqUrl.includes('/api/auth/verify-sms') ||
        reqUrl.includes('/api/auth/forgot') ||
        reqUrl.includes('/api/auth/password-reset');

      if (!isPublicAuthFlow) handle401();
    }
    return Promise.reject(err);
  }
);

export { getAuthHeaders };
export default BACKEND_URL;
