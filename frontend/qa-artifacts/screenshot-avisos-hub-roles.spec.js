import { test, expect } from '@playwright/test';
import { resolvePlaywrightBaseUrl } from '../scripts/e2ePreviewConstants.mjs';
import { installApiMocks } from './_helpers/mocks.js';

const BASE_URL = resolvePlaywrightBaseUrl();

test.describe('Screenshots: Centro de Avisos por rol', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  test('Cliente / Proveedor / Operador', async ({ browser }) => {
    const seedCommon = async (context) => {
      await context.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('token', 'test-token');
        localStorage.setItem('authToken', 'test-token');
        localStorage.setItem('legalAcceptedAt', new Date().toISOString());
      });
    };

    const clientContext = await browser.newContext();
    await installApiMocks(clientContext, { notificationsRole: 'client' });
    await seedCommon(clientContext);
    await clientContext.addInitScript(() => {
      localStorage.setItem('userRole', 'client');
      localStorage.setItem('userId', 'client-1');
    });
    const clientPage = await clientContext.newPage();
    await clientPage.goto(`${BASE_URL}/client/avisos`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await expect(clientPage.getByText(/centro de avisos/i)).toBeVisible({ timeout: 15_000 });
    await clientPage.waitForTimeout(600);
    await clientPage.screenshot({ path: '../archive/qa-screenshots/qa-screenshots-final/avisos-client.png', fullPage: true });
    await clientContext.close();

    const providerContext = await browser.newContext();
    await installApiMocks(providerContext, { notificationsRole: 'provider' });
    await seedCommon(providerContext);
    await providerContext.addInitScript(() => {
      localStorage.setItem('userRole', 'provider');
      localStorage.setItem('providerRole', 'super_master');
      localStorage.setItem('userId', 'provider-qa-001');
      localStorage.setItem('ownerId', 'owner-qa-001');
    });
    const providerPage = await providerContext.newPage();
    await providerPage.goto(`${BASE_URL}/provider/avisos`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await expect(providerPage.getByText(/centro de avisos/i)).toBeVisible({ timeout: 15_000 });
    await providerPage.waitForTimeout(600);
    await providerPage.screenshot({ path: '../archive/qa-screenshots/qa-screenshots-final/avisos-provider.png', fullPage: true });
    await providerContext.close();

    const operatorContext = await browser.newContext();
    await installApiMocks(operatorContext, { notificationsRole: 'operator' });
    await seedCommon(operatorContext);
    await operatorContext.addInitScript(() => {
      localStorage.setItem('userRole', 'operator');
      localStorage.setItem('providerRole', 'operator');
      localStorage.setItem('userId', 'operator-qa-001');
      localStorage.setItem('ownerId', 'owner-qa-001');
    });
    const operatorPage = await operatorContext.newPage();
    await operatorPage.goto(`${BASE_URL}/operator/avisos`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await expect(operatorPage.getByText(/centro de avisos/i)).toBeVisible({ timeout: 15_000 });
    await operatorPage.waitForTimeout(600);
    await operatorPage.screenshot({ path: '../archive/qa-screenshots/qa-screenshots-final/avisos-operator.png', fullPage: true });
    await operatorContext.close();
  });
});
