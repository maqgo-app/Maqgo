import { describe, it, expect, afterEach } from 'vitest';
import {
  runAddressStorageMigrationOnce,
  MAQGO_ADDRESS_STORAGE_VERSION
} from './addressStorageMigration';
import { SELECTED_ADDRESS_KEY } from './mapPlaceToAddress';

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
    }
  };
  globalThis.localStorage = ls;
  return store;
}

describe('runAddressStorageMigrationOnce', () => {
  const original = globalThis.localStorage;

  afterEach(() => {
    if (original === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = original;
    }
  });

  it('primera vez: borra claves de ubicación y fija versión', () => {
    installLocalStorageMock();
    localStorage.setItem(SELECTED_ADDRESS_KEY, '{}');
    localStorage.setItem('serviceLocation', 'x');
    runAddressStorageMigrationOnce();
    expect(localStorage.getItem(SELECTED_ADDRESS_KEY)).toBeNull();
    expect(localStorage.getItem('serviceLocation')).toBeNull();
    expect(localStorage.getItem('maqgo_address_storage_v')).toBe(MAQGO_ADDRESS_STORAGE_VERSION);
  });

  it('si la versión ya coincide, no borra de nuevo', () => {
    installLocalStorageMock();
    localStorage.setItem('maqgo_address_storage_v', MAQGO_ADDRESS_STORAGE_VERSION);
    localStorage.setItem('serviceLocation', 'conservar');
    runAddressStorageMigrationOnce();
    expect(localStorage.getItem('serviceLocation')).toBe('conservar');
  });
});
