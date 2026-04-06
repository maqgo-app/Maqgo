import { describe, it, expect, afterEach } from 'vitest';
import { getPostLoginNavigation } from './postLoginNavigation.js';

function installLocalStorageMock(seed = {}) {
  const store = { ...seed };
  globalThis.localStorage = {
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
}

describe('getPostLoginNavigation (invariante admin)', () => {
  const original = globalThis.localStorage;

  afterEach(() => {
    if (original === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = original;
    }
  });

  it('admin → /admin', () => {
    expect(
      getPostLoginNavigation({
        isAdmin: true,
        effectiveRole: 'admin',
        redirectTo: null,
      })
    ).toEqual({ kind: 'navigate', path: '/admin' });
  });

  it('no admin + redirect /admin → error; no navegar al panel', () => {
    expect(
      getPostLoginNavigation({
        isAdmin: false,
        effectiveRole: 'client',
        redirectTo: '/admin',
      })
    ).toEqual({ kind: 'error_not_admin' });
  });

  it('cliente sin redirect → /client/home', () => {
    expect(
      getPostLoginNavigation({
        isAdmin: false,
        effectiveRole: 'client',
        redirectTo: null,
      })
    ).toEqual({ kind: 'navigate', path: '/client/home' });
  });

  it('cliente con redirect /client/... → respeta deep link', () => {
    expect(
      getPostLoginNavigation({
        isAdmin: false,
        effectiveRole: 'client',
        redirectTo: '/client/booking',
      })
    ).toEqual({ kind: 'navigate', path: '/client/booking' });
  });

  it('proveedor sin redirect + onboarding incompleto → /provider/data', () => {
    installLocalStorageMock({ userId: 'p1' });
    expect(
      getPostLoginNavigation({
        isAdmin: false,
        effectiveRole: 'provider',
        redirectTo: null,
      })
    ).toEqual({ kind: 'navigate', path: '/provider/data' });
  });

  it('proveedor sin redirect + onboarding completo → /provider/home', () => {
    installLocalStorageMock({ userId: 'p1', providerOnboardingCompleted: 'true' });
    expect(
      getPostLoginNavigation({
        isAdmin: false,
        effectiveRole: 'provider',
        redirectTo: null,
      })
    ).toEqual({ kind: 'navigate', path: '/provider/home' });
  });

  it('proveedor con redirect /provider/data → landing según estado', () => {
    installLocalStorageMock({ userId: 'p1' });
    expect(
      getPostLoginNavigation({
        isAdmin: false,
        effectiveRole: 'provider',
        redirectTo: '/provider/data',
      })
    ).toEqual({ kind: 'navigate', path: '/provider/data' });
  });

  it('proveedor con redirect /provider/data + Welcome → add-machine', () => {
    installLocalStorageMock({ userId: 'p1', providerCameFromWelcome: 'true' });
    expect(
      getPostLoginNavigation({
        isAdmin: false,
        effectiveRole: 'provider',
        redirectTo: '/provider/data',
      })
    ).toEqual({ kind: 'navigate', path: '/provider/add-machine' });
  });

  it('proveedor con deep link /provider/history → se respeta', () => {
    installLocalStorageMock({ userId: 'p1' });
    expect(
      getPostLoginNavigation({
        isAdmin: false,
        effectiveRole: 'provider',
        redirectTo: '/provider/history',
      })
    ).toEqual({ kind: 'navigate', path: '/provider/history' });
  });
});
