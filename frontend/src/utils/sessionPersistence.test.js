import { describe, it, expect, afterEach } from 'vitest';
import { establishSession, persistLoginSessionMetadata } from './sessionPersistence.js';

describe('establishSession', () => {
  const original = globalThis.localStorage;

  afterEach(() => {
    if (original === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = original;
    }
  });

  it('guarda authToken, token y userId desde user_id', () => {
    const store = {};
    globalThis.localStorage = {
      setItem: (k, v) => {
        store[k] = String(v);
      },
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      removeItem: () => {},
      clear: () => {},
    };
    expect(establishSession({ token: 'jwt', user_id: 'user_abc' })).toBe(true);
    expect(store.authToken).toBe('jwt');
    expect(store.token).toBe('jwt');
    expect(store.userId).toBe('user_abc');
  });

  it('acepta userId (camelCase)', () => {
    const store = {};
    globalThis.localStorage = {
      setItem: (k, v) => {
        store[k] = String(v);
      },
      getItem: () => null,
      removeItem: () => {},
      clear: () => {},
    };
    expect(establishSession({ token: 't', userId: 'u1' })).toBe(true);
    expect(store.userId).toBe('u1');
  });

  it('acepta id', () => {
    const store = {};
    globalThis.localStorage = {
      setItem: (k, v) => {
        store[k] = String(v);
      },
      getItem: () => null,
      removeItem: () => {},
      clear: () => {},
    };
    expect(establishSession({ token: 't', id: 'u2' })).toBe(true);
    expect(store.userId).toBe('u2');
  });

  it('sin token → false y no escribe', () => {
    const calls = [];
    globalThis.localStorage = {
      setItem: (k, v) => calls.push([k, v]),
      getItem: () => null,
      removeItem: () => {},
      clear: () => {},
    };
    expect(establishSession({ user_id: 'x' })).toBe(false);
    expect(calls.length).toBe(0);
  });

  it('trusted login-sms: requires_otp false con token + id', () => {
    const store = {};
    globalThis.localStorage = {
      setItem: (k, v) => {
        store[k] = String(v);
      },
      getItem: () => null,
      removeItem: () => {},
      clear: () => {},
    };
    const payload = {
      token: 'jwt-trusted',
      requires_otp: false,
      id: 'user_existing',
      user_id: 'user_existing',
      role: 'client',
    };
    expect(establishSession(payload)).toBe(true);
    expect(store.authToken).toBe('jwt-trusted');
    expect(store.userId).toBe('user_existing');
  });
});

describe('persistLoginSessionMetadata', () => {
  const original = globalThis.localStorage;

  afterEach(() => {
    if (original === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = original;
    }
  });

  it('cliente post-OTP: userRole + userRoles', () => {
    const store = {};
    globalThis.localStorage = {
      setItem: (k, v) => {
        store[k] = String(v);
      },
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      removeItem: (k) => {
        delete store[k];
      },
      clear: () => {},
    };
    persistLoginSessionMetadata({
      id: 'u1',
      role: 'client',
      roles: ['client'],
      phone: '+56912345678',
    });
    expect(store.userRole).toBe('client');
    expect(store.userRoles).toBe(JSON.stringify(['client']));
    expect(store.userPhone).toBe('+56912345678');
    expect(store.providerRole).toBeUndefined();
  });

  it('proveedor: guarda providerRole', () => {
    const store = {};
    globalThis.localStorage = {
      setItem: (k, v) => {
        store[k] = String(v);
      },
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      removeItem: (k) => {
        delete store[k];
      },
      clear: () => {},
    };
    persistLoginSessionMetadata({
      id: 'p1',
      role: 'provider',
      roles: ['client', 'provider'],
      provider_role: 'super_master',
    });
    expect(store.userRole).toBe('provider');
    expect(store.providerRole).toBe('super_master');
  });
});
