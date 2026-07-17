import { test, expect } from '@playwright/test';
import { resolvePlaywrightBaseUrl } from '../scripts/e2ePreviewConstants.mjs';
import { installApiMocks } from './_helpers/mocks.js';

const BASE_URL = resolvePlaywrightBaseUrl();

test.describe('Screenshots: Operador reportar incidente', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  test('Operador: En ruta + modal incidente', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context);

    await context.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('token', 'operator-token');
      localStorage.setItem('authToken', 'operator-token');
      localStorage.setItem('legalAcceptedAt', new Date().toISOString());
      localStorage.setItem('userRole', 'provider');
      localStorage.setItem('providerRole', 'operator');
      localStorage.setItem('userId', 'operator-qa-001');
      localStorage.setItem('providerAvailable', 'true');
      localStorage.setItem('ownerId', 'owner-qa-001');
      localStorage.setItem('currentServiceId', 'svc-123');
      localStorage.setItem('serviceLat', String(-33.4489));
      localStorage.setItem('serviceLng', String(-70.6693));
      localStorage.setItem('serviceLocation', 'Av. Providencia 1234, Santiago');
      localStorage.setItem('selectedMachinery', 'retroexcavadora');
      localStorage.setItem('selectedHours', '4');
      localStorage.setItem('acceptedRequest', JSON.stringify({
        id: 'req-op-001',
        reservationType: 'immediate',
        machineryType: 'retroexcavadora',
        clientName: 'Cliente MAQGO',
        clientPhone: '+56 9 8765 4321',
        location: 'Av. Providencia 1234, Santiago',
        workCoords: { lat: -33.4489, lng: -70.6693 },
        eta: 35,
      }));
    });

    const page = await context.newPage();
    await page.goto(`${BASE_URL}/operator/en-route`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await expect(page.getByText('En ruta', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/en ruta al sitio del servicio/i)).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: '../archive/qa-screenshots/qa-screenshots-final/operator-en-route.png', fullPage: true });

    await page.getByTestId('report-incident-btn').click();
    await expect(page.getByRole('heading', { name: 'Reportar incidente' })).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: '../archive/qa-screenshots/qa-screenshots-final/operator-incident-modal.png', fullPage: true });

    await context.close();
  });
});
