/**
 * Safe localStorage parsing - evita crashes por JSON corrupto
 * MVP: prevenir errores irreversibles si el usuario manipula localStorage
 * Buena práctica: usar getObject/getArray para leer datos de sesión o sensibles en lugar de JSON.parse(localStorage.getItem(...)) directo.
 */

/**
 * Parsea JSON de forma segura. Si falla, retorna defaultValue.
 * @param {string} key - Clave de localStorage
 * @param {*} defaultValue - Valor por defecto si falla el parse
 * @returns {*}
 */
export function getJSON(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return defaultValue;
    if (raw === 'undefined' || raw === 'null') return defaultValue;
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

/**
 * Obtiene un string y lo parsea como JSON (objeto o array).
 * Para objetos: defaultValue = {}
 * Para arrays: defaultValue = []
 */
export function getObject(key, defaultValue = {}) {
  const parsed = getJSON(key, defaultValue);
  return parsed && typeof parsed === 'object' ? parsed : defaultValue;
}

export function getArray(key, defaultValue = []) {
  const parsed = getJSON(key, defaultValue);
  return Array.isArray(parsed) ? parsed : defaultValue;
}

/**
 * Obtiene el primer objeto no vacío de varias claves (ej. acceptedRequest o incomingRequest).
 * @param {string[]} keys - Claves a intentar en orden
 * @param {object} defaultValue - Valor si ninguna tiene datos
 */
export function getObjectFirst(keys, defaultValue = {}) {
  for (const key of keys) {
    const obj = getObject(key, {});
    if (obj && typeof obj === 'object' && Object.keys(obj).length > 0) return obj;
  }
  return defaultValue;
}
