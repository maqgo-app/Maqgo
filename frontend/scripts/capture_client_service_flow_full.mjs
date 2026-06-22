import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.argv[2];
const outDir = process.argv[3] || '../archive/qa-screenshots/qa-screenshots-history/service-flow-premium-full';

if (!baseUrl) {
  console.error('Usage: node capture_client_service_flow_full.mjs <baseUrl> [outDir]');
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
          providerOperatorName: 'Juan Pérez',
          operatorRut: '12.345.678-9',
          licensePlate: 'ABCD12',
          totalAmount: 201420,
        }),
      });
    }

    if (url.includes('/api/notifications/unread-count') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ unread: 2 }) });
    }

    if (url.includes('/api/notifications') && method === 'GET') {
      const items = [
        {
          id: 'client:client-1:sr:svc-123:arrival',
          title: 'Operador llegó',
          body: 'El operador marcó llegada. Autoriza el ingreso para iniciar.',
          severity: 'critical',
          createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          readAt: null,
          ackRequired: true,
          pinned: true,
          deepLink: '/client/provider-arrived',
        },
        {
          id: 'client:client-1:sr:svc-123:confirmed',
          title: 'Reserva confirmada',
          body: 'Tu reserva quedó confirmada. Revisa el estado del servicio.',
          severity: 'important',
          createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          readAt: null,
          ackRequired: false,
          pinned: false,
          deepLink: '/client/assigned',
        },
      ];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items, nextCursor: null }) });
    }

    if (url.includes('/api/notifications/') && method === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
}

async function seed(page, overrides = {}) {
  await page.addInitScript((ovr) => {
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
    localStorage.setItem('serviceComuna', 'Santiago');
    localStorage.setItem('serviceLat', '-33.4372');
    localStorage.setItem('serviceLng', '-70.6506');

    localStorage.setItem('maqgo_booking_id', 'booking-123');
    localStorage.setItem('orderNumber', 'MQ-12345678');

    localStorage.setItem('serviceStatus', 'assigned');
    localStorage.setItem('currentServiceId', 'demo-123');

    localStorage.setItem('serviceStartTime', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());
    localStorage.setItem('serviceEndTime', new Date(Date.now() - 10 * 60 * 1000).toISOString());

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

    try {
      for (const [k, v] of Object.entries(ovr || {})) {
        localStorage.setItem(String(k), String(v));
      }
    } catch {
      void 0;
    }
  }, overrides);
}

async function captureOne({ name, routePath, overrides }) {
  const mobileFile = path.join(outDir, `${name}_mobile.png`);
  const desktopFile = path.join(outDir, `${name}_desktop.png`);

  const browser = await chromium.launch({ headless: true });
  const mobileContext = await browser.newContext({ ...devices['iPhone 13'] });
  await routeApi(mobileContext);
  const mobilePage = await mobileContext.newPage();
  await seed(mobilePage, overrides);
  await mobilePage.goto(`${baseUrl}${routePath}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await mobilePage.waitForTimeout(900);
  await mobilePage.screenshot({ path: mobileFile, fullPage: true });

  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await routeApi(desktopContext);
  const desktopPage = await desktopContext.newPage();
  await seed(desktopPage, overrides);
  await desktopPage.goto(`${baseUrl}${routePath}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await desktopPage.waitForTimeout(900);
  await desktopPage.screenshot({ path: desktopFile, fullPage: true });

  await browser.close();
}

const flow = [
  { name: 'reserva-confirmada', routePath: '/client/payment-result?simulate=connection_error' },
  { name: 'operador-asignado', routePath: '/client/assigned', overrides: { serviceStatus: 'assigned' } },
  { name: 'en-camino', routePath: '/client/assigned', overrides: { serviceStatus: 'en_route' } },
  { name: 'operador-llego', routePath: '/client/provider-arrived' },
  { name: 'servicio-en-curso', routePath: '/client/service-active' },
  { name: 'servicio-finalizado', routePath: '/client/service-finished' },
  { name: 'valoracion', routePath: '/client/rate' },
  { name: 'avisos', routePath: '/client/avisos' },
];

for (const step of flow) {
  await captureOne(step);
}

console.log('ok');
