import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { resolvePlaywrightBaseUrl } from '../scripts/e2ePreviewConstants.mjs';
import { installApiMocks } from './_helpers/mocks.js';

const BASE_URL = resolvePlaywrightBaseUrl();
const OUT_DIR = path.resolve(process.cwd(), 'qa-artifacts/out');

function out(name) {
  return path.join(OUT_DIR, name);
}

test.describe('Provider register (before/after)', () => {
  test('capturas phone → otp → details (OTP-only)', async ({ browser }) => {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const context = await browser.newContext();
    await installApiMocks(context);
    await context.addInitScript(() => {
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('authToken', 'test-token');
      localStorage.setItem('userId', 'user-1');
      localStorage.setItem('userRole', 'client');
      localStorage.setItem('userRoles', JSON.stringify(['client']));
      localStorage.setItem('legalAcceptedAt', new Date().toISOString());
    });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/provider/register`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForLoadState('load');

    await expect(page.getByRole('heading', { name: /Ofrecer mi maquinaria/i })).toBeVisible();
    await page.screenshot({ path: out('provider-register-01-phone.png'), fullPage: true });

    await page.getByLabel(/Nueve dígitos del celular/i).fill('912345678');
    await page.getByRole('button', { name: /Continuar/i }).click();

    await expect(page.getByRole('heading', { name: /Código de verificación/i })).toBeVisible();
    await page.screenshot({ path: out('provider-register-02-otp.png'), fullPage: true });

    await page.getByTestId('provider-register-otp-0').click();
    await page.keyboard.type('123456');

    await expect(page.getByRole('heading', { name: /Tu cuenta de proveedor/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Contraseña/i })).toHaveCount(0);
    await page.screenshot({ path: out('provider-register-03-details-after-otp.png'), fullPage: true });

    await context.close();
  });

  test('captura details cuando se salta OTP (celular ya verificado)', async ({ browser }) => {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const context = await browser.newContext();
    await installApiMocks(context);
    await context.addInitScript(() => {
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('authToken', 'test-token');
      localStorage.setItem('userId', 'user-1');
      localStorage.setItem('userRole', 'client');
      localStorage.setItem('userRoles', JSON.stringify(['client']));
      localStorage.setItem('userPhone', '912345678');
      localStorage.setItem('legalAcceptedAt', new Date().toISOString());
    });

    const page = await context.newPage();
    await page.goto(`${BASE_URL}/provider/register`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForLoadState('load');

    await expect(page.getByRole('heading', { name: /Tu cuenta de proveedor/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Contraseña/i })).toHaveCount(0);
    await page.screenshot({ path: out('provider-register-04-details-skip-otp.png'), fullPage: true });

    await context.close();
  });
});
