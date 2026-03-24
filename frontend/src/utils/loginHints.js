/**
 * Prefill seguro del login: evita RUT u otros datos en el campo “correo”.
 */
import { validateEmail } from './chileanValidation';
import { getObject } from './safeStorage';

function normalizeRutish(s) {
  return String(s || '')
    .replace(/\./g, '')
    .replace(/-/g, '')
    .toUpperCase()
    .trim();
}

/** true si parece correo válido para MAQGO (no RUT copiado por error). */
export function getLoginEmailPrefill() {
  try {
    const last = localStorage.getItem('maqgo_last_login_email');
    if (last && validateEmail(last.trim()) === '') {
      return last.trim();
    }
  } catch {
    /* storage */
  }
  const reg = getObject('registerData', {});
  const em = (reg.email || '').trim();
  if (!em || validateEmail(em) !== '') return '';
  const rutN = normalizeRutish(reg.rut);
  const emN = normalizeRutish(em);
  if (rutN && emN === rutN) return '';
  return em;
}

export function rememberLoginEmail(email) {
  const t = (email || '').trim();
  if (t && validateEmail(t) === '') {
    try {
      localStorage.setItem('maqgo_last_login_email', t);
    } catch {
      /* ignore */
    }
  }
}
