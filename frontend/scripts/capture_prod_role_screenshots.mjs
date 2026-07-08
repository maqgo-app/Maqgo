import { chromium, devices } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const API = 'https://api2.maqgo.cl/api';
const WWW = 'https://www.maqgo.cl';

const OUT_BASE = path.resolve('qa-artifacts/real-prod/final');

const ROLE_SPECS = [
  {
    role: 'client',
    userCreate: { role: 'client', name: 'AUDIT Cliente' },
    storage: (token, userId) => ({
      token,
      authToken: token,
      userId,
      userRole: 'client',
      userRoles: JSON.stringify(['client']),
    }),
    pages: [
      { key: 'client-home', path: '/client/home' },
      { key: 'client-avisos', path: '/client/avisos' },
      { key: 'client-history', path: '/client/history' },
      { key: 'client-profile', path: '/profile' },
    ],
  },
  {
    role: 'provider',
    userCreate: { role: 'provider', name: 'AUDIT Proveedor', email: null, password: null },
    storage: (token, userId) => ({
      token,
      authToken: token,
      userId,
      userRole: 'provider',
      userRoles: JSON.stringify(['provider', 'client']),
      providerRole: 'super_master',
    }),
    pages: [
      { key: 'provider-home', path: '/provider/home' },
      { key: 'provider-avisos', path: '/provider/avisos' },
      { key: 'provider-history', path: '/provider/history' },
      { key: 'provider-profile', path: '/provider/profile' },
      { key: 'provider-machines', path: '/provider/machines' },
    ],
  },
  {
    role: 'operator',
    userCreate: { role: 'provider', name: 'AUDIT Operador', provider_role: 'operator', email: null, password: null },
    storage: (token, userId) => ({
      token,
      authToken: token,
      userId,
      userRole: 'provider',
      userRoles: JSON.stringify(['provider', 'client']),
      providerRole: 'operator',
    }),
    pages: [
      { key: 'operator-home', path: '/operator/home' },
      { key: 'operator-avisos', path: '/operator/avisos' },
      { key: 'operator-history', path: '/operator/history' },
    ],
  },
];

function randomEmail(prefix) {
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${prefix}_${Date.now()}_${suffix}@maqgo.cl`;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data, text };
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function seedSessionForRole(spec) {
  const base = { ...spec.userCreate };
  if (spec.role !== 'client') {
    base.email = randomEmail(`audit_${spec.role}`);
    base.password = 'Audit1234';
  }

  const created = await postJson(`${API}/users`, base);
  if (!created.ok || !created.data?.id || !created.data?.token) {
    throw new Error(`Create ${spec.role} failed: ${created.status} ${created.text}`);
  }
  return {
    role: spec.role,
    userId: String(created.data.id),
    token: String(created.data.token),
    email: base.email || null,
  };
}

async function captureForContext(page, spec, session, suffix, outDir) {
  const initPayload = spec.storage(session.token, session.userId);
  await page.addInitScript((payload) => {
    try {
      for (const [k, v] of Object.entries(payload || {})) {
        localStorage.setItem(String(k), String(v));
      }
      localStorage.removeItem('adminMode');
    } catch {
      void 0;
    }
  }, initPayload);

  const auth401 = [];
  const seen = new Set();
  page.on('response', async (resp) => {
    if (resp.status() !== 401) return;
    const url = resp.url();
    const key = `401:${url}`;
    if (seen.has(key)) return;
    seen.add(key);
    let detail = '';
    try {
      const ct = String(resp.headers()['content-type'] || '');
      if (ct.includes('application/json')) {
        const json = await resp.json().catch(() => null);
        if (json && typeof json === 'object') detail = String(json.detail || '').trim();
      }
    } catch {
      void 0;
    }
    auth401.push({ at: new Date().toISOString(), url, detail });
  });

  const results = [];
  for (const p of spec.pages) {
    const startedAt = new Date().toISOString();
    const url = `${WWW}${p.path}`;
    const key = `${p.key}__${suffix}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForTimeout(1600);
      await page.screenshot({ path: path.join(outDir, `${key}.png`), fullPage: true });
      results.push({ key, ok: true, url, finalUrl: page.url(), startedAt, endedAt: new Date().toISOString() });
    } catch (e) {
      const msg = e?.message ? String(e.message) : String(e);
      await page.screenshot({ path: path.join(outDir, `${key}__error.png`), fullPage: true }).catch(() => void 0);
      results.push({ key, ok: false, url, error: msg, finalUrl: page.url(), startedAt, endedAt: new Date().toISOString() });
    }
  }

  await fs.writeFile(path.join(outDir, `results__${suffix}.json`), JSON.stringify(results, null, 2));
  await fs.writeFile(path.join(outDir, `auth401__${suffix}.json`), JSON.stringify(auth401, null, 2));
  return { results, auth401 };
}

async function main() {
  await ensureDir(OUT_BASE);

  const browser = await chromium.launch();

  for (const spec of ROLE_SPECS) {
    const roleDir = path.join(OUT_BASE, spec.role);
    await ensureDir(roleDir);

    const session = await seedSessionForRole(spec);
    await fs.writeFile(path.join(roleDir, 'session.json'), JSON.stringify({ role: session.role, userId: session.userId, email: session.email }, null, 2));

    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'es-CL',
      timezoneId: 'America/Santiago',
    });
    const desktopPage = await desktopContext.newPage();
    await captureForContext(desktopPage, spec, session, 'desktop', roleDir);
    await desktopContext.close();

    const mobileContext = await browser.newContext({
      ...devices['iPhone 12'],
      locale: 'es-CL',
      timezoneId: 'America/Santiago',
    });
    const mobilePage = await mobileContext.newPage();
    await captureForContext(mobilePage, spec, session, 'mobile', roleDir);
    await mobileContext.close();
  }

  await browser.close();
  console.log(`Captured production role screenshots into ${OUT_BASE}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
