/**
 * Helpers de formato compartidos (precio, fecha).
 * Usar en pantallas que muestren montos o fechas.
 */

/**
 * Formatea precio en CLP (Chile).
 * @param {number} price
 * @returns {string}
 */
export function formatPrice(price) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0
  }).format(price || 0);
}

/**
 * Formatea fecha completa (día, mes, año).
 * @param {string|Date} dateStr
 * @param {Object} [opts] - { includeTime: false }
 * @returns {string}
 */
export function formatDate(dateStr, opts = {}) {
  if (!dateStr) return '';
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(date.getTime())) return '';
  const base = { day: '2-digit', month: 'short', year: 'numeric' };
  const options = opts.includeTime ? { ...base, hour: '2-digit', minute: '2-digit' } : base;
  return date.toLocaleDateString('es-CL', options);
}

/**
 * Formatea fecha corta (ej: "lun 12 mar").
 * @param {string|Date} dateStr
 * @returns {string}
 */
export function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const date = typeof dateStr === 'string' ? new Date(dateStr + (dateStr.includes('T') ? '' : 'T12:00:00')) : dateStr;
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-CL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
}
