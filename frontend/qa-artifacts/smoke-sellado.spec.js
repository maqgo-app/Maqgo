import { test, expect } from '@playwright/test';
import { installApiMocks } from './_helpers/mocks.js';

/**
 * Sellado: rutas públicas críticas + pantalla ubicación (sin depender de Google Maps en CI).
 * Staging: PLAYWRIGHT_BASE_URL=https://tu-staging npx playwright test qa-artifacts/smoke-sellado.spec.js
 */

function seedClientMinimal() {
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('userId', 'client-1');
  localStorage.setItem('userRole', 'client');
  localStorage.setItem('selectedMachinery', 'retroexcavadora');
  localStorage.setItem('selectedHours', '4');
  localStorage.setItem('reservationType', 'immediate');
}

/** selectedAddress canónico (no llamar otras funciones: addInitScript serializa solo este cuerpo) */
function seedCanonicalSelectedAddress() {
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('userId', 'client-1');
  localStorage.setItem('userRole', 'client');
  localStorage.setItem('selectedMachinery', 'retroexcavadora');
  localStorage.setItem('selectedHours', '4');
  localStorage.setItem('reservationType', 'immediate');
  localStorage.setItem(
    'selectedAddress',
    JSON.stringify({
      address_short: 'Av. Hidrata E2E 100',
      commune: 'Las Condes',
      address_full: 'Av. Hidrata E2E 100, Las Condes, Chile',
      lat: -33.412,
      lng: -70.574
    })
  );
  localStorage.setItem('serviceLocation', 'Av. Hidrata E2E 100');
  localStorage.setItem('serviceComuna', 'Las Condes');
  localStorage.setItem('serviceComunaSource', 'places_canonical');
  localStorage.setItem('serviceLat', '-33.412');
  localStorage.setItem('serviceLng', '-70.574');
  // Misma versión que addressStorageMigration.js: evita que el test pierda el seed al montar la pantalla.
  localStorage.setItem('maqgo_address_storage_v', '2');
}

test.describe('Sellado: welcome → login + ubicación', () => {
  test('welcome: Iniciar sesión llega a login con formulario (sin ErrorBoundary)', async ({ page }) => {
    await page.context().addInitScript(() => {
      try {
        localStorage.clear();
      } catch (_) {
        /* ignore */
      }
    });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('load');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('.maqgo-app')).toHaveCount(1);

    await page.getByTestId('login-btn').click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByLabel(/correo o rut/i)).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#login-password')).toBeVisible();
  });

  test('service-location: modo sin API key muestra dirección + comuna (regresión UI)', async ({ page, context }) => {
    await installApiMocks(context);
    await context.addInitScript(seedClientMinimal);
    await page.goto('/client/service-location', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('load');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByText('Dirección', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Comuna', { exact: false }).first()).toBeVisible();
  });

  test('service-location: refresh con selectedAddress canónico — bloque comuna no renderiza', async ({
    page,
    context
  }) => {
    await installApiMocks(context);
    await context.addInitScript(seedCanonicalSelectedAddress);
    await page.goto('/client/service-location', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('load');
    await expect(page.locator('#service-comuna')).toHaveCount(0);
    await expect(page.getByTestId('address-manual-input')).toHaveValue(/Hidrata E2E/);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('load');
    await expect(page.locator('#service-comuna')).toHaveCount(0);
  });

  test('service-location: tras editar dirección (canónico) reaparece comuna obligatoria', async ({
    page,
    context
  }) => {
    await installApiMocks(context);
    await context.addInitScript(seedCanonicalSelectedAddress);
    await page.goto('/client/service-location', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('load');
    await expect(page.locator('#service-comuna')).toHaveCount(0);
    const addr = page.getByTestId('address-manual-input');
    await addr.fill('Calle distinta 999');
    await expect(page.locator('#service-comuna')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Comuna', { exact: false }).first()).toBeVisible();
  });

  test('service-location: manual completa referencia y continúa sin error (sin duplicar línea en storage)', async ({
    page,
    context
  }) => {
    await installApiMocks(context);
    await context.addInitScript(seedClientMinimal);
    await page.goto('/client/service-location', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('load');
    await page.getByTestId('address-manual-input').fill('Calle Manual E2E 55');
    await page.locator('#service-comuna').fill('Las Condes');
    await page.getByTestId('service-reference-input').fill('Referencia obligatoria con detalle suficiente.');
    await page.getByTestId('continue-to-providers-btn').click();
    await expect(page).toHaveURL(/\/client\/providers/);
    const line = await page.evaluate(() => localStorage.getItem('serviceLocation') || '');
    expect(line).toMatch(/Calle Manual E2E 55/);
    expect(line).toMatch(/Las Condes/);
    expect(line).not.toMatch(/Las Condes.*Las Condes/);
  });

  test('CSS: .pac-container por encima de barra fija (regresión z-index)', async ({ page, context }) => {
    await installApiMocks(context);
    await context.addInitScript(seedClientMinimal);
    await page.goto('/client/service-location', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await expect(page.locator('.maqgo-app')).toHaveCount(1);
    const z = await page.evaluate(() => {
      const el = document.createElement('div');
      el.className = 'pac-container';
      document.body.appendChild(el);
      const zIndex = window.getComputedStyle(el).zIndex;
      el.remove();
      return zIndex;
    });
    expect(parseInt(z, 10)).toBeGreaterThanOrEqual(10001);
  });
});
