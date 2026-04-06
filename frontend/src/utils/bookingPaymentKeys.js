/**
 * IDs estables para idempotencia de pago/reserva (un booking por embudo).
 */
const BOOKING_ID_KEY = 'maqgo_booking_id';

export function getOrCreateBookingId() {
  try {
    let id = localStorage.getItem(BOOKING_ID_KEY);
    if (!id || String(id).length < 8) {
      id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `bk_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem(BOOKING_ID_KEY, id);
    }
    return id;
  } catch {
    return `bk_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** Clave idempotente por operación lógica (misma en reintentos). */
export function idempotencyKey(scope) {
  const bid = getOrCreateBookingId();
  return `${scope}:${bid}`;
}
