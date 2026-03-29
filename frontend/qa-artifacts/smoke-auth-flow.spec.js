import { test, expect } from '@playwright/test';
import {
  installApiMocks,
  seedClientRegisterData,
} from './_helpers/mocks.js';

const BASE_URL = (process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');

test.describe('Smoke: auth + OTP + recovery', () => {
  test('register screen renders', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context);
    await context.addInitScript(() => {
      localStorage.clear();
    });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/register`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByTestId('register-submit')).toBeVisible();

    await context.close();
  });

  test('verify-sms renders and verify button works', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context);
    await context.addInitScript(seedClientRegisterData);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/verify-sms`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load');
    await expect(page.getByRole('alert')).toHaveCount(0);

    // Ingresar código 123456
    for (let i = 0; i < 6; i += 1) {
      await page.getByTestId(`otp-input-${i}`).fill(String(i + 1));
    }
    await expect(page.getByTestId('verify-btn')).toBeEnabled();
    await page.getByTestId('verify-btn').click();

    // Debe navegar a /verified (o al menos no caer en ErrorBoundary)
    await page.waitForTimeout(300);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page).toHaveURL(/\/verified/);

    await context.close();
  });

  test('verified screen continues to role selection', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context);
    await context.addInitScript(() => {
      // RoleSelection exige password en registerData cuando phoneVerified=true.
      localStorage.setItem('phoneVerified', 'true');
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('userId', 'user-1');
      localStorage.setItem(
        'registerData',
        JSON.stringify({
          nombre: 'Juan',
          apellido: 'Pérez',
          email: 'juan@test.cl',
          celular: '912345678',
          rut: '12345678-9',
          password: 'Password123!',
        })
      );
      localStorage.setItem('verificationChannel', 'sms');
    });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/verified`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: /continuar/i }).click();
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(/\/select-role/);

    await context.close();
  });

  test('role selection: client path navigates to client home', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context);
    await context.addInitScript(() => {
      localStorage.setItem('phoneVerified', 'true');
      localStorage.setItem(
        'registerData',
        JSON.stringify({
          nombre: 'Juan',
          apellido: 'Pérez',
          email: 'juan@test.cl',
          celular: '912345678',
          password: 'Password123!',
        })
      );
    });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/select-role`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load');
    await expect(page.getByRole('alert')).toHaveCount(0);

    // Un toque debe avanzar (handleOptionClick)
    await page.getByRole('button', { name: /Soy Cliente/i }).click();
    await page.waitForTimeout(300);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page).toHaveURL(/\/client\/home/);

    await context.close();
  });

  test('login screen renders', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context);
    await context.addInitScript(() => localStorage.clear());
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByLabel(/correo o rut/i)).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();

    await context.close();
  });

  test('forgot password screen renders', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context);
    await context.addInitScript(() => localStorage.clear());
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/forgot-password`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Continuar — enviar código SMS/i })).toBeVisible();

    await context.close();
  });
});

