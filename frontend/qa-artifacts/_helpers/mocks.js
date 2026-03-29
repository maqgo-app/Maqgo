export function json(status, body, headers = {}) {
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
    body: JSON.stringify(body),
  };
}

export async function installApiMocks(context) {
  await context.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // --- Auth/login ---
    if (url.includes('/api/auth/login') && method === 'POST') {
      return route.fulfill(
        json(200, {
          id: 'user-1',
          role: 'client',
          roles: ['client'],
          token: 'test-token',
        })
      );
    }

    // --- Password reset ---
    if (url.includes('/api/auth/password-reset/request') && method === 'POST') {
      return route.fulfill(json(200, { otp_sent: true }));
    }
    if (url.includes('/api/auth/password-reset/confirm') && method === 'POST') {
      return route.fulfill(json(200, { success: true, message: 'ok' }));
    }

    // --- Communications OTP (client register + verify-sms screen) ---
    if (url.includes('/api/communications/sms/send-otp') && method === 'POST') {
      return route.fulfill(json(200, { success: true }));
    }
    if (url.includes('/api/communications/sms/verify-otp') && method === 'POST') {
      return route.fulfill(json(200, { valid: true, token: 'test-token', userId: 'user-1' }));
    }

    // --- Users: role selection creates user ---
    if (url.endsWith('/api/users') && method === 'POST') {
      return route.fulfill(json(200, { id: `user-${Date.now()}`, token: 'test-token' }));
    }
    if (url.includes('/api/users/') && method === 'GET') {
      return route.fulfill(json(200, { id: 'user-1', role: 'provider', available: true, name: 'Test User' }));
    }
    if (url.includes('/api/users/') && (method === 'PATCH' || method === 'PUT')) {
      return route.fulfill(json(200, { success: true }));
    }

    // --- service-requests ---
    if (url.includes('/api/service-requests/pending')) {
      return route.fulfill(json(200, []));
    }
    if (url.includes('/api/service-requests/') && method === 'GET') {
      return route.fulfill(
        json(200, {
          id: 'svc-123',
          status: 'in_progress',
          machineryType: 'retroexcavadora',
          providerOperatorName: 'Juan Pérez',
          operatorRut: '12.345.678-9',
          location: { address: 'Av. Providencia 1234, Santiago' },
        })
      );
    }

    // --- messages ---
    if (url.includes('/api/messages/service/') && url.includes('/delta')) {
      return route.fulfill(json(200, []));
    }
    if (url.includes('/api/messages/service/')) {
      return route.fulfill(
        json(200, [
          {
            id: 'm1',
            service_id: 'svc-123',
            sender_type: 'operator',
            sender_id: 'op-1',
            content: 'Voy en camino',
            created_at: new Date(Date.now() - 60_000).toISOString(),
            read: false,
          },
        ])
      );
    }
    if (url.includes('/api/messages/read/')) {
      return route.fulfill(json(200, { success: true }));
    }
    if (url.includes('/api/messages/send')) {
      return route.fulfill(json(200, { success: true, message_id: 'm-new', created_at: new Date().toISOString() }));
    }

    // --- Admin ---
    if (url.includes('/api/services/admin/all') && method === 'GET') {
      return route.fulfill(
        json(200, {
          services: [],
          stats: { total: 0, pending_review: 0, invoiced: 0, paid: 0, disputed: 0 },
          total: 0,
          finances: {
            totalGross: 0,
            totalNet: 0,
            clientCommission: 0,
            providerCommission: 0,
            totalCommission: 0,
            completed: 0,
            cancelled: 0,
            disputed: 0,
          },
        })
      );
    }
    if (url.includes('/api/admin/users') && method === 'GET') {
      return route.fulfill(json(200, []));
    }
    if (url.includes('/api/admin/reference-prices') && method === 'GET') {
      return route.fulfill(json(200, []));
    }
    if (url.includes('/api/admin/marketing/') && method === 'GET') {
      return route.fulfill(json(200, { ok: true }));
    }
    if (url.includes('/api/admin/reports/') && method === 'GET') {
      return route.fulfill(json(200, { ok: true }));
    }

    // Default: no romper pantallas por endpoints accesorios.
    return route.fulfill(json(200, { ok: true }));
  });
}

export function seedClientRegisterData() {
  localStorage.setItem(
    'registerData',
    JSON.stringify({
      nombre: 'Juan',
      apellido: 'Pérez',
      email: 'juan@test.cl',
      celular: '912345678',
      rut: '12345678-9',
      password: 'Password123!',
    })
  );
  localStorage.setItem('verificationChannel', 'sms');
}

export function seedPhoneVerifiedSession() {
  localStorage.setItem('phoneVerified', 'true');
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('userId', 'user-1');
}

export function seedClientServiceFlow() {
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('userId', 'client-1');
  localStorage.setItem('userRole', 'client');
  localStorage.setItem('currentServiceId', 'svc-123');
  localStorage.setItem('selectedMachinery', 'retroexcavadora');
  localStorage.setItem('selectedHours', '4');
  localStorage.setItem('serviceLat', '-33.4489');
  localStorage.setItem('serviceLng', '-70.6693');
  localStorage.setItem('serviceLocation', 'Av. Providencia 1234, Santiago');
  localStorage.setItem(
    'acceptedProvider',
    JSON.stringify({
      operator_name: 'Juan Pérez',
      operator_rut: '12.345.678-9',
      rating: 4.8,
      licensePlate: 'ABCD12',
    })
  );
}

export function seedProviderSession() {
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('userId', 'provider-1');
  localStorage.setItem('userRole', 'provider');
  localStorage.setItem('providerOnboardingCompleted', 'true');
  localStorage.setItem(
    'providerData',
    JSON.stringify({
      businessName: 'Juan Pérez',
      rut: '12.345.678-9',
    })
  );
  localStorage.setItem(
    'bankData',
    JSON.stringify({
      bank: 'Banco Estado',
      accountType: 'vista',
      accountNumber: '12345678',
      holderName: 'Juan Pérez',
      holderRut: '12.345.678-9',
    })
  );
}

export function seedOperatorSession() {
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('userId', 'operator-1');
  localStorage.setItem('userRole', 'operator');
  localStorage.setItem('providerAvailable', 'true');
  localStorage.setItem('ownerId', 'provider-1');
  localStorage.setItem(
    'providerData',
    JSON.stringify({
      businessName: 'Transportes Silva SpA',
    })
  );
}

export function seedAdminSession() {
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('userId', 'admin-1');
  localStorage.setItem('userRole', 'admin');
  localStorage.setItem('userRoles', JSON.stringify(['admin']));
}

