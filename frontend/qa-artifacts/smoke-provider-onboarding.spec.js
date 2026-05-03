import { test, expect } from '@playwright/test';
import { resolvePlaywrightBaseUrl } from '../scripts/e2ePreviewConstants.mjs';
import { installApiMocks, seedProviderSession } from './_helpers/mocks.js';

const BASE_URL = resolvePlaywrightBaseUrl();

test.describe('Smoke: provider onboarding + perfil', () => {
  test('provider core screens render (no crash)', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context);
    await context.addInitScript(seedProviderSession);
    const page = await context.newPage();

    const paths = [
      '/provider/home',
      '/provider/profile',
      '/provider/profile/empresa',
      '/provider/profile/banco',
      '/provider/profile/maqgo-billing',
      '/provider/machines',
      '/provider/history',
      '/provider/team',
      '/provider/tariffs',
    ];

    for (const p of paths) {
      await page.goto(`${BASE_URL}${p}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('load');
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.locator('.maqgo-app')).toHaveCount(1);
    }

    await context.close();
  });

  test('P3/5 tarifas: input precio renderiza bien en desktop (no truncado)', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await installApiMocks(context);
    await context.addInitScript(seedProviderSession);
    await context.addInitScript(() => {
      localStorage.setItem(
        'machineData',
        JSON.stringify({
          machineryType: 'excavadora',
          type: 'Excavadora Hidráulica',
        })
      );
      localStorage.removeItem('machinePricing');
    });

    const page = await context.newPage();
    await page.goto(`${BASE_URL}/provider/machine-photos-pricing`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load');

    const priceInput = page.getByTestId('price-input');
    await expect(priceInput).toBeVisible();
    await priceInput.fill('110000');
    await expect(priceInput).toHaveValue('110.000');

    const box = await priceInput.boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBeGreaterThan(260);

    await context.close();
  });

  test('Centro disponibilidad: Conectarme ahora cambia a Conectado (desktop)', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await installApiMocks(context);
    await context.addInitScript(seedProviderSession);
    await context.addInitScript(() => {
      localStorage.setItem('providerOnboardingCompleted', 'true');
      localStorage.setItem('providerData', JSON.stringify({ businessName: 'Transportes Silva SpA', rut: '12.345.678-9' }));
      localStorage.setItem('machineData', JSON.stringify({ machineryType: 'excavadora', licensePlate: 'ABCD12' }));
      localStorage.setItem('operatorsData', JSON.stringify([{ name: 'Juan Pérez' }]));
      localStorage.setItem('bankData', JSON.stringify({
        bank: 'Banco Estado',
        accountType: 'vista',
        accountNumber: '12345678',
        holderName: 'Transportes Silva SpA',
        holderRut: '12.345.678-9',
      }));
      localStorage.setItem('providerAvailable', 'false');
    });

    const page = await context.newPage();
    await page.goto(`${BASE_URL}/provider/home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load');

    await page.getByRole('button', { name: 'Conectarme ahora' }).click();
    await expect(page.getByText('Conectado')).toBeVisible();
    await page.getByRole('button', { name: 'Pausar disponibilidad' }).click();
    await expect(page.getByText('Desconectado', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Conectarme ahora' }).click();
    await expect(page.getByText('Conectado')).toBeVisible();

    await context.close();
  });
});
