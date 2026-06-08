import { describe, it, expect, afterEach } from 'vitest';
import {
  getProviderLandingPath,
  getProviderOnboardingNextPath,
  isProviderActivationCompleteFromStorage,
  isProviderOnboardingCompleteFromStorage,
} from './providerOnboardingStatus.js';

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

const completePayload = {
  providerData: JSON.stringify({ businessName: 'Empresa', rut: '12.345.678-9' }),
  machineData: JSON.stringify({ machineryType: 'retroexcavadora', licensePlate: 'ABCD12' }),
  providerMachines: JSON.stringify([
    {
      id: 'mach_1',
      machineryType: 'retroexcavadora',
      licensePlate: 'ABCD12',
      operators: [{ id: 'op_1', name: 'Op' }],
    },
  ]),
  operatorsData: JSON.stringify([{ id: '1', name: 'Op' }]),
  bankData: JSON.stringify({
    bank: 'b',
    accountType: 'c',
    accountNumber: '123',
    holderName: 'H',
    holderRut: '1-9',
  }),
};

describe('providerOnboardingStatus', () => {
  const original = globalThis.localStorage;

  afterEach(() => {
    if (original === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = original;
    }
  });

  it('sin datos: reingreso normal va a home y onboarding va a /provider/data', () => {
    installLocalStorageMock({});
    expect(getProviderLandingPath()).toBe('/provider/home');
    expect(getProviderOnboardingNextPath()).toBe('/provider/data');
    expect(isProviderActivationCompleteFromStorage()).toBe(false);
    expect(isProviderOnboardingCompleteFromStorage()).toBe(false);
  });

  it('sin datos + providerCameFromWelcome mantiene onboarding en /provider/data', () => {
    installLocalStorageMock({ providerCameFromWelcome: 'true' });
    expect(getProviderLandingPath()).toBe('/provider/home');
    expect(getProviderOnboardingNextPath()).toBe('/provider/data');
  });

  it('cuatro pilares en LS → home', () => {
    installLocalStorageMock({ ...completePayload });
    expect(isProviderActivationCompleteFromStorage()).toBe(true);
    expect(isProviderOnboardingCompleteFromStorage()).toBe(true);
    expect(getProviderLandingPath()).toBe('/provider/home');
    expect(getProviderOnboardingNextPath()).toBe('/provider/home');
  });

  it('providerOnboardingCompleted=true sin LS → completo', () => {
    installLocalStorageMock({ providerOnboardingCompleted: 'true' });
    expect(isProviderOnboardingCompleteFromStorage()).toBe(true);
    expect(getProviderLandingPath()).toBe('/provider/home');
    expect(getProviderOnboardingNextPath()).toBe('/provider/home');
  });

  it('onboarding manual: sin máquina registrada sigue orden clásico', () => {
    installLocalStorageMock({
      providerCameFromWelcome: 'true',
      providerData: JSON.stringify({ businessName: 'E', rut: '1-9' }),
    });
    expect(getProviderLandingPath()).toBe('/provider/home');
    expect(getProviderOnboardingNextPath()).toBe('/provider/machine-data');
    installLocalStorageMock({
      providerCameFromWelcome: 'true',
      providerData: JSON.stringify({ businessName: 'E', rut: '1-9' }),
      machineData: JSON.stringify({ machineryType: 'x', licensePlate: 'ZZ99' }),
    });
    expect(getProviderLandingPath()).toBe('/provider/home');
    expect(getProviderOnboardingNextPath()).toBe('/provider/machines');
    installLocalStorageMock({
      providerCameFromWelcome: 'true',
      providerData: JSON.stringify({ businessName: 'E', rut: '1-9' }),
      machineData: JSON.stringify({ machineryType: 'x', licensePlate: 'ZZ99' }),
      operatorsData: JSON.stringify([{ id: '1', name: 'Operador Uno' }]),
    });
    expect(getProviderLandingPath()).toBe('/provider/home');
    expect(getProviderOnboardingNextPath()).toBe('/provider/profile/banco');
  });

  it('máquina registrada sin completar onboarding: reingreso va a home', () => {
    installLocalStorageMock({
      providerCameFromWelcome: 'true',
      providerMachines: JSON.stringify([{ id: 'mach_1', machineryType: 'x', licensePlate: 'ZZ99', operators: [] }]),
    });
    expect(getProviderLandingPath()).toBe('/provider/home');
  });

  it('Welcome + onboarding completo en LS → /provider/home', () => {
    installLocalStorageMock({
      providerCameFromWelcome: 'true',
      providerOnboardingCompleted: 'true',
      ...completePayload,
    });
    expect(getProviderLandingPath()).toBe('/provider/home');
    expect(getProviderOnboardingNextPath()).toBe('/provider/home');
  });

  it('tras quitar flag Welcome + onboarding completo → /provider/home', () => {
    installLocalStorageMock({
      providerOnboardingCompleted: 'true',
      ...completePayload,
    });
    expect(getProviderLandingPath()).toBe('/provider/home');
    expect(getProviderOnboardingNextPath()).toBe('/provider/home');
  });

  it('onboarding: solo empresa en LS → /provider/machine-data', () => {
    installLocalStorageMock({
      providerData: JSON.stringify({ businessName: 'E', rut: '1-9' }),
    });
    expect(getProviderLandingPath()).toBe('/provider/home');
    expect(getProviderOnboardingNextPath()).toBe('/provider/machine-data');
  });

  it('empresa + máquina sin operador asignado → onboarding va a /provider/machines', () => {
    installLocalStorageMock({
      providerData: JSON.stringify({ businessName: 'E', rut: '1-9' }),
      machineData: JSON.stringify({ machineryType: 'x', licensePlate: 'ZZ99' }),
      providerMachines: JSON.stringify([
        { id: 'mach_1', machineryType: 'x', licensePlate: 'ZZ99', operators: [] },
      ]),
    });
    expect(getProviderLandingPath()).toBe('/provider/home');
    expect(getProviderOnboardingNextPath()).toBe('/provider/machines');
    expect(isProviderActivationCompleteFromStorage()).toBe(false);
  });
});
