import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../utils/api', () => {
  return {
    default: 'https://example.test',
    fetchWithAuth: vi.fn(),
    clearLocalSession: vi.fn(),
  };
});

vi.mock('../../context/authHooks', () => {
  return {
    useAuth: () => ({ login: loginSpy, hasPermission: vi.fn(() => true) }),
  };
});

vi.mock('../../components/Toast', () => {
  return { useToast: () => toastCtx };
});

vi.mock('../../utils/providerBecomeApi', () => {
  let _hasProvider = false;
  return {
    hasProviderRoleInStorage: () => _hasProvider,
    _setHasProviderRoleInStorage: (v) => { _hasProvider = Boolean(v); },
  };
});

vi.mock('../../utils/safeStorage', () => {
  return {
    getObject: (k, fallback) => {
      const v = globalThis.localStorage?.getItem?.(k);
      if (v === null || v === undefined) return fallback;
      try { return JSON.parse(v); } catch { return fallback; }
    },
  };
});

import { _setHasProviderRoleInStorage } from '../../utils/providerBecomeApi';

let loginSpy;
let toastCtx;
let _store;
let _warnLogs;
let _errorLogs;
let _successLogs;

function installLocalStorageMock(seed = {}) {
  _store = { ...seed };
  globalThis.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null),
    setItem: (k, v) => { _store[k] = String(v); },
    removeItem: (k) => { delete _store[k]; },
    clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
  };
  return _store;
}

function createMockedContext() {
  loginSpy = vi.fn();
  _warnLogs = [];
  _errorLogs = [];
  _successLogs = [];
  toastCtx = {
    success: (m) => _successLogs.push(m),
    error: (m) => _errorLogs.push(m),
    warning: (m) => _warnLogs.push(m),
  };
  return { loginSpy, toastCtx };
}

beforeEach(() => {
  createMockedContext();
  installLocalStorageMock({ userId: 'usr_test_001', userPhone: '+569000000000' });
  _setHasProviderRoleInStorage(false);
});

afterEach(() => {
  loginSpy = undefined;
  toastCtx = undefined;
});

