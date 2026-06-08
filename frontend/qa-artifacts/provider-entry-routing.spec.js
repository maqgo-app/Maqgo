import { test, expect } from '@playwright/test';
import { resolvePlaywrightBaseUrl } from '../scripts/e2ePreviewConstants.mjs';

const BASE_URL = resolvePlaywrightBaseUrl();

test.describe('Provider entry routing', () => {
  test('welcome provider CTA entra por login', async ({ page }) => {
    await page.goto(`${BASE_URL}/welcome`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForLoadState('load');

    await page.getByRole('button', { name: /Ofrecer mi maquinaria/i }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: /Iniciar sesión/i })).toBeVisible();
  });

  test('provider register sin sesión redirige a login', async ({ page }) => {
    await page.goto(`${BASE_URL}/provider/register`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForLoadState('load');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: /Iniciar sesión/i })).toBeVisible();
  });
});
