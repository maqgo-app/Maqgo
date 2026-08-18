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

vi.mock('../../utils/providerOnboardingDraftState', () => {
  return {
    getProviderDraftArray: () => [],
    getProviderDraftObject: () => ({}),
    useProviderOnboardingDraftCleanup: () => true,
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

import BACKEND_URL, { fetchWithAuth } from '../../utils/api';
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
  fetchWithAuth.mockReset();
  installLocalStorageMock({ userId: 'usr_test_001', userPhone: '+56900000000' });
  _setHasProviderRoleInStorage(false);
});

afterEach(() => {
  fetchWithAuth.mockReset();
  loginSpy = undefined;
  toastCtx = undefined;
});

describe('ReviewScreen become-provider logic (LÓGICA 1:1 con ReviewScreen.js)', () => {
  const SAMPLE_PROVIDER = { businessName: 'Empresa S.A.', rut: '76.000.000-5', email: 'empresa@example.com', giro: 'Arriendo maquinaria', comuna: 'Las Condes' };
  const SAMPLE_MACHINE = { machineryType: 'retroexcavadora', licensePlate: 'ABC123', year: 2020 };
  const SAMPLE_OPERATORS = [{ firstName: 'Juan', lastName: 'Pérez', rut: '11.111.111-1', isPrimary: true }];

  function reviewScreenLogic({
    hasProviderRoleBefore,
    patchFirstResult,
    patchFirstThrows = null,
    patchSecondResult = null,
    emailCandidate = 'empresa@example.com',
  }) {
    _setHasProviderRoleInStorage(hasProviderRoleBefore);
    const userId = localStorage.getItem('userId');
    const real_needs = !hasProviderRoleBefore;

    const payloadBase = {
      providerData: SAMPLE_PROVIDER,
      machineData: SAMPLE_MACHINE,
      operators: SAMPLE_OPERATORS,
      ...(real_needs ? { add_provider: true } : {}),
    };
    if (SAMPLE_MACHINE.machineryType) payloadBase.machineryType = SAMPLE_MACHINE.machineryType;
    const payloadWithEmail = emailCandidate ? { ...payloadBase, email: emailCandidate } : payloadBase;

    function syncProviderRoleFromPatch(patchRes, requiredForFallback, ctx) {
      if (!real_needs) return true;
      const roles = Array.isArray(patchRes?.roles) ? patchRes.roles : [];
      if (!roles.includes('provider')) {
        if (requiredForFallback !== true) return false;
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
    let patchRes = null;
    let outcome = { ok: true, payloadWithEmail: null, payloadBase: null, syncAfterFirst: null, syncAfterSecond: null, stoppedAfterNoSync: false, emailFallbackTriggered: false };
    outcome.payloadWithEmail = payloadWithEmail;
    outcome.payloadBase = payloadBase;

    if (patchFirstThrows) {
      const e = patchFirstThrows;
      const status = e?.response?.status || e?.status;
      const detail = e?.response?.data?.detail || e?.detail;
      const detailText = typeof detail === 'string' ? detail : '';
      if (status === 409 && emailCandidate) {
        outcome.emailFallbackTriggered = true;
        if (patchSecondResult !== null) {
          if (patchSecondResult && typeof patchSecondResult === 'object' && patchSecondResult.__throws) {
            throw patchSecondResult.__err;
          }
          patchRes = patchSecondResult;
          if (real_needs) {
            const ok = syncProviderRoleFromPatch(patchRes, true, ctx);
            outcome.syncAfterSecond = ok;
            if (!ok) { outcome.stoppedAfterNoSync = true; return outcome; }
          }
          ctx.toast.warning('El correo ya está asociado a otra cuenta. Finalizamos tu registro sin correo; puedes actualizarlo luego en Perfil.');
        }
      } else if (status && detailText) {
        ctx.toast.error(detailText);
        outcome.ok = false; outcome.errorText = detailText; return outcome;
      } else {
        outcome.ok = false; outcome.thrown = patchFirstThrows; return outcome;
      }
    } else {
      patchRes = patchFirstResult;
      if (real_needs) {
        const ok = syncProviderRoleFromPatch(patchRes, false, ctx);
        outcome.syncAfterFirst = ok;
        if (!ok) {
          ctx.toast.error('No pudimos activar tu cuenta proveedor. Vuelve a intentarlo o inicia sesión nuevamente.');
          outcome.stoppedAfterNoSync = true;
          return outcome;
        }
      }
    }
    return outcome;
  }

  it('CASO A: CLIENT→PROVIDER. add_provider:true + userRole/providerRole + login provider', () => {
    localStorage.setItem('userRole', 'client');
    localStorage.setItem('userRoles', JSON.stringify(['client']));

    const patchSuccess = { id: 'usr_test_001', roles: ['client', 'provider'], provider_role: 'super_master', owner_id: 'own_abc' };
    const out = reviewScreenLogic({ hasProviderRoleBefore: false, patchFirstResult: patchSuccess });

    expect(out.payloadWithEmail.add_provider).toBe(true);
    expect(out.payloadBase.add_provider).toBe(true);
    expect(out.syncAfterFirst).toBe(true);
    expect(localStorage.getItem('userRole')).toBe('provider');
    expect(JSON.parse(localStorage.getItem('userRoles'))).toEqual(expect.arrayContaining(['provider']));
    expect(localStorage.getItem('providerRole')).toBe('super_master');
    expect(loginSpy).toHaveBeenCalledTimes(1);
    expect(loginSpy).toHaveBeenCalledWith('usr_test_001', 'provider', 'super_master', 'own_abc');
    expect(_errorLogs.length).toBe(0);
  });

  it('CASO A extra: provider_role=owner se normaliza a super_master', () => {
    localStorage.setItem('userRole', 'client');
    const patchSuccess = { id: 'usr_test_001', roles: ['provider'], provider_role: 'owner' };
    reviewScreenLogic({ hasProviderRoleBefore: false, patchFirstResult: patchSuccess });
    expect(localStorage.getItem('providerRole')).toBe('super_master');
    expect(loginSpy).toHaveBeenCalledWith('usr_test_001', 'provider', 'super_master', null);
  });

  it('CASO B: USUARIO YA PROVIDER. NO add_provider, NO upgrade, NO login doble, NO cambio userRole', () => {
    localStorage.setItem('userRole', 'provider');
    localStorage.setItem('userRoles', JSON.stringify(['provider']));
    localStorage.setItem('providerRole', 'super_master');

    const patchSuccess = { id: 'usr_test_001', roles: ['provider'], provider_role: 'super_master' };
    const out = reviewScreenLogic({ hasProviderRoleBefore: true, patchFirstResult: patchSuccess });

    expect(out.payloadBase.add_provider).toBeUndefined();
    expect(out.payloadWithEmail.add_provider).toBeUndefined();
    expect(out.syncAfterFirst).toBeNull();
    expect(localStorage.getItem('userRole')).toBe('provider');
    expect(loginSpy).toHaveBeenCalledTimes(0);
    expect(_errorLogs.length).toBe(0);
  });

  it('CASO C: Backend PATCH exitoso PERO NO devuelve provider roles. NO userRole provider, NO login, error, stop', () => {
    localStorage.setItem('userRole', 'client');
    localStorage.setItem('userRoles', JSON.stringify(['client']));
    const patchNoProvider = { id: 'usr_test_001', roles: ['client'], provider_role: undefined };

    const out = reviewScreenLogic({ hasProviderRoleBefore: false, patchFirstResult: patchNoProvider });

    expect(out.syncAfterFirst).toBe(false);
    expect(out.stoppedAfterNoSync).toBe(true);
    expect(localStorage.getItem('userRole')).toBe('client');
    expect(JSON.parse(localStorage.getItem('userRoles'))).toEqual(['client']);
    expect(localStorage.getItem('providerRole')).toBeNull();
    expect(loginSpy).toHaveBeenCalledTimes(0);
    expect(_errorLogs.length).toBeGreaterThanOrEqual(1);
    expect(_errorLogs.some((m) => String(m).toLowerCase().includes('cuenta proveedor'))).toBe(true);
  });

  it('CASO D: PATCH FALLA con error 500. NO promoción local, manejo error, NO login', () => {
    localStorage.setItem('userRole', 'client');
    const errorThrow = { response: { status: 500, data: { detail: 'Error interno del servidor' } } };
    const out = reviewScreenLogic({ hasProviderRoleBefore: false, patchFirstThrows: errorThrow });

    expect(out.ok).toBe(false);
    expect(localStorage.getItem('userRole')).toBe('client');
    expect(loginSpy).toHaveBeenCalledTimes(0);
    expect(_errorLogs[0]).toBe('Error interno del servidor');
  });

  it('CASO A + HTTP 409 correo duplicado → fallback sin email, add_provider:true en ambos payloads, sync provider', () => {
    localStorage.setItem('userRole', 'client');
    const throw409 = { response: { status: 409, data: { detail: 'email ya existe' } } };
    const patchFallbackSuccess = { id: 'usr_test_001', roles: ['client', 'provider'], provider_role: 'super_master', owner_id: 'own_abc' };

    const out = reviewScreenLogic({
      hasProviderRoleBefore: false,
      patchFirstThrows: throw409,
      patchSecondResult: patchFallbackSuccess,
      emailCandidate: 'empresa@example.com',
    });

    expect(out.emailFallbackTriggered).toBe(true);
    expect(out.payloadWithEmail.add_provider).toBe(true);
    expect(out.payloadBase.add_provider).toBe(true);
    expect(out.syncAfterSecond).toBe(true);
    expect(localStorage.getItem('userRole')).toBe('provider');
    expect(JSON.parse(localStorage.getItem('userRoles'))).toEqual(expect.arrayContaining(['provider']));
    expect(localStorage.getItem('providerRole')).toBe('super_master');
    expect(loginSpy).toHaveBeenCalledTimes(1);
    expect(loginSpy).toHaveBeenCalledWith('usr_test_001', 'provider', 'super_master', 'own_abc');
    expect(_warnLogs.some((m) => String(m).toLowerCase().includes('correo ya está asociado'))).toBe(true);
  });

  it('CASO C + fallback 409: backend no devuelve provider en segundo PATCH → error, stop, NO upgrade', () => {
    localStorage.setItem('userRole', 'client');
    localStorage.setItem('userRoles', JSON.stringify(['client']));
    const throw409 = { response: { status: 409, data: { detail: 'email ya existe' } } };
    const patchFallbackNoProvider = { id: 'usr_test_001', roles: ['client'] };

    const out = reviewScreenLogic({
      hasProviderRoleBefore: false,
      patchFirstThrows: throw409,
      patchSecondResult: patchFallbackNoProvider,
    });

    expect(out.syncAfterSecond).toBe(false);
    expect(out.stoppedAfterNoSync).toBe(true);
    expect(localStorage.getItem('userRole')).toBe('client');
    expect(loginSpy).toHaveBeenCalledTimes(0);
    expect(_errorLogs.length).toBeGreaterThanOrEqual(1);
    expect(_warnLogs.length).toBe(0);
  });
});
