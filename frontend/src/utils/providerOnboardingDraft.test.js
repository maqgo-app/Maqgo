import { describe, it, expect, afterEach } from 'vitest';
import {
  mergeOnboardingDraftIntoMachineData,
  stripOnboardingDraftFromMachineData,
  hydrateLocalProviderOnboardingDraftFromUser,
} from './providerOnboardingDraft';

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

describe('providerOnboardingDraft', () => {
  const original = globalThis.localStorage;

  afterEach(() => {
    if (original === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = original;
    }
  });

  it('mezcla pricing y fotos dentro de machineData', () => {
    installLocalStorageMock({
      machinePricing: JSON.stringify({ priceBase: 120000 }),
      machinePhotos: JSON.stringify([{ url: 'data:image/png;base64,abc', label: 'Frontal' }]),
    });

    expect(
      mergeOnboardingDraftIntoMachineData({ machineryType: 'retroexcavadora', licensePlate: 'ABCD12' })
    ).toEqual({
      machineryType: 'retroexcavadora',
      licensePlate: 'ABCD12',
      onboardingPricing: { priceBase: 120000 },
      onboardingPhotos: [{ url: 'data:image/png;base64,abc', label: 'Frontal' }],
    });
  });

  it('hidrata localStorage desde backend y separa draft de machineData', () => {
    const store = installLocalStorageMock({});
    const ok = hydrateLocalProviderOnboardingDraftFromUser({
      onboarding_completed: false,
      isAvailable: false,
      providerData: {
        businessName: 'Empresa Uno',
        rut: '12.345.678-9',
        bankData: { bank: 'Banco Estado', accountNumber: '123' },
      },
      machineData: {
        machineryType: 'retroexcavadora',
        licensePlate: 'ABCD12',
        onboardingPricing: { priceBase: 98000 },
        onboardingPhotos: [{ url: 'data:image/png;base64,abc', label: 'Frontal' }],
      },
      operators: [{ nombre: 'Juan', apellido: 'Perez', rut: '12.345.678-5' }],
    });

    expect(ok).toBe(true);
    expect(JSON.parse(store.providerData)).toEqual({
      businessName: 'Empresa Uno',
      rut: '12.345.678-9',
      bankData: { bank: 'Banco Estado', accountNumber: '123' },
    });
    expect(JSON.parse(store.bankData)).toEqual({ bank: 'Banco Estado', accountNumber: '123' });
    expect(JSON.parse(store.machineData)).toEqual({
      machineryType: 'retroexcavadora',
      licensePlate: 'ABCD12',
    });
    expect(JSON.parse(store.machinePricing)).toEqual({ priceBase: 98000 });
    expect(JSON.parse(store.machinePhotos)).toEqual([{ url: 'data:image/png;base64,abc', label: 'Frontal' }]);
    expect(JSON.parse(store.operatorsData)).toEqual([{ nombre: 'Juan', apellido: 'Perez', rut: '12.345.678-5' }]);
  });

  it('limpia campos de draft al extraer machineData puro', () => {
    expect(
      stripOnboardingDraftFromMachineData({
        machineryType: 'retroexcavadora',
        onboardingPricing: { priceBase: 1 },
        onboardingPhotos: [{ url: 'x', label: 'Frontal' }],
      })
    ).toEqual({ machineryType: 'retroexcavadora' });
  });

  it('no rehidrata draft local cuando el onboarding ya está completo', () => {
    const store = installLocalStorageMock({
      machineData: JSON.stringify({ machineryType: 'retroexcavadora' }),
      machinePricing: JSON.stringify({ priceBase: 98000 }),
      machinePhotos: JSON.stringify([{ url: 'legacy', label: 'Frontal' }]),
      operatorsData: JSON.stringify([{ nombre: 'Viejo' }]),
      providerOnboardingStep: '5',
      providerCameFromWelcome: 'true',
    });

    const ok = hydrateLocalProviderOnboardingDraftFromUser({
      onboarding_completed: true,
      isAvailable: true,
      providerData: {
        businessName: 'Empresa Uno',
        rut: '12.345.678-9',
      },
      machineData: {
        machineryType: 'retroexcavadora',
        licensePlate: 'ABCD12',
        onboardingPricing: { priceBase: 98000 },
        onboardingPhotos: [{ url: 'data:image/png;base64,abc', label: 'Frontal' }],
      },
      operators: [{ nombre: 'Juan', apellido: 'Perez', rut: '12.345.678-5' }],
    });

    expect(ok).toBe(true);
    expect(store.machineData).toBeUndefined();
    expect(store.machinePricing).toBeUndefined();
    expect(store.machinePhotos).toBeUndefined();
    expect(store.operatorsData).toBeUndefined();
    expect(store.providerOnboardingStep).toBeUndefined();
    expect(store.providerCameFromWelcome).toBeUndefined();
    expect(store.providerOnboardingCompleted).toBe('true');
  });
});
