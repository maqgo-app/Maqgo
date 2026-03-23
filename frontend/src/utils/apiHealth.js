/**
 * Diagnóstico de conectividad al backend (sin token).
 * Útil para distinguir DNS/caída vs errores en rutas autenticadas.
 */

const DEMO_BYPASS_KEY = 'maqgo_admin_demo_bypass';

export function getAdminDemoBypass() {
  try {
    return sessionStorage.getItem(DEMO_BYPASS_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAdminDemoBypass(on) {
  try {
    if (on) sessionStorage.setItem(DEMO_BYPASS_KEY, '1');
    else sessionStorage.removeItem(DEMO_BYPASS_KEY);
  } catch {
    /* private mode */
  }
}

export function clearAdminDemoBypass() {
  setAdminDemoBypass(false);
}

/** Host configurado en build (sin path; para mostrar al dueño sin filtrar secretos). */
export function maskBackendHost(baseUrl) {
  if (!baseUrl || typeof baseUrl !== 'string') return '(sin URL en build)';
  const t = baseUrl.trim();
  try {
    const u = new URL(t.startsWith('http') ? t : `https://${t}`);
    return u.host || t.slice(0, 48);
  } catch {
    return t.replace(/^https?:\/\//i, '').split('/')[0].slice(0, 48) || '(URL inválida)';
  }
}

/**
 * @returns {{ ok: boolean, status: number|null, latencyMs: number|null, error: 'network'|'timeout'|'http'|null }}
 */
export async function pingBackendHealth(baseUrl, timeoutMs = 6000) {
  const clean = String(baseUrl || '').replace(/\/$/, '');
  if (!clean) {
    return { ok: false, status: null, latencyMs: null, error: 'network' };
  }
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    const res = await fetch(`${clean}/healthz`, {
      method: 'GET',
      signal: controller.signal,
      mode: 'cors',
      cache: 'no-store',
    });
    clearTimeout(id);
    const latencyMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started
    );
    return {
      ok: res.ok,
      status: res.status,
      latencyMs,
      error: res.ok ? null : 'http',
    };
  } catch (e) {
    clearTimeout(id);
    const name = e?.name === 'AbortError' ? 'timeout' : 'network';
    return { ok: false, status: null, latencyMs: null, error: name };
  }
}
