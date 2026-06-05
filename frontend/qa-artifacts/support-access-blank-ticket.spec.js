import { test, expect } from '@playwright/test';
import { resolvePlaywrightBaseUrl } from '../scripts/e2ePreviewConstants.mjs';
import { installApiMocks } from './_helpers/mocks.js';

const BASE_URL = resolvePlaywrightBaseUrl();

test.describe('Support access', () => {
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

