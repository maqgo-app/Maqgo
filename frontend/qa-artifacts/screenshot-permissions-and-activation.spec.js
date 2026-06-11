import { test, expect } from '@playwright/test';

function mockRoleRoute(page, { userId, providerRole, permissions, ownerId = 'owner-001', ownerName = 'Empresa MAQGO' }) {
  const safeUserId = String(userId || '').trim() || 'user-001';
  const role = String(providerRole || 'super_master').trim() || 'super_master';
  const perms = permissions && typeof permissions === 'object' ? permissions : {};
  return page.route('**/api/users/*/role', async (route) => {
    const url = route.request().url();
    if (!url.includes(`/api/users/${encodeURIComponent(safeUserId)}/role`)) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        provider_role: role,
        permissions: perms,
        owner_id: ownerId,
        owner_name: ownerName,
      }),
    });
  });
}

function mockMachinesRoute(page, { machines = [] }) {
  return page.route('**/api/machines**', async (route) => {
    const method = route.request().method();
    if (method !== 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ machines }),
    });
  });
}

function mockTeamRoute(page, { pendingInvitations = [], operators = [], masters = [] }) {
  return page.route('**/api/operators/team/*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        pending_invitations: pendingInvitations,
        operators,
        masters,
        operators_count: operators.length,
        masters_count: masters.length,
      }),
    });
  });
}

function mockInviteRoutes(page, { masterCode = 'M4QG01' }) {
  const normalizedCode = String(masterCode || '').trim().toUpperCase() || 'M4QG01';
  page.route('**/api/operators/masters/invite', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: normalizedCode,
      }),
    });
  });
  page.route('**/api/operators/invite', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'OP1234',
      }),
    });
  });
}

async function seedSession(page, { userId, providerRole, token = 'test-token', userRole = 'provider' }) {
  const uid = String(userId || '').trim() || 'user-001';
  const role = String(providerRole || '').trim() || 'super_master';
  await page.addInitScript(({ uid, role, token, userRole }) => {
    window.localStorage.setItem('userId', uid);
    window.localStorage.setItem('userRole', userRole);
    window.localStorage.setItem('providerRole', role);
    window.localStorage.setItem('token', token);
    window.localStorage.setItem('authToken', token);
    window.localStorage.setItem('legalAcceptedAt', new Date().toISOString());
  }, { uid, role, token, userRole });
}

function mockAuthMeRoute(
  page,
  {
    userId = 'user-001',
    providerRole = 'super_master',
    ownerId = 'owner-001',
    phone = '+56911111111',
    acceptedAt = new Date().toISOString(),
  } = {}
) {
  const uid = String(userId || '').trim() || 'user-001';
  const role = String(providerRole || '').trim() || 'super_master';
  return page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: uid,
        roles: ['provider'],
        provider_role: role,
        owner_id: ownerId,
        phone,
        legalAcceptedAt: acceptedAt,
      }),
    });
  });
}

async function seedMasterPermissions(page, { userId, permissions }) {
  const uid = String(userId || '').trim();
  const perms = permissions && typeof permissions === 'object' ? permissions : {};
  if (!uid) return;
  await page.addInitScript(({ uid, perms }) => {
    try {
      const raw = window.localStorage.getItem('masterPermissionsByUserId') || '{}';
      const map = JSON.parse(raw);
      map[String(uid)] = perms;
      window.localStorage.setItem('masterPermissionsByUserId', JSON.stringify(map));
    } catch {
      void 0;
    }
  }, { uid, perms });
}

