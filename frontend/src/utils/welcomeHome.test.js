import { describe, it, expect, afterEach } from 'vitest';
import {
  getWelcomeAppHomePath,
  getWelcomeOfferMachineryDestination,
  getWelcomeOperatorDestination,
  isAdminRoleStored,
} from './welcomeHome.js';

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

    it('admin solo en userRoles (multi-rol) → /admin', () => {
      installLocalStorageMock({
        userId: 'a1',
        userRole: 'client',
        userRoles: JSON.stringify(['client', 'admin']),
      });
      expect(getWelcomeAppHomePath()).toBe('/admin');
    });

    it('proveedor titular incompleto sin Welcome → /provider/data', () => {
      installLocalStorageMock({
        userId: 'p1',
        userRole: 'provider',
        providerRole: 'super_master',
      });
      expect(getWelcomeAppHomePath()).toBe('/provider/data');
    });

    it('proveedor titular con Welcome → /provider/data', () => {
      installLocalStorageMock({
        userId: 'p1',
        userRole: 'provider',
        providerRole: 'super_master',
        providerCameFromWelcome: 'true',
      });
      expect(getWelcomeAppHomePath()).toBe('/provider/data');
    });

    it('proveedor pero desiredRole client (portada / arrendar) → /client/home', () => {
      installLocalStorageMock({
        userId: 'p1',
        userRole: 'provider',
        providerRole: 'super_master',
        desiredRole: 'client',
      });
      expect(getWelcomeAppHomePath()).toBe('/client/home');
    });

    it('proveedor titular onboarding completo → /provider/home', () => {
      installLocalStorageMock({
        userId: 'p1',
        userRole: 'provider',
        providerRole: 'super_master',
        providerOnboardingCompleted: 'true',
      });
      expect(getWelcomeAppHomePath()).toBe('/provider/home');
    });

    it('legacy userRole owner incompleto → /provider/data', () => {
      installLocalStorageMock({
        userId: 'p1',
        userRole: 'owner',
        providerRole: 'super_master',
      });
      expect(getWelcomeAppHomePath()).toBe('/provider/data');
    });

    it('operador (providerRole operator) → /operator/home', () => {
      installLocalStorageMock({
        userId: 'o1',
        userRole: 'provider',
        providerRole: 'operator',
      });
      expect(getWelcomeAppHomePath()).toBe('/operator/home');
    });

    it('operador pero desiredRole client → /client/home', () => {
      installLocalStorageMock({
        userId: 'o1',
        userRole: 'provider',
        providerRole: 'operator',
        desiredRole: 'client',
      });
      expect(getWelcomeAppHomePath()).toBe('/client/home');
    });
  });

  describe('getWelcomeOfferMachineryDestination', () => {
    it('sin userId → null (flujo /register)', () => {
      installLocalStorageMock({});
      expect(getWelcomeOfferMachineryDestination()).toBeNull();
    });

    it('userId sin JWT → null (evita onboarding sin sesión)', () => {
      installLocalStorageMock({ userId: 'p1', userRole: 'provider', providerRole: 'super_master' });
      expect(getWelcomeOfferMachineryDestination()).toBeNull();
    });

    it('admin → /admin', () => {
      installLocalStorageMock({ userId: 'a1', userRole: 'admin', token: 't' });
      expect(getWelcomeOfferMachineryDestination()).toBe('/admin');
    });

    it('proveedor titular con sesión → CTA siempre /provider/add-machine', () => {
      installLocalStorageMock({
        userId: 'p1',
        userRole: 'provider',
        providerRole: 'super_master',
        token: 't',
      });
      expect(getWelcomeOfferMachineryDestination()).toBe('/provider/add-machine');
    });

    it('proveedor titular completo → CTA sigue siendo /provider/add-machine', () => {
      installLocalStorageMock({
        userId: 'p1',
        userRole: 'provider',
        providerRole: 'super_master',
        token: 't',
        providerOnboardingCompleted: 'true',
      });
      expect(getWelcomeOfferMachineryDestination()).toBe('/provider/add-machine');
    });

    it('operador → /operator/home', () => {
      installLocalStorageMock({
        userId: 'o1',
        userRole: 'provider',
        providerRole: 'operator',
        token: 't',
      });
      expect(getWelcomeOfferMachineryDestination()).toBe('/operator/home');
    });

    it('cliente → /provider/add-machine (machine-first)', () => {
      installLocalStorageMock({ userId: 'c1', userRole: 'client', token: 't' });
      expect(getWelcomeOfferMachineryDestination()).toBe('/provider/add-machine');
    });

    it('multi-rol en userRoles: CTA → /provider/add-machine', () => {
      installLocalStorageMock({
        userId: 'm1',
        userRole: 'client',
        userRoles: JSON.stringify(['client', 'provider']),
        providerRole: 'super_master',
        token: 't',
      });
      expect(getWelcomeOfferMachineryDestination()).toBe('/provider/add-machine');
    });
  });

  describe('getWelcomeOperatorDestination', () => {
    it('sin userId → /operator/join', () => {
      installLocalStorageMock({});
      expect(getWelcomeOperatorDestination()).toBe('/operator/join');
    });

    it('admin → /admin', () => {
      installLocalStorageMock({ userId: 'a1', userRole: 'admin' });
      expect(getWelcomeOperatorDestination()).toBe('/admin');
    });

    it('operador → /operator/home', () => {
      installLocalStorageMock({
        userId: 'o1',
        userRole: 'provider',
        providerRole: 'operator',
      });
      expect(getWelcomeOperatorDestination()).toBe('/operator/home');
    });

    it('proveedor titular → /operator/join', () => {
      installLocalStorageMock({
        userId: 'p1',
        userRole: 'provider',
        providerRole: 'super_master',
      });
      expect(getWelcomeOperatorDestination()).toBe('/operator/join');
    });

    it('cliente → /operator/join', () => {
      installLocalStorageMock({ userId: 'c1', userRole: 'client' });
      expect(getWelcomeOperatorDestination()).toBe('/operator/join');
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

    it('true si userRoles incluye admin', () => {
      installLocalStorageMock({
        userRole: 'client',
        userRoles: JSON.stringify(['admin']),
      });
      expect(isAdminRoleStored()).toBe(true);
    });
  });
});
