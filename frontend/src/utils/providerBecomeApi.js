/**
 * Alta mínima cliente → proveedor (POST /api/users/become-provider).
 * Única implementación compartida: ProviderRegisterScreen (backup OTP) y MachineDataScreen (machine-first).
 */
import axios from 'axios';
import BACKEND_URL from './api';
import { splitNombreCompletoProveedor } from './providerRegisterSplit';

const AUTH_FLOW_TIMEOUT_MS = 60000;
const JSON_POST = {
  timeout: AUTH_FLOW_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
};

/** API canónica; en www a veces falla solo directo o solo mismo origen (rewrite). */
const MAQGO_API_ORIGIN = 'https://api.maqgo.cl';

function becomeProviderEndpointUrl(base) {
  const b = String(base ?? '').replace(/\/+$/, '');
  return `${b}/api/users/become-provider`;
}

/** URL resuelta para logs (misma base que ProviderRegisterScreen). */
export function getBecomeProviderUrlForLogs() {
  return becomeProviderEndpointUrl(BACKEND_URL);
}

async function postWithTransportRetry(urlBuilder, payload, extraHeaders = {}) {
  const primary = urlBuilder(BACKEND_URL);
  try {
    return await axios.post(primary, payload, {
      ...JSON_POST,
      headers: { ...JSON_POST.headers, ...extraHeaders },
    });
  } catch (firstErr) {
    if (firstErr.response) throw firstErr;
    const host =
      typeof window !== 'undefined' ? String(window.location.hostname || '').toLowerCase() : '';
    const isMaqgoWww =
      import.meta.env.PROD && (host === 'www.maqgo.cl' || host === 'maqgo.cl');
    if (!isMaqgoWww) throw firstErr;
    const current = String(BACKEND_URL || '').replace(/\/+$/, '');
    const alternate = current === MAQGO_API_ORIGIN ? '' : MAQGO_API_ORIGIN;
    console.warn('PROVIDER_API_RETRY alternate_transport', {
      failedUrl: firstErr.config?.url || primary,
      to: alternate || '(same-origin /api)',
    });
    try {
      return await axios.post(urlBuilder(alternate), payload, {
        ...JSON_POST,
        headers: { ...JSON_POST.headers, ...extraHeaders },
      });
    } catch (secondErr) {
      if (secondErr.response) throw secondErr;
      firstErr.PROVIDER_REGISTER_ALSO_FAILED = true;
      throw firstErr;
    }
  }
}

export function hasProviderRoleInStorage() {
  try {
    const raw = localStorage.getItem('userRoles');
    const roles = raw ? JSON.parse(raw) : [];
    const ur = localStorage.getItem('userRole');
    return (
      (Array.isArray(roles) && roles.includes('provider')) ||
      ur === 'provider' ||
      ur === 'owner' ||
      ur === 'manager'
    );
  } catch {
    return false;
  }
}

/**
 * @param {{ email: string, password: string, celular?: string, nombreMostrar?: string }} payload
 * `celular` opcional: el backend valida contra el teléfono del usuario autenticado en BD.
 */
export async function submitBecomeProviderMinimal(payload) {
  const token = (localStorage.getItem('token') || localStorage.getItem('authToken') || '').trim();
  const lsUserId = (localStorage.getItem('userId') || '').trim();
  if (!token || !lsUserId) {
    const err = new Error(
      'No hay sesión. Vuelve atrás y verifica el código SMS, o recarga la página.'
    );
    err.code = 'NO_SESSION';
    throw err;
  }
  const nm = String(payload.nombreMostrar || '').trim();
  const provider_data = {};
  if (nm) {
    const { nombre, apellido } = splitNombreCompletoProveedor(nm);
    provider_data.nombre_completo = nm;
    provider_data.nombre = nombre;
    provider_data.apellido = apellido;
  }
  const body = {
    email: String(payload.email || '').trim(),
    password: payload.password,
    ...(Object.keys(provider_data).length ? { provider_data } : {}),
  };
  const celRaw = payload.celular != null ? String(payload.celular).trim() : '';
  if (celRaw) {
    body.celular = celRaw;
  }
  return postWithTransportRetry(becomeProviderEndpointUrl, body, {
    Authorization: `Bearer ${token}`,
  });
}
