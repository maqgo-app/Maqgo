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

import {
  shouldRequestOTP,
  parsePhoneLast9,
  buildOtpDecisionUser,
  OTP_INTENT_PROVIDER_SIGNUP,
  hasPersistedAuthToken,
  canSkipSmsForProviderSignup,
} from './otpDecision.js';

describe('otpDecision', () => {
  describe('parsePhoneLast9', () => {
    it('extrae 9XXXXXXXX', () => {
      expect(parsePhoneLast9('+56 9 1234 5678')).toBe('912345678');
    });
    it('vacío si inválido', () => {
      expect(parsePhoneLast9('')).toBe('');
    });
  });

  describe('shouldRequestOTP', () => {
    it('sin sesión → true', () => {
      expect(
        shouldRequestOTP(
          { hasValidSession: false, sessionPhoneLast9: '' },
          {},
          { enteredPhoneLast9: '912345678', intent: OTP_INTENT_PROVIDER_SIGNUP }
        )
      ).toBe(true);
    });

    it('sesión + mismo número + sin riesgo → false (no SMS por rol proveedor)', () => {
      expect(
        shouldRequestOTP(
          { hasValidSession: true, sessionPhoneLast9: '912345678' },
          {},
          {
            enteredPhoneLast9: '912345678',
            intent: OTP_INTENT_PROVIDER_SIGNUP,
          }
        )
      ).toBe(false);
    });

    it('sesión + otro número → true', () => {
      expect(
        shouldRequestOTP(
          { hasValidSession: true, sessionPhoneLast9: '911111111' },
          {},
          { enteredPhoneLast9: '912345678' }
        )
      ).toBe(true);
    });

    it('device.trusted false → true', () => {
      expect(
        shouldRequestOTP(
          { hasValidSession: true, sessionPhoneLast9: '912345678' },
          { trusted: false },
          { enteredPhoneLast9: '912345678' }
        )
      ).toBe(true);
    });

    it('sessionExpired → true', () => {
      expect(
        shouldRequestOTP(
          { hasValidSession: true, sessionPhoneLast9: '912345678' },
          {},
          { enteredPhoneLast9: '912345678', sessionExpired: true }
        )
      ).toBe(true);
    });

    it('riesgo país / fallos → true', () => {
      expect(
        shouldRequestOTP(
          { hasValidSession: true, sessionPhoneLast9: '912345678' },
          {},
          {
            enteredPhoneLast9: '912345678',
            riskSignals: { countryMismatch: true },
          }
        )
      ).toBe(true);
    });
  });

  describe('canSkipSmsForProviderSignup', () => {
    const origLs = globalThis.localStorage;

    afterEach(() => {
      globalThis.localStorage = origLs;
      vi.restoreAllMocks();
    });

    it('shouldRequestOTP false pero sin JWT en storage → false (forzar login-sms/start)', () => {
      const store = { userPhone: '+56 9 1234 5678' };
      vi.stubGlobal('localStorage', {
        getItem: (k) => {
          if (k === 'userPhone') return store.userPhone;
          if (k === 'userId') return 'u1';
          return null;
        },
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      });
      expect(hasPersistedAuthToken()).toBe(false);
      expect(
        canSkipSmsForProviderSignup(
          { hasValidSession: true, sessionPhoneLast9: '912345678' },
          {},
          { enteredPhoneLast9: '912345678', intent: OTP_INTENT_PROVIDER_SIGNUP }
        )
      ).toBe(false);
    });

    it('sesión + mismo número + JWT → true', () => {
      vi.stubGlobal('localStorage', {
        getItem: (k) => {
          if (k === 'userPhone') return '+56 9 1234 5678';
          if (k === 'userId') return 'u1';
          if (k === 'authToken') return 'jwt';
          return null;
        },
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      });
      expect(hasPersistedAuthToken()).toBe(true);
      expect(
        canSkipSmsForProviderSignup(
          { hasValidSession: true, sessionPhoneLast9: '912345678' },
          {},
          { enteredPhoneLast9: '912345678', intent: OTP_INTENT_PROVIDER_SIGNUP }
        )
      ).toBe(true);
    });
  });

  describe('buildOtpDecisionUser', () => {
    const orig = globalThis.localStorage;

    afterEach(() => {
      globalThis.localStorage = orig;
      vi.restoreAllMocks();
    });

    it('lee userPhone y hasValidSession', () => {
      vi.stubGlobal(
        'localStorage',
        {
          getItem: (k) => (k === 'userPhone' ? '+56 9 8765 4321' : k === 'userId' ? 'u1' : k === 'token' ? 't' : null),
          setItem: vi.fn(),
          removeItem: vi.fn(),
          clear: vi.fn(),
        }
      );
      const u = buildOtpDecisionUser();
      expect(u.hasValidSession).toBe(true);
      expect(u.sessionPhoneLast9).toBe('987654321');
    });
  });
});
