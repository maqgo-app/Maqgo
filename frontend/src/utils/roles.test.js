import { describe, it, expect, afterEach } from 'vitest';
import {
  hasPermission,
  canAccessRoute,
  filterDataForOperator,
  getCurrentProviderRole,
  isOwner,
  isOperator,
} from './roles';

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
  return store;
}

describe('roles utils', () => {
  const original = globalThis.localStorage;

  afterEach(() => {
    if (original === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = original;
    }
  });

  describe('hasPermission', () => {
    it('resuelve permisos correctos por rol y niega rol desconocido', () => {
      expect(hasPermission('owner', 'viewDashboard')).toBe(true);
      expect(hasPermission('operator', 'viewDashboard')).toBe(false);
      expect(hasPermission('unknown', 'viewDashboard')).toBe(false);
    });
  });

  describe('canAccessRoute', () => {
    it('admin y owner acceden a todo', () => {
      expect(canAccessRoute('admin', '/provider/cobros')).toBe(true);
      expect(canAccessRoute('owner', '/provider/cobros')).toBe(true);
    });

    it('operator no accede a rutas ownerOnly', () => {
      expect(canAccessRoute('operator', '/provider/cobros')).toBe(false);
      expect(canAccessRoute('operator', '/provider/upload-invoice/123')).toBe(false);
      expect(canAccessRoute('operator', '/provider/home')).toBe(true);
    });
  });

  describe('filterDataForOperator', () => {
    it('elimina campos sensibles solo para operator', () => {
      const payload = {
        invoice: 'A-1',
        commission: 1000,
        razonSocial: 'Empresa X',
        visible: true,
      };
      const operatorView = filterDataForOperator(payload, 'operator');
      expect(operatorView).toEqual({ visible: true });

      const ownerView = filterDataForOperator(payload, 'owner');
      expect(ownerView).toEqual(payload);
    });
  });

  describe('provider role from storage', () => {
    it('usa role guardado y por defecto owner', () => {
      installLocalStorageMock({
        providerData: JSON.stringify({ role: 'operator' }),
      });
      expect(getCurrentProviderRole()).toBe('operator');
      expect(isOperator()).toBe(true);
      expect(isOwner()).toBe(false);
    });

    it('si no hay role guardado, cae a owner', () => {
      installLocalStorageMock({
        providerData: JSON.stringify({}),
      });
      expect(getCurrentProviderRole()).toBe('owner');
      expect(isOwner()).toBe(true);
      expect(isOperator()).toBe(false);
    });
  });
});
