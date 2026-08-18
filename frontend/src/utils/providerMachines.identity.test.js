import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('./api', () => {
  return {
    default: 'https://example.test',
    fetchWithAuth: vi.fn(),
  };
});

import BACKEND_URL, { fetchWithAuth } from './api';
import { createMachineInApi, fetchProviderMachinesFromApi, getMachines, saveMachines } from './providerMachines.js';

// Unit tests: normalizeOperators se testea INDIRECCIONALMENTE mediante:
// - assertMachineHasRealOperator (que usa normalizeOperators internamente)
// - backfillOperatorsFromOnboarding (lo mismo)
// Para ello usamos createMachineInApi y saveMachines/getMachines que lo invocan.

// Helper para acceder a la regla de normalización indirectamente:
// createMachineInApi llama a assertMachineHasRealOperator → normalizeOperators.
// Si operador no pasa la normalización → throw "Cada maquina debe tener..."
function assertOperatorNormalizes(inputOperators) {
  installLocalStorageMock({ userId: 'owner_123', providerMachines: '[]' });
  mockFetchJsonOnce({ ok: true, machine: { id: 'mach_1', machineryType: 'retroexcavadora' } });
  return createMachineInApi({
    machineryType: 'retroexcavadora',
    licensePlate: 'TEST01',
    operators: inputOperators,
  });
}

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

