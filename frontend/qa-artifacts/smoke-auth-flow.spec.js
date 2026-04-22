import { test, expect } from '@playwright/test';
import { resolvePlaywrightBaseUrl } from '../scripts/e2ePreviewConstants.mjs';
import { installApiMocks } from './_helpers/mocks.js';

const BASE_URL = resolvePlaywrightBaseUrl();

test.describe('Smoke: auth + OTP + recovery', () => {
  test('/register redirects to login (OTP)', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto(`${BASE_URL}/register`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page).toHaveURL(/\/login/);

    await context.close();
  });

  test('/verify-sms legacy URL redirige a login unificado', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/verify-sms`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByLabel(/Nueve dígitos del celular/i)).toBeVisible();

    await context.close();
  });

  test('/verified redirects to login (legacy)', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context);
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/verified`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('#login-phone')).toBeVisible();

    await context.close();
  });

  test('/select-role legacy route falls back to welcome', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/select-role`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('start-client-btn')).toBeVisible();

    await context.close();
  });

  test('login screen renders', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByLabel(/Nueve dígitos del celular/i)).toBeVisible();
    await expect(page.locator('#login-phone')).toBeVisible();

    await context.close();
  });

  test('forgot password screen renders', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto(`${BASE_URL}/forgot-password`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByTestId('forgot-request-code')).toBeVisible();

    await context.close();
  });
});
