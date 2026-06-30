import { test, expect } from '@playwright/test';
import { installApiMocks } from './_helpers/mocks';

async function seedProviderSession(page, { providerRole = 'super_master' } = {}) {
  await page.addInitScript(({ providerRole }) => {
    localStorage.setItem('userRole', 'provider');
    localStorage.setItem('providerRole', providerRole);
    localStorage.setItem('userId', 'provider-qa-001');
    localStorage.setItem('token', 'provider-token');
    localStorage.setItem('authToken', 'provider-token');
    localStorage.setItem('legalAcceptedAt', new Date().toISOString());
    localStorage.setItem('providerAvailable', 'true');
    localStorage.setItem('ownerId', 'owner-qa-001');
  }, { providerRole });
}

async function seedOperatorSession(page) {
  await page.addInitScript(() => {
    localStorage.setItem('userRole', 'operator');
    localStorage.setItem('providerRole', 'operator');
    localStorage.setItem('userId', 'operator-qa-001');
    localStorage.setItem('token', 'operator-token');
    localStorage.setItem('authToken', 'operator-token');
    localStorage.setItem('legalAcceptedAt', new Date().toISOString());
    localStorage.setItem('providerAvailable', 'true');
    localStorage.setItem('ownerId', 'owner-qa-001');
  });
}

function seedIncomingRequest(page, { id = 'req-qa-001' } = {}) {
  return page.addInitScript(({ id }) => {
    const incoming = {
      id,
      reservationType: 'immediate',
      machineryType: 'retroexcavadora',
      workDescription: 'Excavación básica',
      address: 'Av. Providencia 123, Providencia',
      basePrice: 80000,
      transportFee: 15000,
      offerTimeoutSeconds: 60,
      urgencyType: 'today',
      urgencyWindowMinutes: 120,
      client: { name: 'Cliente MAQGO' },
      confirmedDepartureLocation: {
        lat: -33.4372,
        lng: -70.6506,
        source: 'gps',
        confirmedByUserId: 'operator-qa-001',
      },
      etaCommitMinutes: 35,
    };
    localStorage.setItem('incomingRequest', JSON.stringify(incoming));
  }, { id });
}

test.describe('Capturas: proveedor + operador', () => {
  test('Proveedor: Home + solicitud recibida + servicio confirmado', async ({ page, baseURL }) => {
    await installApiMocks(page);
    await seedProviderSession(page, { providerRole: 'super_master' });
    await seedIncomingRequest(page, { id: 'req-prov-001' });

    await page.goto(`${baseURL}/provider/home`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('availability-toggle')).toBeVisible();
    await page.screenshot({ path: 'qa-artifacts/out/provider-01-home.png', fullPage: true });

    await page.goto(`${baseURL}/provider/request-received`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('accept-request-btn')).toBeVisible();
    await page.screenshot({ path: 'qa-artifacts/out/provider-02-request-received.png', fullPage: true });

    await page.goto(`${baseURL}/provider/accepted`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Servicio confirmado')).toBeVisible();
    await page.screenshot({ path: 'qa-artifacts/out/provider-03-accepted.png', fullPage: true });
  });

  test('Operador: Home + solicitud recibida (modo operador)', async ({ page, baseURL }) => {
    await installApiMocks(page);
    await seedOperatorSession(page);
    await seedIncomingRequest(page, { id: 'req-op-001' });

    await page.goto(`${baseURL}/operator/home`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Empresa')).toBeVisible();
    await page.screenshot({ path: 'qa-artifacts/out/operator-01-home.png', fullPage: true });

    await page.goto(`${baseURL}/provider/request-received`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('accept-request-btn')).toBeVisible();
    await page.screenshot({ path: 'qa-artifacts/out/operator-02-request-received.png', fullPage: true });

    await expect(page.getByText(/\d+:\d{2}/)).toBeVisible();
    await page.screenshot({ path: '../archive/qa-screenshots/qa-screenshots-final/operator-request-received-timer.png', fullPage: true });

    const confirmBtn = page.getByTestId('accept-request-btn');
    await confirmBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: '../archive/qa-screenshots/qa-screenshots-final/operator-confirmar-ubicacion-y-llegada.png', fullPage: true });
  });
});
