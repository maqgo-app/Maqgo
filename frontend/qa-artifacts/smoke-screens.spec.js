import { test, expect } from '@playwright/test';

/** Definí PLAYWRIGHT_BASE_URL para probar local (ej. http://127.0.0.1:4173 tras `vite preview`). */
const BASE_URL = (process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');

function json(status, body, headers = {}) {
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
    body: JSON.stringify(body),
  };
}

async function installApiMocks(context) {
  // Mock general: responde 200 a endpoints desconocidos para evitar hard-fails por rutas nuevas.
  await context.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // service-requests
    if (url.includes('/api/service-requests/pending')) {
      return route.fulfill(json(200, []));
    }
    if (url.includes('/api/service-requests/') && method === 'GET') {
      // Devuelve un servicio estable y legible.
      return route.fulfill(
        json(200, {
          id: 'svc-123',
          status: 'in_progress',
          machineryType: 'retroexcavadora',
          providerOperatorName: 'Juan Pérez',
          operatorRut: '12.345.678-9',
          location: { address: 'Av. Providencia 1234, Santiago' },
        })
      );
    }

    // messages
    if (url.includes('/api/messages/service/') && url.includes('/delta')) {
      return route.fulfill(json(200, []));
    }
    if (url.includes('/api/messages/service/')) {
      return route.fulfill(
        json(200, [
          {
            id: 'm1',
            service_id: 'svc-123',
            sender_type: 'operator',
            sender_id: 'op-1',
            content: 'Voy en camino',
            created_at: new Date(Date.now() - 60_000).toISOString(),
            read: false,
          },
        ])
      );
    }
    if (url.includes('/api/messages/read/')) {
      return route.fulfill(json(200, { success: true }));
    }
    if (url.includes('/api/messages/send')) {
      return route.fulfill(json(200, { success: true, message_id: 'm-new', created_at: new Date().toISOString() }));
    }

    // users/admin/providers (fallback benigno)
    if (url.includes('/api/users/') && method === 'GET') {
      return route.fulfill(json(200, { id: 'user-1', role: 'provider', available: true, name: 'Test User' }));
    }
    if (url.includes('/api/users/') && (method === 'PATCH' || method === 'PUT')) {
      return route.fulfill(json(200, { success: true }));
    }
    if (url.includes('/api/providers/match')) {
      return route.fulfill(json(200, { providers: [] }));
    }

    // Default: no romper pantallas por endpoints accesorios.
    return route.fulfill(json(200, { ok: true }));
  });
}

function seedForClientServiceFlow() {
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('userId', 'client-1');
  localStorage.setItem('userRole', 'client');
  localStorage.setItem('currentServiceId', 'svc-123');
  localStorage.setItem('selectedMachinery', 'retroexcavadora');
  localStorage.setItem('selectedHours', '4');
  localStorage.setItem('serviceLat', '-33.4489');
  localStorage.setItem('serviceLng', '-70.6693');
  localStorage.setItem('serviceLocation', 'Av. Providencia 1234, Santiago');
  localStorage.setItem(
    'acceptedProvider',
    JSON.stringify({
      operator_name: 'Juan Pérez',
      operator_rut: '12.345.678-9',
      rating: 4.8,
      licensePlate: 'ABCD12',
    })
  );
}

function seedForProvider() {
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('userId', 'provider-1');
  localStorage.setItem('userRole', 'provider');
  localStorage.setItem('providerOnboardingCompleted', 'true');
  localStorage.setItem(
    'providerData',
    JSON.stringify({
      businessName: 'Juan Pérez',
      rut: '12.345.678-9',
    })
  );
  localStorage.setItem(
    'bankData',
    JSON.stringify({
      bank: 'Banco Estado',
      accountType: 'vista',
      accountNumber: '12345678',
      holderName: 'Juan Pérez',
      holderRut: '12.345.678-9',
    })
  );
}

function seedForOperator() {
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('userId', 'operator-1');
  localStorage.setItem('userRole', 'operator');
  localStorage.setItem('providerAvailable', 'true');
  localStorage.setItem('ownerId', 'provider-1');
  localStorage.setItem(
    'providerData',
    JSON.stringify({
      businessName: 'Transportes Silva SpA',
    })
  );
}

test.describe('Smoke: pantallas críticas con mocks', () => {
  test('cliente: service-active, in-progress, searching, provider-arrived', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context);
    await context.addInitScript(seedForClientServiceFlow);
    const page = await context.newPage();

    const paths = [
      '/client/service-active',
      '/client/in-progress',
      '/client/searching',
      '/client/provider-arrived',
    ];

    for (const p of paths) {
      await page.goto(`${BASE_URL}${p}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('load');
      // Nunca debe caer al ErrorBoundary.
      await expect(page.getByRole('alert')).toHaveCount(0);
      // Debe existir el contenedor principal.
      await expect(page.locator('.maqgo-app')).toHaveCount(1);
    }

    await context.close();
  });

  test('chat: abre conversación y no crashea', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context);
    await context.addInitScript(seedForClientServiceFlow);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/chat/svc-123`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByText(/Cargando mensajes|Inicia la conversación|Voy en camino/i)).toBeVisible();

    await context.close();
  });

  test('proveedor: home + banco (Banco Estado vista autofill no rompe)', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context);
    await context.addInitScript(seedForProvider);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/provider/home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('.maqgo-app')).toHaveCount(1);

    await page.goto(`${BASE_URL}/provider/profile/banco`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByTestId('bank-select')).toBeVisible();
    await expect(page.getByTestId('account-number-input')).toBeVisible();

    await context.close();
  });

  test('operador: home carga y polling pending mockeado no crashea', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context);
    await context.addInitScript(seedForOperator);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/operator/home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('.maqgo-app')).toHaveCount(1);

    await context.close();
  });
});

