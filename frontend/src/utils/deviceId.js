/**
 * Identificador estable por navegador/dispositivo (trusted_devices / login por riesgo).
 * No es secreto; lo valida el servidor.
 *
 * Persistencia:
 * - localStorage (principal)
 * - sessionStorage (espejo: si localStorage falla al escribir o en algunos modos restrictivos,
 *   la misma pestaña suele conservar sessionStorage → mismo id al recargar en esa pestaña)
 * - variable de módulo: misma sesión JS si ambos storages fallan (p. ej. modo privado estricto)
 *
 * clearLocalSession / logout no borran esta clave.
 */
const KEY = 'maqgo_device_id';

/** @type {string | null} */
let memoryId = null;

function readStored() {
  try {
    return localStorage.getItem(KEY) || sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function writeMirrors(id) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* noop */
  }
  try {
    sessionStorage.setItem(KEY, id);
  } catch {
    /* noop */
  }
}

export function getDeviceId() {
  if (memoryId) {
    return memoryId;
  }

  let id = readStored();
  if (!id || String(id).length < 8) {
    id = crypto.randomUUID();
  }

  writeMirrors(id);
  memoryId = id;
  return id;
}

/**
 * Solo lectura: id persistido sin crear uno nuevo (p. ej. confianza de dispositivo en flujo proveedor).
 * @returns {string | null}
 */
export function readPersistedDeviceId() {
  try {
    const fromLs = localStorage.getItem(KEY);
    if (fromLs && String(fromLs).length >= 8) return fromLs;
    const fromSs = sessionStorage.getItem(KEY);
    if (fromSs && String(fromSs).length >= 8) return fromSs;
  } catch {
    /* ignore */
  }
  return null;
}
