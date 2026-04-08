const VARIANT_STORAGE_KEY = 'providerHomeCtaVariant:v1';
const EVENTS_STORAGE_KEY = 'providerHomeCtaEvents:v1';
const MAX_STORED_EVENTS = 120;

const VARIANT_A = 'A';
const VARIANT_B = 'B';

function safeReadJsonArray(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hashToVariant(seed) {
  const input = String(seed || '');
  if (!input) return Math.random() < 0.5 ? VARIANT_A : VARIANT_B;
  let acc = 0;
  for (let i = 0; i < input.length; i += 1) {
    acc = (acc + input.charCodeAt(i) * (i + 1)) % 9973;
  }
  return acc % 2 === 0 ? VARIANT_A : VARIANT_B;
}

export function readProviderHomeCtaVariant(userId = '') {
  try {
    const saved = localStorage.getItem(VARIANT_STORAGE_KEY);
    if (saved === VARIANT_A || saved === VARIANT_B) return saved;
    const assigned = hashToVariant(userId);
    localStorage.setItem(VARIANT_STORAGE_KEY, assigned);
    return assigned;
  } catch {
    return hashToVariant(userId);
  }
}

export function getProviderHomeCtaLabel(variant) {
  return variant === VARIANT_B ? 'Completa y publica' : 'Completar ahora';
}

export function trackProviderHomeCtaEvent(eventName, payload = {}) {
  const event = {
    event: eventName,
    ts: new Date().toISOString(),
    ...payload,
  };
  try {
    const current = safeReadJsonArray(EVENTS_STORAGE_KEY);
    current.push(event);
    const trimmed = current.slice(-MAX_STORED_EVENTS);
    localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore localStorage failures */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('maqgo:provider-home-cta-event', {
        detail: event,
      })
    );
  }
}

export function trackProviderHomeCtaImpression(payload = {}) {
  trackProviderHomeCtaEvent('provider_home_cta_impression', payload);
}

export function trackProviderHomeCtaClick(payload = {}) {
  trackProviderHomeCtaEvent('provider_home_cta_click', payload);
}
