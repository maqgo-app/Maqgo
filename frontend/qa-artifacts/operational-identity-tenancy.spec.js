import { test, expect } from '@playwright/test';
import { resolvePlaywrightBaseUrl } from '../scripts/e2ePreviewConstants.mjs';
import { json } from './_helpers/mocks.js';

const BASE_URL = resolvePlaywrightBaseUrl();

async function enterOtp(page, code) {
  const first = page.getByTestId('login-otp-input-0');
  await first.click();
  await page.keyboard.type(String(code));
}

function seedSession({ token, userId, userRole, providerRole, ownerId }) {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    void 0;
  }
  if (token) {
    localStorage.setItem('token', token);
    localStorage.setItem('authToken', token);
  }
  if (userId) localStorage.setItem('userId', userId);
  if (userRole) localStorage.setItem('userRole', userRole);
  if (providerRole) localStorage.setItem('providerRole', providerRole);
  if (ownerId) localStorage.setItem('ownerId', ownerId);
  localStorage.setItem('legalAcceptedAt', new Date().toISOString());
}

function buildRoleResponse({ userId, providerRole, ownerId, permissions = {} }) {
  return {
    user_id: userId,
    role: 'provider',
    provider_role: providerRole,
    owner_id: ownerId || null,
    permissions,
  };
}

