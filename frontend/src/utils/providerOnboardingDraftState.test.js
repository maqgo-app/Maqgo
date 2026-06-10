import { afterEach, describe, expect, it } from 'vitest';
import {
  clearProviderOnboardingDraft,
  getProviderDraftArray,
  getProviderDraftObject,
  isProviderOnboardingDraftEnabled,
} from './providerOnboardingDraftState';

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

describe('providerOnboardingDraftState', () => {
  const original = globalThis.localStorage;

  afterEach(() => {
    if (original === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = original;
    }
  });

  it('permite usar draft mientras el onboarding no está completo', () => {
    installLocalStorageMock({
      providerOnboardingCompleted: 'false',
      machineData: JSON.stringify({ machineryType: 'retroexcavadora' }),
      operatorsData: JSON.stringify([{ nombre: 'Juan' }]),
    });

    expect(isProviderOnboardingDraftEnabled()).toBe(true);
    expect(getProviderDraftObject('machineData', {})).toEqual({ machineryType: 'retroexcavadora' });
    expect(getProviderDraftArray('operatorsData', [])).toEqual([{ nombre: 'Juan' }]);
  });

  it('bloquea leer draft cuando el onboarding ya está completo', () => {
    installLocalStorageMock({
      providerOnboardingCompleted: 'true',
      machineData: JSON.stringify({ machineryType: 'retroexcavadora' }),
      operatorsData: JSON.stringify([{ nombre: 'Juan' }]),
    });

    expect(isProviderOnboardingDraftEnabled()).toBe(false);
    expect(getProviderDraftObject('machineData', {})).toEqual({});
    expect(getProviderDraftArray('operatorsData', [])).toEqual([]);
  });

  it('limpia todas las keys temporales del draft', () => {
    const store = installLocalStorageMock({
      machineData: JSON.stringify({ machineryType: 'retroexcavadora' }),
      machinePricing: JSON.stringify({ priceBase: 98000 }),
      machinePhotos: JSON.stringify([{ url: 'x' }]),
      operatorsData: JSON.stringify([{ nombre: 'Juan' }]),
      providerOnboardingStep: '5',
      providerCameFromWelcome: 'true',
    });

    clearProviderOnboardingDraft();

    expect(store.machineData).toBeUndefined();
    expect(store.machinePricing).toBeUndefined();
    expect(store.machinePhotos).toBeUndefined();
    expect(store.operatorsData).toBeUndefined();
    expect(store.providerOnboardingStep).toBeUndefined();
    expect(store.providerCameFromWelcome).toBeUndefined();
  });
});
