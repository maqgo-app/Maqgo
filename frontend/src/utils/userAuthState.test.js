import { describe, it, expect, vi, afterEach } from 'vitest';

// api.js evalúa resolveBackendBaseUrl() en el nivel del módulo; en Node sin VITE_BACKEND_URL lanza.
// El mock de hasPersistedSessionCredentials replica la lógica real (userId + token en localStorage).
vi.mock('./api', () => ({
  default: '',
  hasPersistedSessionCredentials: vi.fn(() => {
    const ls = globalThis.localStorage;
    if (!ls) return false;
    const userId = ls.getItem('userId');
    const token = ls.getItem('token') || ls.getItem('authToken');
    return Boolean(userId && token);
  }),
  fetchWithAuth: vi.fn(),
}));

import { getUserAuthState, isProviderAccountInStorage, isOperatorAccountInStorage } from './userAuthState.js';

function installLocalStorageMock(seed = {}) {
  const store = { ...seed };
  const ls = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
  globalThis.localStorage = ls;
  return store;
}

describe('userAuthState', () => {
  const original = globalThis.localStorage;

  afterEach(() => {
    if (original === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = original;
    }
  });

  describe('getUserAuthState', () => {
    it('sin token → hasSession false', () => {
      installLocalStorageMock({ userId: 'u1' });
      const s = getUserAuthState();
      expect(s.hasSession).toBe(false);
      expect(s.userId).toBe('u1');
      expect(s.phone).toBeNull();
    });

    it('token + userId → hasSession true', () => {
      installLocalStorageMock({ userId: 'u1', token: 'jwt', userPhone: '+56912345678' });
      const s = getUserAuthState();
      expect(s.hasSession).toBe(true);
      expect(s.phone).toBe('912345678');
    });

    it('sin userPhone pero registerData.celular → mismo dígito', () => {
      installLocalStorageMock({
        userId: 'u1',
        token: 'jwt',
        registerData: JSON.stringify({ celular: '987654321', email: 'a@b.cl' }),
      });
      const s = getUserAuthState();
      expect(s.hasSession).toBe(true);
      expect(s.phone).toBe('987654321');
    });

    it('deviceTrusted si maqgo_device_id persistido', () => {
      const id = '00000000-0000-4000-8000-000000000001';
      installLocalStorageMock({ userId: 'u1', token: 't', maqgo_device_id: id });
      const s = getUserAuthState();
      expect(s.deviceTrusted).toBe(true);
    });
  });

  describe('isProviderAccountInStorage', () => {
    it('userRole provider → true', () => {
      installLocalStorageMock({ userRole: 'provider' });
      expect(isProviderAccountInStorage()).toBe(true);
    });

    it('cliente solo → false', () => {
      installLocalStorageMock({ userRole: 'client' });
      expect(isProviderAccountInStorage()).toBe(false);
    });
  });

  describe('isOperatorAccountInStorage', () => {
    it('providerRole operator → true', () => {
      installLocalStorageMock({ providerRole: 'operator' });
      expect(isOperatorAccountInStorage()).toBe(true);
    });
  });
});
