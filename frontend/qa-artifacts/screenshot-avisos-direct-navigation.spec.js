import { test, expect } from '@playwright/test';
import { resolvePlaywrightBaseUrl } from '../scripts/e2ePreviewConstants.mjs';
import { installApiMocks } from './_helpers/mocks.js';

const BASE_URL = resolvePlaywrightBaseUrl();

test.describe('Screenshots: Avisos navega directo (sin modal)', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  test('Proveedor: tap en aviso sin ack abre deepLink', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context, { notificationsRole: 'provider' });
    await context.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('authToken', 'test-token');
      localStorage.setItem('legalAcceptedAt', new Date().toISOString());
      localStorage.setItem('userRole', 'provider');
      localStorage.setItem('providerRole', 'super_master');
      localStorage.setItem('userId', 'provider-qa-001');
      localStorage.setItem('ownerId', 'owner-qa-001');
    });

    const page = await context.newPage();
    await page.goto(`${BASE_URL}/provider/avisos`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await expect(page.getByText(/centro de avisos/i)).toBeVisible({ timeout: 15_000 });

    const assigned = page.getByRole('button', { name: /operador asignado/i }).first();
    await expect(assigned).toBeVisible({ timeout: 15_000 });
    await assigned.click();

    await page.waitForURL(/\/provider\/accepted/, { timeout: 15_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: '../archive/qa-screenshots/qa-screenshots-final/avisos-provider-click-assigned.png', fullPage: true });

    await context.close();
  });
});