test.describe('Capturas: activación master y permisos de borrado', () => {
  test('Invitación master (supermaster) muestra permisos de maquinaria', async ({ page, baseURL }) => {
    const userId = 'super-000';

    await seedSession(page, { userId, providerRole: 'super_master' });
    await mockAuthMeRoute(page, { userId, providerRole: 'super_master' });
    await mockRoleRoute(page, {
      userId,
      providerRole: 'super_master',
      permissions: {
        can_manage_machines: true,
        can_manage_operators: true,
        can_delete_machines: true,
      },
    });
    await mockTeamRoute(page, { pendingInvitations: [], operators: [], masters: [] });
    await mockInviteRoutes(page, { masterCode: 'MAS777' });

    await page.goto(`${baseURL}/provider/team?mode=master&tab=invite&view=create`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Crear usuario master')).toBeVisible();
    await expect(page.getByText('Permisos')).toBeVisible();

    await expect(page.getByText('Puede editar máquinas y operadores por máquina')).toBeVisible();
    await expect(page.getByText('Puede eliminar máquinas')).toBeVisible();

    await page.screenshot({
      path: 'qa-artifacts/out/invite-master-permissions.png',
      fullPage: true,
    });
  });

  test('Activación master (supermaster) muestra copy de activación', async ({ page, baseURL }) => {
    const userId = 'super-001';

    await seedSession(page, { userId, providerRole: 'super_master' });
    await mockAuthMeRoute(page, { userId, providerRole: 'super_master' });
    await mockRoleRoute(page, {
      userId,
      providerRole: 'super_master',
      permissions: {
        can_manage_machines: true,
        can_manage_operators: true,
        can_delete_machines: true,
      },
    });
    await mockTeamRoute(page, { pendingInvitations: [], operators: [], masters: [] });
    await mockInviteRoutes(page, { masterCode: 'MAS123' });

    await page.goto(`${baseURL}/provider/team?mode=master&tab=invite&view=create`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Crear usuario master')).toBeVisible();

    await page.getByPlaceholder('Ej: María').fill('Tomás');
    await page.getByPlaceholder('Ej: Soto').fill('Villalta');
    await page.getByPlaceholder('12.345.678-9').first().fill('12.345.678-5');
    await page.getByPlaceholder('+56 9 1234 5678').first().fill('+56 9 8765 4321');

    await page.getByTestId('generate-code-btn').click();

    await expect(page.getByText('Activación lista')).toBeVisible();
    await expect(page.getByText('Código de activación listo')).toBeVisible();
    await expect(page.getByText('Código de activación para usuario master')).toBeVisible();

    await page.screenshot({
      path: 'qa-artifacts/out/activation-master.png',
      fullPage: true,
    });
  });

  test('Mis Máquinas: supermaster ve eliminar máquina', async ({ page, baseURL }) => {
    const userId = 'super-002';
    await seedSession(page, { userId, providerRole: 'super_master' });
    await mockAuthMeRoute(page, { userId, providerRole: 'super_master' });
    await mockRoleRoute(page, {
      userId,
      providerRole: 'super_master',
      permissions: {
        can_manage_machines: true,
        can_delete_machines: true,
      },
    });
    await mockMachinesRoute(page, {
      machines: [
        {
          id: 'mach-1',
          machineryType: 'camion_aljibe',
          type: 'Camión Aljibe',
          brand: 'Mercedes-Benz',
          licensePlate: 'ABCD12',
          pricePerService: 260000,
          transportCost: 0,
          available: true,
          operators: [{ id: 'op-1', name: 'Operador Uno', phone: '+56911111111' }],
        },
      ],
    });

    await page.goto(`${baseURL}/provider/machines`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Mis Máquinas')).toBeVisible();
    await expect(page.getByTitle('Eliminar máquina')).toBeVisible();

    await page.screenshot({
      path: 'qa-artifacts/out/machines-delete-supermaster.png',
      fullPage: true,
    });
  });

  test('Mis Máquinas: master puede gestionar pero NO ve eliminar', async ({ page, baseURL }) => {
    const userId = 'master-001';
    await seedMasterPermissions(page, {
      userId,
      permissions: {
        can_manage_machines: true,
        can_delete_machines: false,
      },
    });
    await seedSession(page, { userId, providerRole: 'master' });
    await mockAuthMeRoute(page, { userId, providerRole: 'master' });
    await mockMachinesRoute(page, {
      machines: [
        {
          id: 'mach-1',
          machineryType: 'camion_aljibe',
          type: 'Camión Aljibe',
          brand: 'Mercedes-Benz',
          licensePlate: 'ABCD12',
          pricePerService: 260000,
          transportCost: 0,
          available: true,
          operators: [{ id: 'op-1', name: 'Operador Uno', phone: '+56911111111' }],
        },
      ],
    });

    await page.goto(`${baseURL}/provider/machines`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Mis Máquinas')).toBeVisible();
    await expect(page.getByTitle('Eliminar máquina')).toHaveCount(0);

    await page.screenshot({
      path: 'qa-artifacts/out/machines-delete-master.png',
      fullPage: true,
    });
  });

  test('Mis Máquinas: master con permiso ve eliminar máquina', async ({ page, baseURL }) => {
    const userId = 'master-002';
    await seedMasterPermissions(page, {
      userId,
      permissions: {
        can_manage_machines: true,
        can_delete_machines: true,
      },
    });
    await seedSession(page, { userId, providerRole: 'master' });
    await mockAuthMeRoute(page, { userId, providerRole: 'master' });
    await mockMachinesRoute(page, {
      machines: [
        {
          id: 'mach-1',
          machineryType: 'camion_aljibe',
          type: 'Camión Aljibe',
          brand: 'Mercedes-Benz',
          licensePlate: 'ABCD12',
          pricePerService: 260000,
          transportCost: 0,
          available: true,
          operators: [{ id: 'op-1', name: 'Operador Uno', phone: '+56911111111' }],
        },
      ],
    });

    await page.goto(`${baseURL}/provider/machines`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Mis Máquinas')).toBeVisible();
    await expect(page.getByTitle('Eliminar máquina')).toBeVisible();

    await page.screenshot({
      path: 'qa-artifacts/out/machines-delete-master-with-permission.png',
      fullPage: true,
    });
  });
});
