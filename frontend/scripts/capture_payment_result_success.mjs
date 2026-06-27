import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

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
        body: JSON.stringify({
          service_request: { paymentStatus: 'charged' },
          payment_intent: { state: 'PROVIDER_ACCEPTED' },
          aggregate: { service_request: { paymentStatus: 'charged' }, payment_intent: { state: 'PROVIDER_ACCEPTED' } },
        }),
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
    localStorage.setItem('serviceLocation', 'Av. Providencia 1234');
    localStorage.setItem('maqgo_booking_id', 'booking-123');
    localStorage.setItem('orderNumber', 'MQ-12345678');

    localStorage.setItem(
      'selectedProvider',
      JSON.stringify({
        id: 'prov-1',
        eta_minutes: 25,
        distance: 4.2,
        rating: 4.8,
        transport_fee: 0,
        price_per_hour: 45000,
        machineData: { primaryPhoto: null, bucketM3: 0.4 },
      })
    );
    localStorage.setItem(
      'acceptedProvider',
      JSON.stringify({
        providerOperatorName: 'Juan Pérez',
        operatorRut: '12.345.678-9',
        licensePlate: 'ABCD12',
        rating: 4.8,
        eta_minutes: 25,
        machineData: { primaryPhoto: null, bucketM3: 0.4 },
      })
    );
  });
}

async function main() {
  const baseUrl = process.argv[2];
  const outPath = process.argv[3];
  const routePath = process.argv[4] || '/client/payment-result';
  if (!baseUrl || !outPath) {
    console.error('Usage: node capture_payment_result_success.mjs <baseUrl> <outPath> [routePath]');
    process.exit(1);
  }
  ensureDir(path.dirname(outPath));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  await routeApi(context);
  const page = await context.newPage();
  await seed(page);

  await page.goto(`${baseUrl}${routePath}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('text=/Reserva confirmada/i', { timeout: 25_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: outPath, fullPage: true });

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
