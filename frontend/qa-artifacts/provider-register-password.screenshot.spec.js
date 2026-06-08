import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { resolvePlaywrightBaseUrl } from '../scripts/e2ePreviewConstants.mjs';
import { installApiMocks } from './_helpers/mocks.js';

const BASE_URL = resolvePlaywrightBaseUrl();
const OUT_DIR = path.resolve(process.cwd(), 'qa-artifacts/out');
const SCREENSHOT_PATH = path.join(OUT_DIR, 'provider-register-details-otp-only.png');

test.describe('Provider register (evidence)', () => {
  test('step details ya no pide contraseña (OTP-only)', async ({ browser }) => {
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

    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
    await context.close();
  });
});