function _rawPostFromLastFetchCall() {
  const allCalls = fetchWithAuth.mock.calls || [];
  if (allCalls.length === 0) return null;
  // Buscar la última llamada que tenga method POST en options
  for (let i = allCalls.length - 1; i >= 0; i--) {
    const opts = allCalls[i] && allCalls[i][1];
    if (opts && String(opts.method || 'POST').toUpperCase() === 'POST') {
      const rawBody = opts.body;
      try {
        return typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
      } catch {
        return rawBody;
      }
    }
  }
  return null;
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
    fetchWithAuth.mockReset();
    installLocalStorageMock({ userId: 'owner_123', providerMachines: '[]' });
    mockFetchJsonOnce({ ok: true, machine: { id: 'mach_1', machineryType: 'retroexcavadora', licensePlate: 'ABCD12' } });
    const before = fetchWithAuth.mock.calls.length;
    await createMachineInApi({
      machineryType: 'retroexcavadora',
      licensePlate: 'ABCD12',
      operators: [{ id: 'op_1', name: 'Juan Pérez', phone: '+56970000000', isPrimary: true }],
    });
    expect(fetchWithAuth.mock.calls.length).toBeGreaterThan(before);

    const call = fetchWithAuth.mock.calls[fetchWithAuth.mock.calls.length - 1];
    expect(call[0]).toBe(`${BACKEND_URL}/api/machines`);
    const body = JSON.parse(call[1].body);
    expect(Object.prototype.hasOwnProperty.call(body, 'provider_id')).toBe(false);
  });

  it('createMachineInApi(machine, providerId) incluye provider_id cuando se especifica', async () => {
    fetchWithAuth.mockReset();
    installLocalStorageMock({ userId: 'owner_123', providerMachines: '[]' });
    mockFetchJsonOnce({ ok: true, machine: { id: 'mach_1', provider_id: 'owner_123', machineryType: 'retroexcavadora', licensePlate: 'ABCD12' } });
    const callBefore = fetchWithAuth.mock.calls.length;
    await createMachineInApi(
      {
        machineryType: 'retroexcavadora',
        licensePlate: 'ABCD12',
        operators: [{ id: 'op_1', name: 'Juan Pérez', phone: '+56970000000', isPrimary: true }],
      },
      'owner_123'
    );
    expect(fetchWithAuth.mock.calls.length).toBeGreaterThan(callBefore);

    const call = fetchWithAuth.mock.calls[fetchWithAuth.mock.calls.length - 1];
    expect(call[0]).toBe(`${BACKEND_URL}/api/machines`);
    const body = JSON.parse(call[1].body);
    expect(body.provider_id).toBe('owner_123');
  });

  it('(TEST A) Operador con RUT válido y SIN phone se conserva', async () => {
    fetchWithAuth.mockReset();
    installLocalStorageMock({ userId: 'owner_123', providerMachines: '[]' });
    mockFetchJsonOnce({ ok: true, machine: { id: 'mach_1', machineryType: 'retroexcavadora', licensePlate: 'AABB-11' } });
    const operadoresInput = [
      {
        nombre: 'Claudio',
        apellido: 'Valle',
        rut: '11.111.111-1',
        isPrimary: true,
      },
    ];
    const beforeCalls = fetchWithAuth.mock.calls.length;
    // NO debe lanzar: assertMachineHasRealOperator() reconoce este operador como REAL
    // pese a NO tener phone (solo nombre+apellido+RUT válido).
    const result = await createMachineInApi({
      machineryType: 'retroexcavadora',
      licensePlate: 'AABB-11',
      operators: operadoresInput,
    });
    expect(result).toBeDefined();
    expect(fetchWithAuth.mock.calls.length).toBeGreaterThan(beforeCalls);
    const body = _rawPostFromLastFetchCall();
    expect(body).not.toBeNull();
    expect(body.licensePlate).toBe('AABB-11');
    expect(Array.isArray(body.operators)).toBe(true);
    // El operador NO se filtró: operators.length === 1.
    expect(body.operators.length).toBe(1);
    // Payload POST conserva campos tal como los envía ReviewScreen (nombre/apellido/rut raw).
    expect(body.operators[0].nombre).toBe('Claudio');
    expect(body.operators[0].apellido).toBe('Valle');
    expect(body.operators[0].rut).toBeTruthy();
    // Phone está ausente o vacío (P4 no lo pide, Claudio no lo ingresó).
    expect(String(body.operators[0].phone || '')).toBe('');
    expect(body.operators[0].isPrimary).toBe(true);
  });

  it('(TEST B) Operador con phone válido pasa', async () => {
    fetchWithAuth.mockReset();
    installLocalStorageMock({ userId: 'owner_123', providerMachines: '[]' });
    mockFetchJsonOnce({ ok: true, machine: { id: 'mach_2', machineryType: 'retroexcavadora' } });
    const before = fetchWithAuth.mock.calls.length;
    await createMachineInApi({
      machineryType: 'retroexcavadora',
      licensePlate: 'BBCC-22',
      operators: [{ name: 'Ana Perez', phone: '+56987654321', isPrimary: true }],
    });
    expect(fetchWithAuth.mock.calls.length).toBeGreaterThan(before);
    const body = _rawPostFromLastFetchCall();
    expect(body.operators.length).toBe(1);
    expect(body.operators[0].phone).toBe('+56987654321');
  });

  it('(TEST C) Operador con ID estable válido pasa', async () => {
    fetchWithAuth.mockReset();
    installLocalStorageMock({ userId: 'owner_123', providerMachines: '[]' });
    mockFetchJsonOnce({ ok: true, machine: { id: 'mach_3', machineryType: 'camion_aljibe' } });
    const before = fetchWithAuth.mock.calls.length;
    await createMachineInApi({
      machineryType: 'camion_aljibe',
      licensePlate: 'CCDD-33',
      operators: [
        { id: 'usr_real_1', name: 'Luis Soto', isPrimary: true },
      ],
    });
    expect(fetchWithAuth.mock.calls.length).toBeGreaterThan(before);
    const body = _rawPostFromLastFetchCall();
    expect(body.operators.length).toBe(1);
    expect(body.operators[0].id).toBe('usr_real_1');
  });

  it('(TEST D) Operador SIN RUT + SIN ID + SIN phone → falla', async () => {
    fetchWithAuth.mockReset();
    installLocalStorageMock({ userId: 'owner_123', providerMachines: '[]' });
    mockFetchJsonOnce({ ok: true, machine: { id: 'mach_x' } });
    await expect(
      createMachineInApi({
        machineryType: 'retroexcavadora',
        licensePlate: 'DDEE-44',
        operators: [{ nombre: 'Juan', apellido: 'Pérez' }],
      })
    ).rejects.toThrow(/operador real asignado/);
  });

  it('(TEST E) Operador placeholder nombre se rechaza aunque tenga rut', async () => {
    fetchWithAuth.mockReset();
    installLocalStorageMock({ userId: 'owner_123', providerMachines: '[]' });
    mockFetchJsonOnce({ ok: true, machine: { id: 'mach_y' } });
    await expect(
      createMachineInApi({
        machineryType: 'bulldozer',
        licensePlate: 'EEFF-55',
        operators: [{ name: 'Sin operador', rut: '11.111.111-1', isPrimary: true }],
      })
    ).rejects.toThrow(/operador real asignado/);
  });

  it('(TEST F) Máquina sin operadores → 400 / mensaje', async () => {
    fetchWithAuth.mockReset();
    installLocalStorageMock({ userId: 'owner_123', providerMachines: '[]' });
    mockFetchJsonOnce({ ok: false, status: 400, detail: 'Cada máquina debe tener al menos un operador real asignado' });
    await expect(
      createMachineInApi({ machineryType: 'retroexcavadora', licensePlate: 'OPQR-99', operators: [] })
    ).rejects.toThrow(/operador real asignado/);
  });
});
