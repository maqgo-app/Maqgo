/**
 * Política de cancelación (Términos y Condiciones)
 *
 * Regla de producto: la política debe ser muy clara e incentivar el servicio
 * por sobre la cancelación. Completar el servicio no tiene cargo; los cargos
 * aplican solo al cancelar una vez el operador ha reservado tiempo.
 *
 * Ventana de cancelación sin costo (después de que el operador acepta):
 *    - Urgente (< 2h): sin ventana
 *    - Express (2-4h): 15 minutos
 *    - Hoy (> 4h): 30 minutos
 *    - Programado (otro día): 1 hora
 *
 * Cargos fuera de ventana:
 *    - Servicio asignado: 20%
 *    - Operador en camino: 40%
 *    - Operador en obra: 60%
 *    - Servicio iniciado: no es posible cancelar
 *
 * Regla de negocio (no-show): Si han pasado 60 min desde la hora indicada (ETA) y el operador
 * no ha informado nada en ruta, el cliente puede cancelar sin cargo; si sí informó en ruta, a los ETA+90 min.
 */

/** Minutos después de la ETA para permitir cancelar sin cargo (no-show). Si el operador informó en ruta (ej. tráfico), 90; si no, 60. */
export function getMinutesAfterEtaToAllowCancel(operatorReportedEnRoute) {
  return operatorReportedEnRoute ? 90 : 60;
}

export const CANCELLATION_PERCENTAGES = {
  pending: 0,
  assigned: 0.20,
  en_route: 0.40,
  arrived: 0.60
};

/** Estados en los que NO se puede cancelar */
export const NON_CANCELLABLE_STATUSES = ['started', 'in_progress'];

/**
 * Obtiene el texto de la ventana de cancelación sin costo.
 * @param {Object} opts
 * @param {string} [opts.urgencyType] - 'urgent' | 'express' | 'today' | 'scheduled'
 * @param {string} [opts.reservationType] - 'immediate' | 'scheduled'
 * @param {number} [opts.hoursToday] - horas del servicio (fallback para maquinaria sin urgencyType)
 */
export function getCancellationWindowText({ urgencyType, reservationType, hoursToday = 4 }) {
  // Política: ventana sin costo después de que el operador acepta la solicitud
  // Reserva PROGRAMADA (otro día): 1 hora
  if (reservationType === 'scheduled') {
    return 'Programado: cancela gratis hasta 1 hora después de que acepten';
  }
  if (urgencyType === 'urgent') {
    return 'Urgente: si cancelas, hay cargo desde que acepten';
  }
  if (urgencyType === 'express') {
    return 'Express: cancela gratis hasta 15 min después de que acepten';
  }
  if (urgencyType === 'today') {
    return 'Hoy: cancela gratis hasta 30 min después de que acepten';
  }
  if (hoursToday <= 4) return 'Urgente: si cancelas, hay cargo desde que acepten';
  if (hoursToday <= 5) return 'Express: cancela gratis hasta 15 min después de que acepten';
  return 'Hoy: cancela gratis hasta 30 min después de que acepten';
}
