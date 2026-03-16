/**
 * Utilidad compartida para texto de fechas en flujo de reserva.
 * Regla: pluma/aljibe/tolva con varios días = 1 viaje por día (nunca "varios viajes el mismo día").
 * Usar en todas las pantallas que muestren resumen de fechas o "viajes".
 */

/**
 * Parsea selectedDates (array de ISO o YYYY-MM-DD) y devuelve fechas ordenadas.
 * @param {string[]|Date[]} selectedDates
 * @returns {Date[]}
 */
export function parseAndSortDates(selectedDates) {
  const list = Array.isArray(selectedDates) ? selectedDates : [];
  return list
    .map(d => typeof d === 'string' ? new Date(d + (d.includes('T') ? '' : 'T12:00:00')) : d)
    .filter(d => d && !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Rango corto "12 mar – 14 mar" o una sola fecha "12 mar".
 * @param {string[]|Date[]} selectedDates
 * @param {string} [selectedDate] - fallback si selectedDates está vacío
 * @param {Object} [opts] - { locale: 'es-CL' }
 * @returns {string}
 */
export function getDateRangeShort(selectedDates, selectedDate = '', opts = {}) {
  const dates = parseAndSortDates(selectedDates);
  const locale = opts.locale || 'es-CL';
  const short = { day: 'numeric', month: 'short' };
  if (dates.length === 0) {
    if (!selectedDate) return '';
    const d = new Date(selectedDate + (selectedDate.includes('T') ? '' : 'T12:00:00'));
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale, short);
  }
  if (dates.length === 1) return dates[0].toLocaleDateString(locale, short);
  const first = dates[0].toLocaleDateString(locale, short);
  const last = dates[dates.length - 1].toLocaleDateString(locale, short);
  return `${first} – ${last}`;
}

/**
 * Para pluma/aljibe/tolva: "3 viajes (1 por día) · 12 mar – 14 mar" o "Valor viaje · 12 mar" (una fecha).
 * Usar en tarjetas de resumen, confirmación y resultado de pago.
 * @param {string[]|Date[]} selectedDates
 * @param {string} [selectedDate]
 * @param {Object} [opts] - { prefix: 'Valor viaje ·' } para incluir prefijo en resultado
 * @returns {string}
 */
export function getPerTripDateLabel(selectedDates, selectedDate = '', opts = {}) {
  const dates = parseAndSortDates(selectedDates);
  const range = getDateRangeShort(selectedDates, selectedDate, opts);
  if (dates.length > 1) {
    return `${dates.length} viajes (1 por día) · ${range}`;
  }
  return opts.prefix ? `${opts.prefix} ${range}` : range;
}

/**
 * Solo el texto de cantidad + rango para uso en desgloses: "3 viajes (1 por día)" o "Valor viaje".
 * @param {string[]|Date[]} selectedDates
 * @param {number} [totalDays] - si no se pasa selectedDates, usar totalDays (ej. selectedDates.length)
 * @returns {string}
 */
export function getPerTripCountLabel(selectedDates, totalDays) {
  const count = Array.isArray(selectedDates) && selectedDates.length > 0
    ? selectedDates.length
    : (totalDays || 1);
  return count > 1 ? `${count} viajes (1 por día)` : 'Valor viaje';
}
