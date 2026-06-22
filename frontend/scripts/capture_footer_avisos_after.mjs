import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:5180';
const outDir = process.env.AUDIT_OUT_DIR || '../archive/qa-screenshots/qa-screenshots-history/footer-avisos-after';

fs.mkdirSync(outDir, { recursive: true });

const nowIso = new Date().toISOString();

function buildAvisosItems() {
  const now = Date.now();
  return [
    {
      id: 'client:demo:sr:svc-123:assigned',
      eventType: 'assigned',
      severity: 'important',
      title: 'Operador asignado',
      body: 'Se asignó un operador a tu servicio.',
      createdAt: new Date(now - 6 * 60 * 1000).toISOString(),
      readAt: null,
      ackRequired: false,
      pinned: false,
      deepLink: '/client/assigned',
    },
    {
      id: 'client:demo:sr:svc-123:entry_pending',
      eventType: 'entry_pending',
      severity: 'critical',
      title: 'Esperando autorización de ingreso',
      body: 'Autoriza el ingreso para que el servicio pueda comenzar.',
      createdAt: new Date(now - 2 * 60 * 1000).toISOString(),
      readAt: null,
      ackRequired: true,
      pinned: true,
      deepLink: '/client/provider-arrived',
    },
    {
      id: 'client:demo:sr:svc-123:arrival',
      eventType: 'arrival',
      severity: 'critical',
      title: 'Operador llegó',
      body: 'El operador marcó llegada. Autoriza el ingreso para iniciar.',
      createdAt: new Date(now - 3 * 60 * 1000).toISOString(),
      readAt: null,
      ackRequired: false,
      pinned: true,
      deepLink: '/client/provider-arrived',
    },
    {
      id: 'client:demo:sr:svc-123:confirmed',
      eventType: 'confirmed',
      severity: 'important',
      title: 'Reserva confirmada',
      body: 'Tu reserva quedó confirmada. Revisa el estado del servicio.',
      createdAt: new Date(now - 25 * 60 * 1000).toISOString(),
      readAt: null,
      ackRequired: false,
      pinned: false,
      deepLink: '/client/assigned',
    },
  ];
}

async function routeApi(context) {
  let items = buildAvisosItems();

  await context.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/api/auth/me') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'demo', role: 'client', name: 'Cliente', legalAcceptedAt: nowIso }),
      });
    }

    if (url.includes('/api/notifications/unread-count') && method === 'GET') {
      const unread = items.filter((x) => !x.readAt).length;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ unread }) });
    }

    if (url.includes('/api/notifications') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items, nextCursor: null }) });
    }

    if (url.includes('/api/notifications/') && method === 'POST') {
      const parts = url.split('/api/notifications/')[1];
      const idPart = parts.split('/')[0];
      const notificationId = decodeURIComponent(idPart);

      if (url.includes('/read')) {
        items = items.map((x) => (x.id === notificationId ? { ...x, readAt: x.readAt || new Date().toISOString() } : x));
      }
      if (url.includes('/ack')) {
        items = items.map((x) => (x.id === notificationId ? { ...x, ackAt: new Date().toISOString(), pinned: false, readAt: x.readAt || new Date().toISOString() } : x));
      }

      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
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
    localStorage.setItem('userId', 'demo');
    localStorage.setItem('userRole', 'client');
    localStorage.setItem('legalAcceptedAt', new Date().toISOString());
  });
}

async function capturePair(name, routePath) {
  const browser = await chromium.launch({ headless: true });

  const mobileContext = await browser.newContext({ ...devices['iPhone 13'] });
  await routeApi(mobileContext);
  const mobilePage = await mobileContext.newPage();
  await seed(mobilePage);
  await mobilePage.goto(`${baseUrl}${routePath}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await mobilePage.waitForTimeout(1200);
  await mobilePage.screenshot({ path: path.join(outDir, `${name}_mobile.png`), fullPage: true });
  await mobileContext.close();

  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await routeApi(desktopContext);
  const desktopPage = await desktopContext.newPage();
  await seed(desktopPage);
  await desktopPage.goto(`${baseUrl}${routePath}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await desktopPage.waitForTimeout(1200);
  await desktopPage.screenshot({ path: path.join(outDir, `${name}_desktop.png`), fullPage: true });
  await desktopContext.close();

  await browser.close();
}

async function captureOpenFromFooter(deviceName, contextOptions) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(contextOptions);
  await routeApi(context);
  const page = await context.newPage();
  await seed(page);

  await page.goto(`${baseUrl}/client/home`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /Avisos/ }).click();
  await page.waitForURL('**/client/avisos', { timeout: 60_000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(outDir, `open-avisos-from-footer_${deviceName}.png`), fullPage: true });

  await context.close();
  await browser.close();
}

await capturePair('home', '/client/home');
await capturePair('avisos', '/client/avisos');
await capturePair('history', '/client/history');
await capturePair('profile', '/profile');
await captureOpenFromFooter('mobile', devices['iPhone 13']);
await captureOpenFromFooter('desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
