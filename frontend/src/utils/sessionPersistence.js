/**
 * Persistencia única de sesión MAQGO (JWT + user id).
 * Usar tras login-sms (trusted u OTP), verify-otp, establish-session proveedor, etc.
 *
 * @param {Record<string, unknown>} response - API con al menos token y user id en una de las claves soportadas
 * @returns {boolean} true si se guardó token y userId en localStorage
 */
export function establishSession(response) {
  if (!response || typeof response !== 'object') return false;
  const token = String(response.token ?? '').trim();
  const rawId = response.user_id ?? response.userId ?? response.id;
  const userId = rawId != null && rawId !== '' ? String(rawId).trim() : '';
  if (!token || !userId) return false;
  try {
    localStorage.setItem('authToken', token);
    localStorage.setItem('token', token);
    localStorage.setItem('userId', userId);
  } catch {
    return false;
  }
  return true;
}

/**
 * Tras `establishSession`, persiste rol y metadatos como en LoginScreen.
 * Sin esto, token+userId existen pero `userRole`/AuthContext quedan vacíos o viejos → 401/UX rotos al crear perfil proveedor.
 *
 * @param {Record<string, unknown>} data - Payload tipo login-sms (role, roles, phone, provider_role, owner_id)
 */
export function persistLoginSessionMetadata(data) {
  if (!data || typeof data !== 'object') return;
  try {
    const roles = Array.isArray(data.roles) ? data.roles : [];
    let effectiveRole = String(data.role || '').trim();
    if (!effectiveRole && roles.length) {
      effectiveRole = roles.includes('provider') ? 'provider' : String(roles[0]);
    }
    if (!effectiveRole) effectiveRole = 'client';

    localStorage.setItem('userRole', effectiveRole);
    localStorage.setItem('userRoles', JSON.stringify(roles.length ? roles : [effectiveRole]));
    if (typeof data.has_password === 'boolean') {
      localStorage.setItem('hasPassword', data.has_password ? '1' : '0');
    } else {
      localStorage.removeItem('hasPassword');
    }

    if (roles.includes('provider')) {
      let pr = data.provider_role || 'super_master';
      if (pr === 'owner') pr = 'super_master';
      localStorage.setItem('providerRole', pr);
    } else {
      localStorage.removeItem('providerRole');
    }
    if (data.owner_id) localStorage.setItem('ownerId', data.owner_id);
    else localStorage.removeItem('ownerId');
    if (data.phone) localStorage.setItem('userPhone', data.phone);
  } catch {
    /* ignore */
  }
}

export function establishAdminSession(response) {
  if (!response || typeof response !== 'object') return false;
  const token = String(response.token ?? '').trim();
  const rawId = response.user_id ?? response.userId ?? response.id;
  const userId = rawId != null && rawId !== '' ? String(rawId).trim() : '';
  if (!token || !userId) return false;
  try {
    localStorage.setItem('adminAuthToken', token);
    localStorage.setItem('adminToken', token);
    localStorage.setItem('adminUserId', userId);
  } catch {
    return false;
  }
  return true;
}

export function persistAdminSessionMetadata(data) {
  if (!data || typeof data !== 'object') return;
  try {
    const roles = Array.isArray(data.roles) ? data.roles : [];
    localStorage.setItem('adminRoles', JSON.stringify(roles.length ? roles : ['admin']));
    if (data.email) localStorage.setItem('adminEmail', data.email);
    if (data.must_change_password) localStorage.setItem('adminMustChangePassword', '1');
    else localStorage.removeItem('adminMustChangePassword');
  } catch {
    /* ignore */
  }
}
