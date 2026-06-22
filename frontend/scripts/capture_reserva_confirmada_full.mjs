import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.argv[2];
const outDir = process.argv[3] || 'archive/qa-screenshots/qa-screenshots-history/reserva-confirmada-premium-full';
const routePath = process.argv[4] || '/client/payment-result?simulate=connection_error';

if (!baseUrl) {
  console.error('Usage: node capture_reserva_confirmada_full.mjs <baseUrl> [outDir] [routePath]');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

async function routeApi(context) {
  const nowIso = new Date().toISOString();
  await context.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/api/auth/me') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'client-1', role: 'client', email: 'client@example.com', name: 'Cliente', legalAcceptedAt: nowIso }),
      });
    }

    if (url.includes('/api/bookings/') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ aggregate: { payment_intent: { state: 'succeeded' }, service_request: { paymentStatus: 'paid' } } }),
      });
    }

    if (url.includes('/api/pricing/immediate') && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          final_price: 201420,
          service_amount: 180000,
          transport_cost: 0,
          immediate_bonus: 0,
          client_commission: 18000,
          client_commission_iva: 3420,
          needsInvoice: false,
        }),
      });
    }

    if (url.includes('/api/service-requests/') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'svc-123',
          status: 'confirmed',
          machineryType: 'retroexcavadora',
          totalAmount: 201420,
        }),
      });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
}

async function seed(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('authToken', 'test-token');
    localStorage.setItem('userId', 'client-1');
    localStorage.setItem('userRole', 'client');
    localStorage.setItem('legalAcceptedAt', new Date().toISOString());
    localStorage.setItem('maqgo_simulation_enabled', 'true');
    localStorage.setItem('reservationType', 'immediate');
    localStorage.setItem('priceType', 'hour');
    localStorage.setItem('selectedHours', '4');
    localStorage.setItem('totalAmount', '201420');
    localStorage.setItem('maxTotalAmount', '201420');
    localStorage.setItem('selectedMachinery', 'retroexcavadora');
    localStorage.setItem('maqgo_booking_id', 'booking-123');
    localStorage.setItem('orderNumber', 'MQ-12345678');
    localStorage.setItem('serviceStatus', 'assigned');
    localStorage.setItem('currentServiceId', 'demo-123');
  });
}

async function capture(fileName, contextOptions) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(contextOptions);
  await routeApi(context);
  const page = await context.newPage();
  await seed(page);
  await page.goto(`${baseUrl}${routePath}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(outDir, fileName), fullPage: true });
  await browser.close();
}

await capture('reserva-confirmada_mobile.png', { ...devices['iPhone 13'] });
await capture('reserva-confirmada_desktop.png', { viewport: { width: 1440, height: 900 } });

console.log('ok');