describe('BancoScreen become-provider logic (LÓGICA 1:1 con BancoScreen.js handleSave)', () => {
  const BANK_DATA = {
    bank: 'Banco Estado',
    accountType: 'cuenta_rut',
    accountNumber: '12345678',
    holderName: 'Juan Pérez',
    holderRut: '11.111.111-1',
  };
  const PROVIDER_DATA = { businessName: 'Empresa', rut: '76.000.000-5', giro: 'Arriendo', comuna: 'Santiago' };

  function bancoScreenSaveLogic({
    hasProviderRoleBefore,
    finalizeOnboarding,
    patchResult,
    patchThrows = null,
    isDemoId = false,
    productionEnv = false,
  }) {
    _setHasProviderRoleInStorage(hasProviderRoleBefore);
    const userId = localStorage.getItem('userId');

    const needsBecomeProvider = Boolean(finalizeOnboarding) && !hasProviderRoleBefore;

    function syncProviderRoleFromPatch(patchRes, ctx) {
      if (!needsBecomeProvider) return true;
      const roles = Array.isArray(patchRes?.roles) ? patchRes.roles : [];
      if (!roles.includes('provider')) {
        ctx.toast.error('No pudimos activar tu cuenta proveedor. Vuelve a intentarlo o inicia sesión nuevamente.');
        return false;
      }
      const pr = patchRes.provider_role || localStorage.getItem('providerRole') || 'super_master';
      const prNormalized = pr === 'owner' ? 'super_master' : pr;
      localStorage.setItem('userRole', 'provider');
      localStorage.setItem('userRoles', JSON.stringify(roles));
      localStorage.setItem('providerRole', prNormalized);
      const uid = String(patchRes.id || userId || localStorage.getItem('userId') || '').trim();
      if (uid) ctx.login(uid, 'provider', prNormalized, patchRes.owner_id || null);
      return true;
    }

    const ctx = { toast: toastCtx, login: loginSpy };
    const nextProviderData = { ...PROVIDER_DATA, bankData: BANK_DATA };
    const body = {
      providerData: nextProviderData,
      ...(finalizeOnboarding ? { onboarding_completed: true } : {}),
      ...(needsBecomeProvider ? { add_provider: true } : {}),
    };
    const out = {
      body,
      needsBecomeProvider,
      backendSynced: true,
      providerRoleSyncOk: true,
    };
    if (userId && !isDemoId) {
      if (patchThrows) {
        out.backendSynced = false;
      } else {
        out.patchRes = patchResult;
        if (needsBecomeProvider) {
          out.providerRoleSyncOk = syncProviderRoleFromPatch(patchResult, ctx);
        }
      }
    }

    if (!out.providerRoleSyncOk) {
      out.stoppedAfterNoSync = true;
      return out;
    }
    if (!out.backendSynced && productionEnv) {
      ctx.toast.error('No pudimos guardar tus datos bancarios. Revisa tu conexión e intenta nuevamente.');
      out.backendErrorShown = true;
      return out;
    }
    return out;
  }

  it('CASO A: finalizeOnboarding=true y client → add_provider:true, sync, userRole=provider, login() provider', () => {
    localStorage.setItem('userRole', 'client');
    localStorage.setItem('userRoles', JSON.stringify(['client']));
    const patchRes = { id: 'usr_test_001', roles: ['client', 'provider'], provider_role: 'super_master', owner_id: 'own_xyz' };
    const out = bancoScreenSaveLogic({ hasProviderRoleBefore: false, finalizeOnboarding: true, patchResult: patchRes });

    expect(out.needsBecomeProvider).toBe(true);
    expect(out.body.add_provider).toBe(true);
    expect(out.body.onboarding_completed).toBe(true);
    expect(out.providerRoleSyncOk).toBe(true);
    expect(localStorage.getItem('userRole')).toBe('provider');
    expect(JSON.parse(localStorage.getItem('userRoles'))).toEqual(expect.arrayContaining(['provider']));
    expect(localStorage.getItem('providerRole')).toBe('super_master');
    expect(loginSpy).toHaveBeenCalledTimes(1);
    expect(loginSpy).toHaveBeenCalledWith('usr_test_001', 'provider', 'super_master', 'own_xyz');
    expect(_errorLogs.length).toBe(0);
  });

  it('CASO B: ya provider (hasProviderRoleBefore=true) → NO add_provider aunque finalizeOnboarding=true', () => {
    localStorage.setItem('userRole', 'provider');
    localStorage.setItem('userRoles', JSON.stringify(['provider']));
    localStorage.setItem('providerRole', 'super_master');
    const patchRes = { id: 'usr_test_001', roles: ['provider'], provider_role: 'super_master' };
    const out = bancoScreenSaveLogic({ hasProviderRoleBefore: true, finalizeOnboarding: true, patchResult: patchRes });

    expect(out.needsBecomeProvider).toBe(false);
    expect(out.body.add_provider).toBeUndefined();
    expect(out.body.onboarding_completed).toBe(true);
    expect(loginSpy).toHaveBeenCalledTimes(0);
    expect(localStorage.getItem('userRole')).toBe('provider');
    expect(_errorLogs.length).toBe(0);
  });

  it('CASO B extra: finalizeOnboarding=false PERO hasProviderRoleBefore=true → NO add_provider, NO upgrade', () => {
    localStorage.setItem('userRole', 'provider');
    const patchRes = { id: 'usr_test_001', roles: ['provider'] };
    const out = bancoScreenSaveLogic({ hasProviderRoleBefore: true, finalizeOnboarding: false, patchResult: patchRes });

    expect(out.needsBecomeProvider).toBe(false);
    expect(out.body.add_provider).toBeUndefined();
    expect(out.body.onboarding_completed).toBeUndefined();
    expect(loginSpy).toHaveBeenCalledTimes(0);
  });

  it('CASO C: finalizeOnboarding=true, backend no devuelve provider → NO userRole provider, error, stop, NO login', () => {
    localStorage.setItem('userRole', 'client');
    localStorage.setItem('userRoles', JSON.stringify(['client']));
    const patchNoProvider = { id: 'usr_test_001', roles: ['client'] };
    const out = bancoScreenSaveLogic({ hasProviderRoleBefore: false, finalizeOnboarding: true, patchResult: patchNoProvider });

    expect(out.body.add_provider).toBe(true);
    expect(out.providerRoleSyncOk).toBe(false);
    expect(out.stoppedAfterNoSync).toBe(true);
    expect(localStorage.getItem('userRole')).toBe('client');
    expect(JSON.parse(localStorage.getItem('userRoles'))).toEqual(['client']);
    expect(localStorage.getItem('providerRole')).toBeNull();
    expect(loginSpy).toHaveBeenCalledTimes(0);
    expect(_errorLogs.some((m) => String(m).toLowerCase().includes('cuenta proveedor'))).toBe(true);
  });

  it('CASO D: PATCH falla → NO upgrade, backendSynced=false, error (en PROD)', () => {
    localStorage.setItem('userRole', 'client');
    const err = new Error('network');
    const out = bancoScreenSaveLogic({ hasProviderRoleBefore: false, finalizeOnboarding: true, patchThrows: err, productionEnv: true });

    expect(out.backendSynced).toBe(false);
    expect(out.backendErrorShown).toBe(true);
    expect(localStorage.getItem('userRole')).toBe('client');
    expect(loginSpy).toHaveBeenCalledTimes(0);
    expect(_errorLogs.some((m) => String(m).toLowerCase().includes('datos bancarios'))).toBe(true);
  });

  it('finalizeOnboarding=false + client → NO add_provider, NO upgrade aunque backend retorne provider', () => {
    localStorage.setItem('userRole', 'client');
    const patchRes = { id: 'usr_test_001', roles: ['client', 'provider'] };
    const out = bancoScreenSaveLogic({ hasProviderRoleBefore: false, finalizeOnboarding: false, patchResult: patchRes });

    expect(out.needsBecomeProvider).toBe(false);
    expect(out.body.add_provider).toBeUndefined();
    expect(out.body.onboarding_completed).toBeUndefined();
    expect(loginSpy).toHaveBeenCalledTimes(0);
    expect(localStorage.getItem('userRole')).toBe('client');
  });
});
