/**
 * MAQGO – Regla: el chat es el único canal entre cliente y proveedor.
 * Bloqueo de datos de contacto (teléfonos / enlaces tel) en mensajes.
 */

export const CHAT_CONTACT_BLOCKED_MESSAGE =
  'Por seguridad, no compartas datos de contacto. Usa el chat de MAQGO';

/** API y UI usan 'operator' para proveedor/operador */
export function normalizeChatSenderType(roleOrType) {
  const r = String(roleOrType || '').toLowerCase();
  if (r === 'provider' || r === 'operator') return 'operator';
  return 'client';
}

/**
 * Detecta teléfonos (Chile y patrones comunes) y esquema tel:
 */
export function messageContainsPhoneOrContact(text) {
  if (!text || typeof text !== 'string') return false;
  const s = text.trim();
  if (!s) return false;
  const lower = s.toLowerCase();
  if (/\btel:\s*/i.test(s)) return true;
  if (/whatsapp|wa\.me/i.test(lower)) return true;
  // Bloquear correos para mantener chat como único canal
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(s)) return true;

  // +56 9 X XXX XXXX (flexible separadores)
  if (/\+?\s*56[\s.-]*9[\s.-]*\d[\s.-]*\d[\s.-]*\d[\s.-]*\d[\s.-]*\d[\s.-]*\d[\s.-]*\d[\s.-]*\d[\s.-]*\d/.test(s)) {
    return true;
  }
  // Móvil chileno 9 XXXX XXXX
  if (/\b9[\s.-]?\d{4}[\s.-]?\d{4}\b/.test(s)) return true;

  const digits = s.replace(/\D/g, '');
  if (digits.length >= 9 && /9\d{8,}/.test(digits)) return true;

  return false;
}
