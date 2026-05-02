import axios from 'axios';
import { resolveBackendBaseUrl } from './apiNormalize.js';
import { traceRedirectToLogin } from './traceLoginRedirect.js';

// Base resuelta en apiNormalize (www.maqgo.cl prod → https://api.maqgo.cl salvo env api*.maqgo.cl).
const rawBackend =
  import.meta.env.VITE_BACKEND_URL ||
  import.meta.env.REACT_APP_BACKEND_URL ||
  process.env.REACT_APP_BACKEND_URL ||
  '';

const BACKEND_URL = resolveBackendBaseUrl(rawBackend);

const DEFAULT_TIMEOUT_MS = 20000;
axios.defaults.timeout = DEFAULT_TIMEOUT_MS;

function getUserBearerToken() {
  return (localStorage.getItem('token') || localStorage.getItem('authToken') || '').trim();
}

/** Misma regla que las peticiones autenticadas: `token` o `authToken` (login guarda ambos). */
function hasPersistedSessionCredentials() {
  const userId = localStorage.getItem('userId');
  return Boolean(userId && getUserBearerToken());
}

function getAdminBearerToken() {
  return (
    (localStorage.getItem('adminToken') ||
      localStorage.getItem('adminAuthToken') ||
      '').trim()
  );
}

export function hasPersistedAdminSessionCredentials() {
  const userId = localStorage.getItem('adminUserId');
  return Boolean(userId && getAdminBearerToken());
}

function isAdminPath() {
  try {
    return (
      typeof window !== 'undefined' &&
      String(window.location.pathname || '').startsWith('/admin')
    );
  } catch {
    return false;
  }
}

function getBearerTokenForCurrentSection() {
  return isAdminPath() ? getAdminBearerToken() : getUserBearerToken();
}

function getAuthHeaders() {
  const token = getBearerTokenForCurrentSection();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/** Rutas donde no debe enviarse Bearer (login/register con token viejo en LS rompe o confunde el backend). */
function isPublicAuthRequestUrl(url) {
  const u = String(url || '');
  return (
    u.includes('/api/auth/login-sms/') ||
    u.includes('/api/auth/login') ||
    u.includes('/api/auth/provider-register-status') ||
    u.includes('/api/auth/provider-register/establish-session') ||
    u.includes('/api/auth/register') ||
    u.includes('/api/auth/send-otp') ||
    u.includes('/api/auth/verify-otp') ||
    u.includes('/api/auth/verify-sms') ||
    u.includes('/api/auth/resend-code') ||
    u.includes('/api/auth/password-reset/request') ||
    u.includes('/api/auth/password-reset/confirm') ||
    u.includes('/api/auth/check-device') ||
    u.includes('/api/communications/sms/send-otp') ||
    u.includes('/api/communications/sms/verify-otp')
  );
}

/** Limpia sesión local (token + roles). Usar al cerrar sesión o tras 401. */
export function clearLocalSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('authToken');
  localStorage.removeItem('userPhone');
  localStorage.removeItem('userId');
  localStorage.removeItem('userRole');
  localStorage.removeItem('userRoles');
  localStorage.removeItem('providerRole');
  localStorage.removeItem('ownerId');
}

export function clearAdminSession() {
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminAuthToken');
  localStorage.removeItem('adminUserId');
  localStorage.removeItem('adminEmail');
  localStorage.removeItem('adminRoles');
  localStorage.removeItem('adminMustChangePassword');
}

function shouldRedirectToLoginOn401() {
  const p = window.location.pathname || '';
  if (p === '/login') return false;
  // /register legacy y registro proveedor: no recargar toda la app (móvil pierde foco en contraseña).
  if (p.startsWith('/register') || p.startsWith('/provider/register')) return false;
  return true;
}

function handle401() {
  const p = window.location.pathname || '';
  if (p.startsWith('/admin')) {
    clearAdminSession();
    window.location.href = '/admin?expired=1';
    return;
  }
  clearLocalSession();
  if (shouldRedirectToLoginOn401()) {
    traceRedirectToLogin('src/utils/api.js (handle401 → window.location)');
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
  if (isPublicAuthRequestUrl(url)) {
    // Nunca enviar Bearer en login/OTP/registro: un JWT viejo en localStorage puede hacer fallar o confundir al backend.
    const h = config.headers;
    if (h) {
      if (typeof h.delete === 'function') {
        h.delete('Authorization');
        h.delete('authorization');
      } else {
        delete h.Authorization;
        delete h.authorization;
      }
    }
    return config;
  }
  const auth = getAuthHeaders();
  if (Object.keys(auth).length) config.headers.Authorization = auth.Authorization;
  return config;
});
axios.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      const reqUrl = err.config?.url || '';
      // Misma lista que request (sin Bearer): no limpiar sesión en OTP/registro/SMS por 401 puntual.
      const isPublic =
        isPublicAuthRequestUrl(reqUrl) || reqUrl.includes('/api/auth/forgot');
      if (!isPublic) handle401();
    }
    return Promise.reject(err);
  }
);

export { getAuthHeaders, hasPersistedSessionCredentials };
export default BACKEND_URL;
