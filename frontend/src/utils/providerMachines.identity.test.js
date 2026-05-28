import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('./api', () => {
  return {
    default: 'https://example.test',
    fetchWithAuth: vi.fn(),
  };
});

import BACKEND_URL, { fetchWithAuth } from './api';
import { createMachineInApi, fetchProviderMachinesFromApi } from './providerMachines.js';

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

function mockFetchJsonOnce(data, ok = true, status = 200) {
  fetchWithAuth.mockResolvedValueOnce({
    ok,
    status,
    json: async () => data,
  });
}

describe('providerMachines identity scope', () => {
  const original = globalThis.localStorage;

  afterEach(() => {
    fetchWithAuth.mockReset();
    if (original === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = original;
    }
  });

  it('fetchProviderMachinesFromApi() sin provider_id usa /api/machines', async () => {
    installLocalStorageMock({ userId: 'owner_123', providerMachines: '[]' });
    mockFetchJsonOnce({ machines: [] });
    const out = await fetchProviderMachinesFromApi();
    expect(Array.isArray(out)).toBe(true);
    expect(fetchWithAuth).toHaveBeenCalledWith(`${BACKEND_URL}/api/machines`, {}, 10000);
  });

  it('fetchProviderMachinesFromApi(providerId) usa query provider_id', async () => {
    installLocalStorageMock({ userId: 'owner_123', providerMachines: '[]' });
    mockFetchJsonOnce({ machines: [] });
    await fetchProviderMachinesFromApi('owner_123');
    expect(fetchWithAuth).toHaveBeenCalledWith(
      `${BACKEND_URL}/api/machines?provider_id=${encodeURIComponent('owner_123')}`,
      {},
      10000
    );
  });

  it('createMachineInApi() no inyecta provider_id por defecto', async () => {
    installLocalStorageMock({ userId: 'owner_123', providerMachines: '[]' });
    mockFetchJsonOnce({ ok: true, machine: { id: 'mach_1', machineryType: 'retroexcavadora', licensePlate: 'ABCD12' } });
    await createMachineInApi({ machineryType: 'retroexcavadora', licensePlate: 'ABCD12' });

    const call = fetchWithAuth.mock.calls[0];
    expect(call[0]).toBe(`${BACKEND_URL}/api/machines`);
    const body = JSON.parse(call[1].body);
    expect(Object.prototype.hasOwnProperty.call(body, 'provider_id')).toBe(false);
  });

  it('createMachineInApi(machine, providerId) incluye provider_id cuando se especifica', async () => {
    installLocalStorageMock({ userId: 'owner_123', providerMachines: '[]' });
    mockFetchJsonOnce({ ok: true, machine: { id: 'mach_1', provider_id: 'owner_123', machineryType: 'retroexcavadora', licensePlate: 'ABCD12' } });
    await createMachineInApi({ machineryType: 'retroexcavadora', licensePlate: 'ABCD12' }, 'owner_123');

    const call = fetchWithAuth.mock.calls[0];
    expect(call[0]).toBe(`${BACKEND_URL}/api/machines`);
    const body = JSON.parse(call[1].body);
    expect(body.provider_id).toBe('owner_123');
  });
});
