/**
 * Smoke crítico tipo “mobility app”: pocos casos, alto valor.
 * Requiere mocks de API (installApiMocks) — sin backend real.
 */
import { test, expect } from '@playwright/test';
import { resolvePlaywrightBaseUrl } from '../scripts/e2ePreviewConstants.mjs';
import { installApiMocks } from './_helpers/mocks.js';

const BASE_URL = resolvePlaywrightBaseUrl();

async function fillLoginPhone(page, nineDigits) {
  const d = String(nineDigits || '').replace(/\D/g, '').slice(0, 9);
  const input = page.locator('#login-phone');
  await expect(input).toBeVisible({ timeout: 15_000 });
  await input.fill(d);
}

test.describe('Smoke crítico: login SMS + embudo cliente', () => {
  test('login: celular → enviar código → pantalla OTP sin alertas', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await installApiMocks(context);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForLoadState('load');
    await expect(page.getByRole('alert')).toHaveCount(0);

    await fillLoginPhone(page, '912345678');
    await page.getByRole('button', { name: /continuar con tu celular/i }).click();

    await expect(page.getByRole('heading', { name: /verificar código/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('login-otp-input-0')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('alert')).toHaveCount(0);

    await context.close();
  });

  test('P1 maquinaria: CTA Continuar visible (viewport móvil, cliente logueado)', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 700 },
    });
    await installApiMocks(context);
    await context.addInitScript(() => {
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('authToken', 'test-token');
      localStorage.setItem('userId', 'client-1');
      localStorage.setItem('userRole', 'client');
      localStorage.setItem('reservationType', 'immediate');
    });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/client/machinery`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForLoadState('load');
    await expect(page.getByRole('alert')).toHaveCount(0);

    const cta = page.getByRole('button', { name: /^continuar$/i });
    await expect(cta).toBeVisible();
    await expect(cta).toBeInViewport();

    await context.close();
  });
});
