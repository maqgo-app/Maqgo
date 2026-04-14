const PROVIDER_AVAILABILITY_KEY = 'providerAvailable';
const PROVIDER_AVAILABILITY_EVENT = 'maqgo:provider-availability';

export function readProviderAvailableDefaultOn() {
  try {
    const v = localStorage.getItem(PROVIDER_AVAILABILITY_KEY);
    if (v === null || v === '') return true;
    return v === 'true';
  } catch {
    return true;
  }
}

export function writeProviderAvailability(nextValue, options = {}) {
  const notify = options.notify !== false;
  const normalized = Boolean(nextValue);
  try {
    localStorage.setItem(PROVIDER_AVAILABILITY_KEY, normalized.toString());
  } catch {
    /* ignore localStorage failures */
  }
  if (notify && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(PROVIDER_AVAILABILITY_EVENT, {
        detail: { available: normalized },
      })
    );
  }
}

export function subscribeProviderAvailability(onChange) {
  if (typeof window === 'undefined' || typeof onChange !== 'function') {
    return () => {};
  }

  const onCustomEvent = (event) => {
    const nextValue = event?.detail?.available;
    if (typeof nextValue === 'boolean') {
      onChange(nextValue);
    }
  };

  const onStorage = (event) => {
    if (event?.key !== PROVIDER_AVAILABILITY_KEY) return;
    if (event.newValue === 'true' || event.newValue === 'false') {
      onChange(event.newValue === 'true');
    }
  };

  window.addEventListener(PROVIDER_AVAILABILITY_EVENT, onCustomEvent);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(PROVIDER_AVAILABILITY_EVENT, onCustomEvent);
    window.removeEventListener('storage', onStorage);
  };
}

export function isDemoProviderUserId(userId) {
  return (
    typeof userId === 'string' &&
    (userId.startsWith('provider-') || userId.startsWith('demo-') || userId.startsWith('operator-'))
  );
}
