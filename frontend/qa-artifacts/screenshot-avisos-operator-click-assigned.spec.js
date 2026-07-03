import { test, expect } from '@playwright/test';
import { resolvePlaywrightBaseUrl } from '../scripts/e2ePreviewConstants.mjs';
import { installApiMocks } from './_helpers/mocks.js';

const BASE_URL = resolvePlaywrightBaseUrl();

test.describe('Screenshots: Operador abre aviso de servicio asignado', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  test('Operador: click en "Servicio asignado" abre Home', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context, { notificationsRole: 'operator' });
    await context.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('authToken', 'test-token');
      localStorage.setItem('legalAcceptedAt', new Date().toISOString());
      localStorage.setItem('userRole', 'operator');
      localStorage.setItem('providerRole', 'operator');
      localStorage.setItem('userId', 'operator-qa-001');
      localStorage.setItem('ownerId', 'owner-qa-001');
    });

    const page = await context.newPage();
    await page.goto(`${BASE_URL}/operator/avisos`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await expect(page.getByText(/centro de avisos/i)).toBeVisible({ timeout: 15_000 });

    const assigned = page.getByRole('button', { name: /servicio asignado/i }).first();
    await expect(assigned).toBeVisible({ timeout: 15_000 });
    await assigned.click();

    await page.waitForURL(/\/provider\/(en-route|in-progress|last-30)|\/operator\/completed/, { timeout: 15_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: '../archive/qa-screenshots/qa-screenshots-final/avisos-operator-click-assigned.png', fullPage: true });

    await context.close();
  });
});
