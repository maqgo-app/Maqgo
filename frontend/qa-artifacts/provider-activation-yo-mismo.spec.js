import { test, expect } from '@playwright/test';
import { resolvePlaywrightBaseUrl } from '../scripts/e2ePreviewConstants.mjs';
import { installApiMocks } from './_helpers/mocks.js';

const BASE_URL = resolvePlaywrightBaseUrl();

function seedNewProviderOnboarding(userId = 'provider-qa-1') {
  localStorage.clear();
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('authToken', 'test-token');
  localStorage.setItem('userId', userId);
  localStorage.setItem('userRole', 'provider');
  localStorage.setItem('providerRole', 'super_master');
  localStorage.setItem('hasPassword', '1');
  localStorage.setItem('legalAcceptedAt', new Date().toISOString());
  localStorage.removeItem('providerOnboardingCompleted');
  localStorage.removeItem('providerOnboardingStep');
  localStorage.setItem(
    'providerData',
    JSON.stringify({
      businessName: 'Juan Pérez',
      rut: '12.345.678-5',
      email: 'proveedor@test.cl',
      phone: '912345678',
    })
  );
  localStorage.setItem(
    'bankData',
    JSON.stringify({
      bank: 'Banco Estado',
      accountType: 'vista',
      accountNumber: '12345678',
      holderName: 'Juan Pérez',
      holderRut: '12.345.678-5',
    })
  );
  localStorage.setItem(
    'machineData',
    JSON.stringify({
      machineryType: 'excavadora',
      brand: 'Komatsu',
      model: 'PC200',
      year: '2020',
      licensePlate: 'ABCD12',
    })
  );
  localStorage.removeItem('machinePricing');
  localStorage.removeItem('machinePhotos');
  localStorage.removeItem('operatorsData');
}

