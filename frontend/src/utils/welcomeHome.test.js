import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getWelcomeAppHomePath, isAdminRoleStored } from './welcomeHome.js';

/** Entorno Node (vitest): mock en globalThis.localStorage (mismo mecanismo que usa welcomeHome). */
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

describe('welcomeHome', () => {
  const original = globalThis.localStorage;

  afterEach(() => {
    if (original === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = original;
    }
  });

  describe('getWelcomeAppHomePath', () => {
    it('sin userId → /client/home', () => {
      installLocalStorageMock({});
      expect(getWelcomeAppHomePath()).toBe('/client/home');
    });

    it('cliente → /client/home', () => {
      installLocalStorageMock({ userId: 'u1', userRole: 'client' });
      expect(getWelcomeAppHomePath()).toBe('/client/home');
    });

    it('admin → /admin', () => {
      installLocalStorageMock({ userId: 'a1', userRole: 'admin' });
      expect(getWelcomeAppHomePath()).toBe('/admin');
    });

    it('proveedor titular → /provider/home', () => {
      installLocalStorageMock({
        userId: 'p1',
        userRole: 'provider',
        providerRole: 'super_master',
      });
      expect(getWelcomeAppHomePath()).toBe('/provider/home');
    });

    it('operador (providerRole operator) → /operator/home', () => {
      installLocalStorageMock({
        userId: 'o1',
        userRole: 'provider',
        providerRole: 'operator',
      });
      expect(getWelcomeAppHomePath()).toBe('/operator/home');
    });
  });

  describe('isAdminRoleStored', () => {
    it('false sin rol admin', () => {
      installLocalStorageMock({ userRole: 'client' });
      expect(isAdminRoleStored()).toBe(false);
    });

    it('true si userRole admin', () => {
      installLocalStorageMock({ userRole: 'admin' });
      expect(isAdminRoleStored()).toBe(true);
    });
  });
});
