import { test, expect } from '@playwright/test';
import { resolvePlaywrightBaseUrl } from '../scripts/e2ePreviewConstants.mjs';
import { installApiMocks } from './_helpers/mocks.js';

const BASE_URL = resolvePlaywrightBaseUrl();

test.describe('Support access', () => {
  test('mantiene contenedor responsive en desktop', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await installApiMocks(context);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/support/access?reason=inactive_user&role=provider`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForLoadState('load');

    await expect(page.getByRole('heading', { name: /Recuperar acceso/i })).toBeVisible();
    const shell = page.locator('.maqgo-app, .maqgo-login-container').first();
    const box = await shell.boundingBox();

    expect(box).toBeTruthy();
    expect(box.width).toBeLessThanOrEqual(520);

    await context.close();
  });

  test('permite crear ticket sin celular (blanco)', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/support/access?reason=inactive_user&role=provider`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForLoadState('load');

    await expect(page.getByRole('heading', { name: /Recuperar acceso/i })).toBeVisible();
    await page.getByRole('button', { name: /Enviar solicitud/i }).click();
    await expect(page.getByText(/Recibimos tu solicitud/i)).toBeVisible();

    await context.close();
  });
});