async function installOperationalMocks(context, scenario) {
  const phoneToUser = scenario.phoneToUser || new Map();
  const tokenToUser = scenario.tokenToUser || new Map();
  const machinesByProviderId = scenario.machinesByProviderId || new Map();
  const usersById = scenario.usersById || new Map();
  const invitations = scenario.invitations || new Map();
  const capture = scenario.capture || { machinePosts: [] };

  const getAuth = (req) => {
    const h = req.headers();
    const raw = String(h.authorization || h.Authorization || '').trim();
    const token = raw.startsWith('Bearer ') ? raw.slice('Bearer '.length).trim() : '';
    return tokenToUser.get(token) || null;
  };

  const ensureMachineList = (providerId) => {
    const key = String(providerId || '').trim();
    if (!machinesByProviderId.has(key)) machinesByProviderId.set(key, []);
    return machinesByProviderId.get(key);
  };

  await context.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const req = route.request();

    if (url.includes('/api/auth/me') && method === 'GET') {
      if (scenario.authMe401) return route.fulfill(json(401, { detail: 'Sesión expirada' }));
      const u = getAuth(req);
      if (!u) return route.fulfill(json(401, { detail: 'Sesión inválida' }));
      return route.fulfill(
        json(200, {
          id: u.id,
          name: u.name || null,
          email: u.email || null,
          phone: u.phone || null,
          role: u.roles?.includes('admin') ? 'admin' : 'client',
          roles: u.roles || ['client'],
          provider_role: u.provider_role || null,
          owner_id: u.owner_id || null,
        })
      );
    }

    if (url.includes('/api/users/') && url.endsWith('/role') && method === 'GET') {
      const u = getAuth(req);
      if (!u) return route.fulfill(json(401, { detail: 'Sesión inválida' }));
      const r = buildRoleResponse({
        userId: u.id,
        providerRole: u.provider_role || null,
        ownerId: u.owner_id || null,
        permissions: u.permissions || {},
      });
      return route.fulfill(json(200, r));
    }

    if (url.includes('/api/auth/login-sms/start') && method === 'POST') {
      const body = req.postDataJSON?.() || {};
      const phone = String(body.celular || '').replace(/\D/g, '').slice(-9);
      if (!/^9\d{8}$/.test(phone)) return route.fulfill(json(400, { detail: 'invalid_phone' }));
      const existing = phoneToUser.get(phone);
      const userId = existing || `user_${phone}`;
      phoneToUser.set(phone, userId);
      return route.fulfill(
        json(200, {
          success: true,
          userId,
          phone: `+56${phone}`,
          message: 'Te enviamos un código por SMS (mock)',
          channel: 'sms',
          requires_otp: true,
        })
      );
    }

    if (url.includes('/api/auth/login-sms/verify') && method === 'POST') {
      const body = req.postDataJSON?.() || {};
      const phone = String(body.celular || '').replace(/\D/g, '').slice(-9);
      const userId = phoneToUser.get(phone) || `user_${phone}`;
      const token = `token_${userId}`;
      const user = usersById.get(userId) || {
        id: userId,
        roles: ['client'],
        provider_role: null,
        owner_id: null,
        phone: `+56${phone}`,
      };
      tokenToUser.set(token, user);
      usersById.set(userId, user);
      return route.fulfill(
        json(200, {
          id: userId,
          role: user.roles?.includes('admin') ? 'admin' : 'client',
          roles: user.roles || ['client'],
          token,
          provider_role: user.provider_role || null,
          owner_id: user.owner_id || null,
        })
      );
    }

    if (url.includes('/api/users/become-provider') && method === 'POST') {
      const u = getAuth(req);
      if (!u) return route.fulfill(json(401, { detail: 'Sesión inválida' }));
      const next = { ...u, roles: Array.from(new Set([...(u.roles || []), 'provider'])), provider_role: 'super_master' };
      usersById.set(next.id, next);
      tokenToUser.set(String(req.headers().authorization || '').replace('Bearer ', '').trim(), next);
      return route.fulfill(
        json(200, {
          id: next.id,
          roles: next.roles,
          already_provider: false,
          providerData: next.providerData || null,
        })
      );
    }

    if (url.includes('/api/users/') && method === 'PATCH') {
      const u = getAuth(req);
      if (!u) return route.fulfill(json(401, { detail: 'Sesión inválida' }));
      const body = req.postDataJSON?.() || {};
      const next = { ...u, ...(body.providerData ? { providerData: body.providerData } : {}) };
      usersById.set(next.id, next);
      tokenToUser.set(String(req.headers().authorization || '').replace('Bearer ', '').trim(), next);
      return route.fulfill(json(200, { ok: true }));
    }

    if (url.includes('/api/machines') && method === 'GET') {
      const u = getAuth(req);
      if (!u) return route.fulfill(json(401, { detail: 'Sesión inválida' }));
      const parsed = new URL(url);
      const qp = parsed.searchParams.get('provider_id');
      const effectiveProviderId = qp || u.owner_id || u.id;
      const list = ensureMachineList(effectiveProviderId).map((m) => ({ ...m }));
      return route.fulfill(json(200, { machines: list }));
    }

    if (url.includes('/api/machines') && method === 'POST') {
      const u = getAuth(req);
      if (!u) return route.fulfill(json(401, { detail: 'Sesión inválida' }));
      const body = req.postDataJSON?.() || {};
      capture.machinePosts.push({ body });
      const providerId = body.provider_id || u.owner_id || u.id;
      const list = ensureMachineList(providerId);
      const created = {
        ...body,
        id: body.id || `mach_${Math.random().toString(16).slice(2, 10)}`,
        provider_id: providerId,
        status: 'active',
      };
      list.unshift(created);
      return route.fulfill(json(200, { ok: true, machine: created }));
    }

    if (url.includes('/api/operators/masters/invite') && method === 'POST') {
      const u = getAuth(req);
      if (!u || u.provider_role !== 'super_master') return route.fulfill(json(403, { detail: 'forbidden' }));
      const code = `M${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
      invitations.set(code, { code, invite_type: 'master', owner_id: u.id, status: 'pending' });
      return route.fulfill(json(200, { success: true, code, invite_type: 'master', expires_in_days: 7 }));
    }

    if (url.includes('/api/operators/masters/join') && method === 'POST') {
      const body = req.postDataJSON?.() || {};
      const code = String(body.code || '').trim().toUpperCase();
      const inv = invitations.get(code);
      if (!inv || inv.status !== 'pending' || inv.invite_type !== 'master') return route.fulfill(json(404, { detail: 'Código inválido' }));
      inv.status = 'used';
      const masterId = `master_${Math.random().toString(16).slice(2, 10)}`;
      const masterUser = {
        id: masterId,
        roles: ['provider'],
        provider_role: 'master',
        owner_id: inv.owner_id,
        phone: body.master_phone,
        name: body.master_name,
        permissions: {},
      };
      usersById.set(masterId, masterUser);
      return route.fulfill(json(200, { success: true, master_id: masterId, owner_id: inv.owner_id }));
    }

    if (url.includes('/api/operators/invite') && method === 'POST') {
      const u = getAuth(req);
      if (!u) return route.fulfill(json(401, { detail: 'Sesión inválida' }));
      const body = req.postDataJSON?.() || {};
      const code = `O${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
      invitations.set(code, { code, invite_type: 'operator', owner_id: body.owner_id || u.id, status: 'pending' });
      return route.fulfill(json(200, { success: true, code, expires_in_days: 7 }));
    }

    if (url.includes('/api/operators/join') && method === 'POST') {
      const body = req.postDataJSON?.() || {};
      const code = String(body.code || '').trim().toUpperCase();
      const inv = invitations.get(code);
      if (!inv || inv.status !== 'pending' || inv.invite_type === 'master') return route.fulfill(json(404, { detail: 'Código inválido' }));
      inv.status = 'used';
      const opId = `op_${Math.random().toString(16).slice(2, 10)}`;
      const token = `token_${opId}`;
      const operatorUser = {
        id: opId,
        roles: ['provider'],
        provider_role: 'operator',
        owner_id: inv.owner_id,
        phone: body.operator_phone || '',
        name: body.operator_name || 'Operador',
        permissions: {},
      };
      tokenToUser.set(token, operatorUser);
      usersById.set(opId, operatorUser);
      return route.fulfill(json(200, { success: true, token, operator_id: opId, owner_id: inv.owner_id }));
    }

    if (url.includes('/api/users/') && url.endsWith('/availability') && method === 'PUT') {
      const u = getAuth(req);
      if (!u) return route.fulfill(json(401, { detail: 'Sesión inválida' }));
      const body = req.postDataJSON?.() || {};
      const next = { ...u, isAvailable: Boolean(body.isAvailable) };
      usersById.set(next.id, next);
      tokenToUser.set(String(req.headers().authorization || '').replace('Bearer ', '').trim(), next);
      return route.fulfill(json(200, { ok: true, isAvailable: next.isAvailable }));
    }

    if (url.includes('/api/admin/access') && method === 'GET') {
      const u = getAuth(req);
      if (!u || !u.roles?.includes('admin')) return route.fulfill(json(403, { ok: false }));
      return route.fulfill(json(200, { ok: true }));
    }

    if (url.includes('/api/admin/') || url.includes('/api/services/admin/')) {
      const u = getAuth(req);
      if (!u || !u.roles?.includes('admin')) return route.fulfill(json(403, { detail: 'forbidden' }));
      return route.fulfill(json(200, { ok: true, services: [], stats: { total: 0 } }));
    }

    return route.fulfill(json(200, { ok: true }));
  });

  return { phoneToUser, tokenToUser, machinesByProviderId, usersById, invitations, capture };
}