test.describe('QA: onboarding proveedor “Yo mismo” (activación)', () => {
  test('1) Onboarding nuevo sin refresh: Empresa/Maquinaria/Operador quedan ✅', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await installApiMocks(context);
    await context.addInitScript(seedNewProviderOnboarding);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/provider/machine-photos-pricing`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load');

    await page.getByTestId('price-input').fill('110000');
    const transportSameComuna = page.getByTestId('transport-input-same-comuna');
    if (await transportSameComuna.count()) {
      await transportSameComuna.fill('30000');
    }
    const frontalPickerGroup = page.getByRole('button', { name: /^Subir frontal$/i }).locator('..');
    await frontalPickerGroup.locator('input[type="file"]').setInputFiles({
      name: 'frontal.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Xo1cAAAAASUVORK5CYII=',
        'base64'
      ),
    });
    await page.getByTestId('machine-photos-pricing-continue').click();

    await expect(page).toHaveURL(/\/provider\/operator-data/);
    await page.getByTestId('option-same-as-owner').click();
    await page.getByTestId('continue-button').click();

    await expect(page).toHaveURL(/\/provider\/review/);
    await page.getByRole('button', { name: 'Confirmar y Continuar' }).click();

    await expect(page).toHaveURL(/\/provider\/home/);
    await expect(page.getByText('Falta tipo o patente de la máquina')).toHaveCount(0);
    await expect(page.getByText('Falta operador de maquinaria asignado')).toHaveCount(0);

    await expect(page.getByText('Estado de activación')).toBeVisible();
    await expect(
      page.getByText('Maquinaria', { exact: true }).locator('..').locator('..').getByText('Listo', { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText('Operador asignado', { exact: true }).locator('..').locator('..').getByText('Listo', { exact: true })
    ).toBeVisible();

    await context.close();
  });

  test('1b) Email ya existe: finaliza onboarding sin bloquear', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await installApiMocks(context, { usersPatchEmailConflictOnce: true });
    await context.addInitScript(seedNewProviderOnboarding);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/provider/review`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load');
    await page.getByRole('button', { name: 'Confirmar y Continuar' }).click();

    await expect(page).toHaveURL(/\/provider\/home/);
    await context.close();
  });

  test('1c) Falla al registrar maquinaria: no bloquea y muestra alerta en home', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await installApiMocks(context, { machinesPostFail: true });
    await context.addInitScript(seedNewProviderOnboarding);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/provider/review`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load');
    await page.getByRole('button', { name: 'Confirmar y Continuar' }).click();

    await expect(page).toHaveURL(/\/provider\/home/);
    await expect(page.getByText('Tu perfil quedó guardado, pero falta registrar la máquina')).toBeVisible();
    await context.close();
  });

  test('2) Persistencia real: providerMachines:<userId> existe; machineData puede borrarse; dashboard usa getMachines()', async ({ browser }) => {
    const userId = 'provider-qa-2';
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await installApiMocks(context);
    await context.addInitScript(seedNewProviderOnboarding, userId);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/provider/operator-data`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load');
    await page.getByTestId('option-same-as-owner').click();
    await page.getByTestId('continue-button').click();
    await expect(page).toHaveURL(/\/provider\/review/);
    await page.getByRole('button', { name: 'Confirmar y Continuar' }).click();
    await expect(page).toHaveURL(/\/provider\/home/);

    const state = await page.evaluate(() => {
      const userId = localStorage.getItem('userId');
      const key = `providerMachines:${userId}`;
      const raw = localStorage.getItem(key);
      return {
        userId,
        key,
        hasKey: Boolean(raw),
        rawLength: raw ? raw.length : 0,
        machineDataExists: Boolean(localStorage.getItem('machineData')),
        operatorsData: localStorage.getItem('operatorsData'),
        legacyProviderMachines: localStorage.getItem('providerMachines'),
      };
    });

    expect(state.userId).toBe(userId);
    expect(state.hasKey).toBeTruthy();
    expect(state.rawLength).toBeGreaterThan(10);
    expect(state.machineDataExists).toBeFalsy();
    expect(typeof state.operatorsData).toBe('string');
    expect(state.legacyProviderMachines).toBeNull();

    const machinesFromStorage = await page.evaluate(() => {
      const userId = localStorage.getItem('userId');
      const key = `providerMachines:${userId}`;
      const raw = localStorage.getItem(key);
      let list = [];
      try {
        list = raw ? JSON.parse(raw) : [];
      } catch {
        list = [];
      }
      return Array.isArray(list)
        ? list.map((m) => ({ machineryType: m?.machineryType, licensePlate: m?.licensePlate, operatorsCount: (m?.operators || []).length }))
        : [];
    });
    expect(machinesFromStorage.length).toBeGreaterThan(0);
    expect(machinesFromStorage[0].machineryType).toBeTruthy();
    expect(String(machinesFromStorage[0].licensePlate || '').trim()).toBeTruthy();

    await expect(page.getByText('Falta tipo o patente de la máquina')).toHaveCount(0);
    await expect(page.getByText('Falta operador de maquinaria asignado')).toHaveCount(0);

    await context.close();
  });

  test('3) Compat legacy: providerMachines (sin namespace) migra automáticamente y no desaparecen máquinas', async ({ browser }) => {
    const userId = 'provider-legacy-1';
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await installApiMocks(context);
    await context.addInitScript((uid) => {
      localStorage.clear();
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('authToken', 'test-token');
      localStorage.setItem('userId', uid);
      localStorage.setItem('userRole', 'provider');
      localStorage.setItem('providerRole', 'super_master');
      localStorage.setItem('hasPassword', '1');
      localStorage.setItem('legalAcceptedAt', new Date().toISOString());
      localStorage.setItem('providerOnboardingCompleted', 'true');
      localStorage.setItem('providerData', JSON.stringify({ businessName: 'Juan Pérez', rut: '12.345.678-5' }));
      localStorage.setItem('operatorsData', JSON.stringify([{ name: 'Juan Pérez' }]));
      localStorage.setItem('bankData', JSON.stringify({ bank: 'Banco Estado', accountType: 'vista', accountNumber: '1', holderName: 'Juan', holderRut: '12.345.678-5' }));
      localStorage.removeItem(`providerMachines:${uid}`);
      localStorage.setItem(
        'providerMachines',
        JSON.stringify([
          { id: 'mach_legacy_1', machineryType: 'excavadora', licensePlate: 'ZZZZ99', operators: [{ id: 'op-1', name: 'Juan Pérez' }] },
        ])
      );
      localStorage.removeItem('machineData');
    }, userId);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/provider/home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load');

    await expect(page.getByText('Falta tipo o patente de la máquina')).toHaveCount(0);
    await expect(page.getByText('Falta operador de maquinaria asignado')).toHaveCount(0);

    const migrated = await page.evaluate(() => {
      const userId = localStorage.getItem('userId');
      const namespacedKey = `providerMachines:${userId}`;
      return {
        namespacedKey,
        namespacedRaw: localStorage.getItem(namespacedKey),
        legacyRaw: localStorage.getItem('providerMachines'),
      };
    });
    expect(migrated.namespacedRaw).toBeTruthy();
    expect(migrated.legacyRaw).toBeNull();

    await context.close();
  });

  test('4) Refresh / logout-login: activación persiste, no reaparecen ❌, no hay loops', async ({ browser }) => {
    const userId = 'provider-qa-refresh-1';
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await installApiMocks(context);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.evaluate((uid) => {
      localStorage.clear();
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('authToken', 'test-token');
      localStorage.setItem('userId', uid);
      localStorage.setItem('userRole', 'provider');
      localStorage.setItem('providerRole', 'super_master');
      localStorage.setItem('hasPassword', '1');
      localStorage.setItem('legalAcceptedAt', new Date().toISOString());
      localStorage.setItem('providerOnboardingCompleted', 'true');
      localStorage.setItem('providerData', JSON.stringify({ businessName: 'Juan Pérez', rut: '12.345.678-5' }));
      localStorage.setItem('operatorsData', JSON.stringify([{ name: 'Juan Pérez' }]));
      localStorage.setItem('bankData', JSON.stringify({ bank: 'Banco Estado', accountType: 'vista', accountNumber: '1', holderName: 'Juan', holderRut: '12.345.678-5' }));
      localStorage.setItem(
        `providerMachines:${uid}`,
        JSON.stringify([
          { id: 'mach_1', machineryType: 'excavadora', licensePlate: 'ABCD12', operators: [{ id: 'op-1', name: 'Juan Pérez' }] },
        ])
      );
    }, userId);

    await page.goto(`${BASE_URL}/provider/home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await expect(page.getByText('Falta tipo o patente de la máquina')).toHaveCount(0);
    await expect(page.getByText('Falta operador de maquinaria asignado')).toHaveCount(0);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/provider\/home/);
    await expect(page.getByText('Falta tipo o patente de la máquina')).toHaveCount(0);
    await expect(page.getByText('Falta operador de maquinaria asignado')).toHaveCount(0);

    await page.evaluate(() => {
      localStorage.removeItem('token');
      localStorage.removeItem('authToken');
      localStorage.removeItem('userId');
      localStorage.removeItem('userRole');
    });
    await page.goto(`${BASE_URL}/provider/home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await expect(page).toHaveURL(/\/login/);

    await page.evaluate(() => {
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('authToken', 'test-token');
      localStorage.setItem('userId', 'provider-qa-refresh-1');
      localStorage.setItem('userRole', 'provider');
    });
    await page.goto(`${BASE_URL}/provider/home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await expect(page).toHaveURL(/\/provider\/home/);
    await expect(page.getByText('Falta tipo o patente de la máquina')).toHaveCount(0);
    await expect(page.getByText('Falta operador de maquinaria asignado')).toHaveCount(0);

    await context.close();
  });

  test('5) Múltiples máquinas (post-onboarding): getMachines consistente; no se escribe providerMachines legacy', async ({ browser }) => {
    const userId = 'provider-qa-multi-1';
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await installApiMocks(context);
    await context.route('**/api/machines**', async (route) => {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          machines: [
            { id: 'mach_1', provider_id: userId, machineryType: 'excavadora', licensePlate: 'ABCD12', operators: [{ id: 'op-1', name: 'Juan Pérez' }], available: true, published: true },
            { id: 'mach_2', provider_id: userId, machineryType: 'retroexcavadora', licensePlate: 'WXYZ34', operators: [{ id: 'op-2', name: 'Juan Pérez' }], available: true, published: true },
          ],
        }),
      });
    });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.evaluate((uid) => {
      localStorage.clear();
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('authToken', 'test-token');
      localStorage.setItem('userId', uid);
      localStorage.setItem('userRole', 'provider');
      localStorage.setItem('providerRole', 'super_master');
      localStorage.setItem('hasPassword', '1');
      localStorage.setItem('legalAcceptedAt', new Date().toISOString());
      localStorage.setItem('providerOnboardingCompleted', 'true');
      localStorage.setItem('providerData', JSON.stringify({ businessName: 'Juan Pérez', rut: '12.345.678-5' }));
      localStorage.setItem('operatorsData', JSON.stringify([{ name: 'Juan Pérez' }]));
      localStorage.setItem('bankData', JSON.stringify({ bank: 'Banco Estado', accountType: 'vista', accountNumber: '1', holderName: 'Juan', holderRut: '12.345.678-5' }));
      localStorage.setItem(
        `providerMachines:${uid}`,
        JSON.stringify([
          { id: 'mach_1', machineryType: 'excavadora', licensePlate: 'ABCD12', operators: [{ id: 'op-1', name: 'Juan Pérez' }] },
          { id: 'mach_2', machineryType: 'retroexcavadora', licensePlate: 'WXYZ34', operators: [{ id: 'op-2', name: 'Juan Pérez' }] },
        ])
      );
    }, userId);

    await page.goto(`${BASE_URL}/provider/machines`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load');

    const diag = await page.evaluate(() => {
      const userId = localStorage.getItem('userId');
      const ownerId = localStorage.getItem('ownerId');
      const key = `providerMachines:${ownerId || userId || ''}`;
      const raw = localStorage.getItem(key);
      let parsed = [];
      try {
        parsed = raw ? JSON.parse(raw) : [];
      } catch {
        parsed = [];
      }
      return { userId, ownerId, key, hasKey: Boolean(raw), count: Array.isArray(parsed) ? parsed.length : -1 };
    });
    expect(diag.userId).toBe(userId);
    expect(diag.ownerId).toBeNull();
    expect(diag.hasKey).toBeTruthy();
    expect(diag.count).toBe(2);

    await expect(page.getByRole('heading', { name: 'Mis Máquinas' })).toBeVisible();

    await page.getByRole('button', { name: 'Inicio' }).first().click({ force: true });
    await expect(page).toHaveURL(/\/provider\/home/);

    await expect(page.getByText('Falta tipo o patente de la máquina')).toHaveCount(0);
    await expect(page.getByText('Falta operador de maquinaria asignado')).toHaveCount(0);

    const legacy = await page.evaluate(() => localStorage.getItem('providerMachines'));
    expect(legacy).toBeNull();

    await context.close();
  });
});
