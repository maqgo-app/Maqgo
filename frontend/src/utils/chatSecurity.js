/**
 * MAQGO – Regla: el chat es el único canal entre cliente y proveedor.
 * Bloqueo de datos de contacto (teléfonos / enlaces tel) en mensajes.
 */

export const CHAT_CONTACT_BLOCKED_MESSAGE =
  'Por seguridad, no compartas datos de contacto. Usa el chat de MAQGO';
export const CHAT_LOW_QUALITY_BLOCKED_MESSAGE =
  'Escribe un mensaje claro y útil para coordinar el servicio.';

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

function _isLowQualityChatMessage(text) {
  if (!text || typeof text !== 'string') return false;
  const s = text.trim();
  if (!s) return false;

  // Repeticiones largas o puntuación excesiva tipo "....." / "aaaaa"
  if (/(.)\1{5,}/.test(s)) return true;
  if (/([.\-_])\1{3,}/.test(s)) return true;

  // Mensajes muy largos sin estructura mínima ni espacios útiles
  const tokens = s.split(/\s+/).filter(Boolean);
  const alnumOnly = s.replace(/[^a-zA-Z0-9]/g, '');
  const uniqueChars = new Set(alnumOnly.toLowerCase()).size;
  const diversity = alnumOnly.length > 0 ? uniqueChars / alnumOnly.length : 1;

  // Token "ruidoso": largo, con mezcla de letras/números, sin vocales y sin sentido práctico
  const hasNoisyToken = tokens.some((t) => {
    const clean = t.replace(/[^a-zA-Z0-9]/g, '');
    if (clean.length < 12) return false;
    const hasLetters = /[a-zA-Z]/.test(clean);
    const hasDigits = /\d/.test(clean);
    const hasVowels = /[aeiouAEIOU]/.test(clean);
    if (hasLetters && hasDigits && !hasVowels) return true;

    // Token muy largo con puntuación interna repetida (patrón típico de junk)
    const repeatedPunctuation = /([.\-_])\1{2,}/.test(t);
    return clean.length >= 18 && hasLetters && (hasDigits || repeatedPunctuation);
  });
  if (hasNoisyToken) return true;

  // Bloquea texto basura largo con baja diversidad y múltiples tokens cortados
  if (s.length >= 30 && tokens.length >= 5 && diversity < 0.28) return true;

  return false;
}

export function validateChatMessage(content) {
  const text = String(content || '').trim();
  if (!text) {
    return { ok: false, reason: 'empty', message: 'Escribe un mensaje para continuar.' };
  }
  if (messageContainsPhoneOrContact(text)) {
    return { ok: false, reason: 'contact', message: CHAT_CONTACT_BLOCKED_MESSAGE };
  }
  if (_isLowQualityChatMessage(text)) {
    return { ok: false, reason: 'low_quality', message: CHAT_LOW_QUALITY_BLOCKED_MESSAGE };
  }
  return { ok: true, reason: null, message: null };
}