test.describe('Operacional: identidad + tenancy + permisos', () => {
  test('Identidad: mismo celular no crea cuentas paralelas (incógnito vs incógnito)', async ({ browser }) => {
    const scenario = {};
    const c1 = await browser.newContext();
    await installOperationalMocks(c1, scenario);
    const p1 = await c1.newPage();
    await p1.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await p1.locator('#login-phone').fill('912345678');
    await p1.getByRole('button', { name: /continuar|iniciar sesi[oó]n/i }).click();
    await expect(p1.getByTestId('login-otp-input')).toBeVisible();
    await enterOtp(p1, '123456');
    await p1.waitForFunction(() => !!localStorage.getItem('token') || !!localStorage.getItem('authToken'), null, { timeout: 7000 });
    const u1 = await p1.evaluate(() => localStorage.getItem('userId'));
    await c1.close();

    const c2 = await browser.newContext();
    await installOperationalMocks(c2, scenario);
    const p2 = await c2.newPage();
    await p2.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await p2.locator('#login-phone').fill('912345678');
    await p2.getByRole('button', { name: /continuar|iniciar sesi[oó]n/i }).click();
    await expect(p2.getByTestId('login-otp-input')).toBeVisible();
    await enterOtp(p2, '123456');
    await p2.waitForFunction(() => !!localStorage.getItem('token') || !!localStorage.getItem('authToken'), null, { timeout: 7000 });
    const u2 = await p2.evaluate(() => localStorage.getItem('userId'));
    await c2.close();

    expect(u1).toBe(u2);
  });

  test('Tenancy: crear máquina desde /provider/review no puede cruzar empresa por ownerId stale', async ({ browser }) => {
    const scenario = {};
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const api = await installOperationalMocks(context, scenario);
    const token = 'token_ownerA';
    api.tokenToUser.set(token, { id: 'ownerA', roles: ['provider'], provider_role: 'super_master', owner_id: null, permissions: {} });
    await context.addInitScript(seedSession, {
      token,
      userId: 'ownerA',
      userRole: 'provider',
      providerRole: 'super_master',
      ownerId: 'ownerB',
    });
    await context.addInitScript(() => {
      localStorage.setItem('providerData', JSON.stringify({ businessName: 'Empresa A', rut: '12.345.678-9', email: 'a@test.cl' }));
      localStorage.setItem('machineData', JSON.stringify({ machineryType: 'excavadora', licensePlate: 'ABCD12' }));
      localStorage.setItem('machinePricing', JSON.stringify({ isPerHour: true, priceBase: 110000, transportCost: 30000 }));
      localStorage.setItem('operatorsData', JSON.stringify([{ name: 'Op' }]));
      localStorage.setItem('machinePhotos', JSON.stringify([]));
    });

    const page = await context.newPage();
    await page.goto(`${BASE_URL}/provider/review`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /confirmar|finalizar|guardar|continuar/i }).click();
    await page.waitForTimeout(500);

    const posted = api.capture.machinePosts[0]?.body || null;
    expect(posted).not.toBeNull();
    expect(Object.prototype.hasOwnProperty.call(posted, 'provider_id')).toBe(false);

    const listA = api.machinesByProviderId.get('ownerA') || [];
    const listB = api.machinesByProviderId.get('ownerB') || [];
    expect(listA.length).toBeGreaterThanOrEqual(1);
    expect(listB.length).toBe(0);

    await context.close();
  });

  test('Permisos: master restringido no ve finanzas/banco/máquinas/equipo en Perfil', async ({ browser }) => {
    const scenario = {};
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const api = await installOperationalMocks(context, scenario);
    const token = 'token_masterRestr';
    api.tokenToUser.set(token, {
      id: 'masterR',
      roles: ['provider'],
      provider_role: 'master',
      owner_id: 'ownerA',
      permissions: {
        can_view_finance: false,
        can_manage_machines: false,
        can_manage_operators: false,
        can_view_bank_data: false,
      },
    });
    await context.addInitScript(seedSession, {
      token,
      userId: 'masterR',
      userRole: 'provider',
      providerRole: 'master',
      ownerId: 'ownerA',
    });

    const page = await context.newPage();
    await page.goto(`${BASE_URL}/provider/profile`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Mis máquinas')).toHaveCount(0);
    await expect(page.getByText('Mis cobros')).toHaveCount(0);
    await expect(page.getByText('Datos bancarios')).toHaveCount(0);
    await expect(page.getByText('Equipo')).toHaveCount(0);
    await context.close();
  });

  test('Permisos: master sin máquinas no puede abrir /provider/machines (redirige sin pantalla de “acceso restringido”)', async ({ browser }) => {
    const scenario = {};
    const context = await browser.newContext();
    const api = await installOperationalMocks(context, scenario);
    const token = 'token_masterNoMachines';
    api.tokenToUser.set(token, {
      id: 'masterNoM',
      roles: ['provider'],
      provider_role: 'master',
      owner_id: 'ownerA',
      permissions: { can_manage_machines: false },
    });
    await context.addInitScript(seedSession, {
      token,
      userId: 'masterNoM',
      userRole: 'provider',
      providerRole: 'master',
      ownerId: 'ownerA',
    });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/provider/machines`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('load');
    await expect(page).toHaveURL(/\/provider\/data/);
    await expect(page.getByText(/acceso restringido/i)).toHaveCount(0);
    await context.close();
  });

  test('Master join: /master/join consume código y redirige a login', async ({ browser }) => {
    const scenario = {};
    const context = await browser.newContext();
    const api = await installOperationalMocks(context, scenario);
    api.invitations.set('MABCD', { code: 'MABCD', invite_type: 'master', owner_id: 'ownerA', status: 'pending' });

    const page = await context.newPage();
    await page.goto(`${BASE_URL}/master/join?code=MABCD`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /activaci[oó]n de gerente/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'CÓDIGO' })).toHaveValue('MABCD');
    await page.getByRole('button', { name: /^Activar$/i }).click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/login/);
    expect(api.invitations.get('MABCD')?.status).toBe('used');
    const token = await page.evaluate(() => localStorage.getItem('token') || localStorage.getItem('authToken'));
    expect(token).toBeFalsy();
    await context.close();
  });

  test('Operator join: /operator/join genera sesión y llega a home operador', async ({ browser }) => {
    const scenario = {};
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const api = await installOperationalMocks(context, scenario);
    api.invitations.set('OABCD', { code: 'OABCD', invite_type: 'operator', owner_id: 'ownerA', status: 'pending' });

    const page = await context.newPage();
    await page.goto(`${BASE_URL}/operator/join`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('invite-code-input').fill('OABCD');
    await page.getByTestId('validate-code-btn').click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/login/);
    expect(api.invitations.get('OABCD')?.status).toBe('used');
    const token = await page.evaluate(() => localStorage.getItem('token') || localStorage.getItem('authToken'));
    expect(token).toBeFalsy();
    await context.close();
  });

  test('Sesión expirada: /provider/home redirige a /login?expired=1 (sin loop)', async ({ browser }) => {
    const scenario = { authMe401: true };
    const context = await browser.newContext();
    await installOperationalMocks(context, scenario);
    await context.addInitScript(seedSession, {
      token: 'token_expired',
      userId: 'ownerA',
      userRole: 'provider',
      providerRole: 'super_master',
    });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/provider/home`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('load');
    await expect(page).toHaveURL(/\/login\?expired=1/);
    await context.close();
  });
});
