/**
 * E2E embudo checkout / guard.
 *
 * Nota: `main.jsx` usa `<ErrorBoundary key={location.pathname}>` → cada cambio de ruta
 * remonta `<App />` y reinicia CheckoutContext (IDLE). Un clic P5→card que haga `navigate`
 * puede quedar anulado por el guard si el snapshot LS no indica paso `payment`.
 * Por eso no forzamos aquí el clic "Enviar solicitud"→card; se cubre card con snapshot
 * de recovery y P5 como URL estable.
 */
import { test, expect } from '@playwright/test';
import { resolvePlaywrightBaseUrl } from '../scripts/e2ePreviewConstants.mjs';
import { installApiMocks } from './_helpers/mocks.js';
import {
  seedCheckoutEmbudoSession,
  seedEmbudoWithPaymentSnapshot,
  seedEmbudoWithBillingSnapshot,
  seedEmbudoForPaymentResultSuccess,
} from './_helpers/checkout-e2e-seed.js';

const BASE_URL = resolvePlaywrightBaseUrl();

/**
 * Registra cambios de pathname en el frame principal (navegación SPA).
 */
function attachMainFramePathTracker(page) {
  const paths = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      const raw = frame.url();
      if (!raw || raw === 'about:blank') return;
      try {
        paths.push(new URL(raw).pathname);
      } catch {
        /* ignore */
      }
    }
  });
  return paths;
}

/** Tras estabilizar URL: no rebotes entre rutas del embudo */
async function assertUrlStable(page, ms = 600) {
  const u = page.url();
  await page.waitForTimeout(ms);
  expect(page.url()).toBe(u);
}

/** Sin oscilación; como máximo `max` transiciones de pathname hasta `finalPath` */
function assertMaxPathChanges(paths, max, finalPath) {
  expect(paths[paths.length - 1]).toBe(finalPath);
  let changes = 0;
  for (let i = 1; i < paths.length; i += 1) {
    if (paths[i] !== paths[i - 1]) changes += 1;
  }
  expect(changes, `path churn: ${JSON.stringify(paths)}`).toBeLessThanOrEqual(max);
}

async function expectPath(page, pathRe) {
  await expect(page).toHaveURL(pathRe, { timeout: 20_000 });
}

test.describe('Checkout navigation (guard + recovery)', () => {
  test('deep link /client/card sin snapshot → una corrección a /client/confirm', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await installApiMocks(context);
    await context.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('userId', 'u1');
      localStorage.setItem('userRole', 'client');
    });
    const page = await context.newPage();
    const paths = attachMainFramePathTracker(page);

    await page.goto(`${BASE_URL}/client/card`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForURL(/\/client\/confirm\/?$/, { timeout: 15_000 });
    await assertUrlStable(page);
    assertMaxPathChanges(paths, 1, '/client/confirm');

    await expect(page.getByText('No hay proveedor seleccionado')).toBeVisible({ timeout: 10_000 });

    await context.close();
  });

  test('refresh en /client/card con snapshot payment → sigue en /client/card', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await installApiMocks(context);
    await context.addInitScript(seedEmbudoWithPaymentSnapshot);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/client/card`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForURL(/\/client\/card\/?$/, { timeout: 15_000 });
    await assertUrlStable(page);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/client\/card\/?$/, { timeout: 15_000 });
    await assertUrlStable(page);
    await expect(page.getByText('Registra tu tarjeta')).toBeVisible();

    await context.close();
  });

  test('refresh en /client/billing con needsInvoice + snapshot → sigue en /client/billing', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await installApiMocks(context);
    await context.addInitScript(seedEmbudoWithBillingSnapshot);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/client/billing`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForURL(/\/client\/billing\/?$/, { timeout: 15_000 });
    await assertUrlStable(page);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/client\/billing\/?$/, { timeout: 15_000 });
    await assertUrlStable(page);

    await context.close();
  });

  test('deep link /client/billing sin factura → corrección a /client/confirm', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await installApiMocks(context);
    await context.addInitScript(seedCheckoutEmbudoSession);
    const page = await context.newPage();
    const paths = attachMainFramePathTracker(page);

    await page.goto(`${BASE_URL}/client/billing`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForURL(/\/client\/confirm\/?$/, { timeout: 15_000 });
    await assertUrlStable(page);
    assertMaxPathChanges(paths, 1, '/client/confirm');

    await context.close();
  });

  test('deep link /oneclick/complete sin señal → termina en /client/confirm (guard tras paso intermedio)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await installApiMocks(context);
    await context.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('userId', 'u1');
      localStorage.setItem('userRole', 'client');
    });
    const page = await context.newPage();
    const paths = attachMainFramePathTracker(page);

    await page.goto(`${BASE_URL}/oneclick/complete`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForURL(/\/client\/confirm\/?$/, { timeout: 15_000 });
    await assertUrlStable(page);
    assertMaxPathChanges(paths, 2, '/client/confirm');

    await context.close();
  });

  test('snapshot payment: /client/card muestra P6 sin redirección (embudo estable)', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await installApiMocks(context);
    await context.addInitScript(seedEmbudoWithPaymentSnapshot);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/client/card`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await expectPath(page, /\/client\/card\/?$/);
    await expect(page.getByText('Registra tu tarjeta')).toBeVisible();
    await assertUrlStable(page);

    await context.close();
  });

  test('/client/payment-result → éxito sin rebote de URL (procesamiento)', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await installApiMocks(context);
    await context.addInitScript(seedEmbudoForPaymentResultSuccess);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/client/payment-result`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await expect(page.getByRole('heading', { name: /¡Reserva confirmada!/i })).toBeVisible({ timeout: 22_000 });
    await assertUrlStable(page);

    await context.close();
  });

  test('P5 confirma URL estable (sin redirect del guard en /client/confirm)', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await installApiMocks(context);
    await context.addInitScript(seedCheckoutEmbudoSession);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/client/confirm`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await expectPath(page, /\/client\/confirm\/?$/);
    await expect(page.getByRole('heading', { name: /Confirmación/i })).toBeVisible({ timeout: 15_000 });
    await assertUrlStable(page);

    await context.close();
  });
});
