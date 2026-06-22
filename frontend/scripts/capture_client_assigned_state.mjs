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

    if (url.includes('/api/service-requests/') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'svc-123',
          status: 'en_route',
          machineryType: 'retroexcavadora',
          providerOperatorName: 'Juan Pérez',
          operatorRut: '12.345.678-9',
          providerName: 'Proveedor Demo',
          providerId: 'prov-1',
        }),
      });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
}

async function seed(page, serviceStatus) {
  await page.addInitScript((status) => {
    localStorage.clear();
    sessionStorage.clear();

    localStorage.setItem('token', 'test-token');
    localStorage.setItem('authToken', 'test-token');
    localStorage.setItem('userId', 'client-1');
    localStorage.setItem('userRole', 'client');
    localStorage.setItem('legalAcceptedAt', new Date().toISOString());

    localStorage.setItem('maqgo_simulation_enabled', 'true');
    localStorage.setItem('selectedMachinery', 'retroexcavadora');
    localStorage.setItem('serviceLocation', 'Av. Providencia 1234');
    localStorage.setItem('serviceComuna', 'Santiago');
    localStorage.setItem('serviceLat', '-33.4372');
    localStorage.setItem('serviceLng', '-70.6506');
    localStorage.setItem('serviceStatus', status);
    localStorage.setItem('currentServiceId', 'svc-123');

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
  }, serviceStatus);
}

async function main() {
  const baseUrl = process.argv[2];
  const outPath = process.argv[3];
  const serviceStatus = process.argv[4] || 'en_route';
  if (!baseUrl || !outPath) {
    console.error('Usage: node capture_client_assigned_state.mjs <baseUrl> <outPath> [assigned|en_route]');
    process.exit(1);
  }
  ensureDir(path.dirname(outPath));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  await routeApi(context);
  const page = await context.newPage();
  await seed(page, serviceStatus);

  await page.goto(`${baseUrl}/client/assigned`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: outPath, fullPage: true });
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

