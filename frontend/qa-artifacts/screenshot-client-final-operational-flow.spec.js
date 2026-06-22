import { test, expect } from '@playwright/test';
import { resolvePlaywrightBaseUrl } from '../scripts/e2ePreviewConstants.mjs';
import { installApiMocks, seedClientServiceFlow } from './_helpers/mocks.js';

const BASE_URL = resolvePlaywrightBaseUrl();

test.describe('Screenshots: Cliente flujo operacional final', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  test('flujo post-reserva (6 pantallas + avisos)', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context);
    await context.addInitScript(seedClientServiceFlow);
    await context.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('authToken', 'test-token');
      localStorage.setItem('userId', 'client-1');
      localStorage.setItem('userRole', 'client');
      localStorage.setItem('legalAcceptedAt', new Date().toISOString());
      localStorage.setItem('maqgo_simulation_enabled', 'true');
      localStorage.setItem('reservationType', 'immediate');
      localStorage.setItem('priceType', 'hour');
      localStorage.setItem('selectedHours', '4');
      localStorage.setItem('totalAmount', '180000');
      localStorage.setItem('maxTotalAmount', '180000');
      localStorage.setItem('selectedMachinery', 'retroexcavadora');
      localStorage.setItem('serviceStatus', 'assigned');
      localStorage.setItem('currentServiceId', 'svc-123');
      localStorage.setItem('selectedProvider', JSON.stringify({
        id: 'prov-1',
        eta_minutes: 25,
        distance: 4.2,
        rating: 4.8,
        transport_fee: 25000,
        price_per_hour: 45000,
        machineData: { primaryPhoto: null },
      }));
      localStorage.setItem('acceptedProvider', JSON.stringify({
        providerOperatorName: 'Juan Pérez',
        operatorRut: '12.345.678-9',
        licensePlate: 'ABCD12',
        rating: 4.8,
        eta_minutes: 25,
        machineData: { primaryPhoto: null },
      }));
    });

    const page = await context.newPage();

    const assertNoPushBanner = async () => {
      await expect(page.getByText('Activa notificaciones de MAQGO')).toHaveCount(0);
      await expect(page.getByText('Activar notificaciones')).toHaveCount(0);
      await expect(page.getByText('Más tarde')).toHaveCount(0);
    };

    await page.goto(`${BASE_URL}/client/payment-result?simulate=connection_error`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await expect(page.getByText(/reserva confirmada/i)).toBeVisible({ timeout: 15_000 });
    await assertNoPushBanner();
    await page.waitForTimeout(600);
    await page.screenshot({ path: '../archive/qa-screenshots/qa-screenshots-final/final73-client-confirmed.png', fullPage: true });

    await page.goto(`${BASE_URL}/client/assigned`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await expect(page.getByText(/¡operador asignado!/i)).toBeVisible({ timeout: 15_000 });
    await assertNoPushBanner();
    await page.waitForTimeout(600);
    await page.screenshot({ path: '../archive/qa-screenshots/qa-screenshots-final/final73-client-assigned.png', fullPage: true });

    await context.addInitScript(() => {
      localStorage.setItem('operatorArrived', 'true');
    });
    await page.goto(`${BASE_URL}/client/provider-arrived`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await expect(page.getByText(/operador.*lleg/i)).toBeVisible({ timeout: 15_000 });
    await assertNoPushBanner();
    await page.waitForTimeout(600);
    await page.screenshot({ path: '../archive/qa-screenshots/qa-screenshots-final/final73-client-arrived.png', fullPage: true });

    await page.goto(`${BASE_URL}/client/service-active`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await expect(page.getByText(/servicio en curso/i)).toBeVisible({ timeout: 15_000 });
    await assertNoPushBanner();
    await page.waitForTimeout(600);
    await page.screenshot({ path: '../archive/qa-screenshots/qa-screenshots-final/final73-client-active.png', fullPage: true });

    await page.goto(`${BASE_URL}/client/service-finished`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await expect(page.getByText('Servicio finalizado')).toBeVisible({ timeout: 15_000 });
    await assertNoPushBanner();
    await page.waitForTimeout(600);
    await page.screenshot({ path: '../archive/qa-screenshots/qa-screenshots-final/final73-client-finished.png', fullPage: true });

    await page.goto(`${BASE_URL}/client/rate`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await expect(page.getByText(/¿cómo fue tu experiencia\?/i)).toBeVisible({ timeout: 15_000 });
    await assertNoPushBanner();
    await page.waitForTimeout(600);
    await page.screenshot({ path: '../archive/qa-screenshots/qa-screenshots-final/final73-client-rate.png', fullPage: true });

    await page.goto(`${BASE_URL}/client/avisos`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await expect(page.getByText(/centro de avisos/i)).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: '../archive/qa-screenshots/qa-screenshots-final/final73-client-avisos.png', fullPage: true });

    await context.close();
  });
});
