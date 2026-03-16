/**
 * Utilidad centralizada para API
 * - Timeouts para evitar esperas indefinidas
 * - Token Bearer en headers para rutas protegidas
 * - Manejo de 401 → logout y redirect a login
 */

import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const DEFAULT_TIMEOUT_MS = 8000;

// Timeout global para todas las peticiones axios
axios.defaults.timeout = DEFAULT_TIMEOUT_MS;

if (process.env.NODE_ENV === 'development' && !process.env.REACT_APP_BACKEND_URL) {
  console.warn('⚠️ REACT_APP_BACKEND_URL no definido. Usando:', BACKEND_URL);
}

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

function handle401() {
  localStorage.removeItem('token');
  localStorage.removeItem('userId');
  localStorage.removeItem('userRole');
  localStorage.removeItem('providerRole');
  if (window.location.pathname !== '/login' && !window.location.pathname.startsWith('/register')) {
    window.location.href = '/login?expired=1';
  }
}

/**
 * fetch con token Bearer.
 * @param {Object} options - fetch options. redirectOn401=true (default) limpia sesión y redirige a login en 401.
 */
export async function fetchWithAuth(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const { redirectOn401 = true, ...fetchOpts } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { ...(fetchOpts.headers || {}), ...getAuthHeaders() };
  try {
    const res = await fetch(url, { ...fetchOpts, headers, signal: controller.signal });
    clearTimeout(id);
    if (res.status === 401 && redirectOn401) {
      handle401();
      throw new Error('Sesión expirada');
    }
    return res;
  } catch (e) {
    clearTimeout(id);
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

// Interceptor axios: añadir token y manejar 401
axios.interceptors.request.use((config) => {
  const auth = getAuthHeaders();
  if (Object.keys(auth).length) config.headers.Authorization = auth.Authorization;
  return config;
});
axios.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      handle401();
    }
    return Promise.reject(err);
  }
);

export { getAuthHeaders };
export default BACKEND_URL;
