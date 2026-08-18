/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { createRef, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthContext } from './AuthContext.jsx';
import { AuthProvider } from './AuthContext.jsx';

const SESSION_KEYS_AUDIT = [
  'userRoles',
  'userRole',
  'providerRole',
  'providerData',
  'machineData',
  'operatorsData',
  'bankData',
  'providerOnboardingCompleted',
  'providerOnboardingStep',
  'firstMachineOperator',
  'providerCameFromWelcome',
  'providerMachines',
  'masterPermissionsByUserId',
  'bookingDraft',
  'clientDraft',
  'activeBookingId',
  'userPhone',
  'ownerId',
];

function readLsAudit() {
  const out = {};
  for (const k of SESSION_KEYS_AUDIT) {
    const v = localStorage.getItem(k);
    if (v !== null) out[k] = v;
  }
  const all = { ...localStorage };
  for (const k of Object.keys(all)) {
    if (k.startsWith('providerMachines:')) out[k] = all[k];
  }
  return out;
}

function installLocalStorage() {
  const store = {};
  const impl = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    key: (idx) => Object.keys(store)[idx] ?? null,
    get length() { return Object.keys(store).length; },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: impl, writable: true, configurable: true });
  localStorage.clear();
  return store;
}

describe('AUTH CROSS-USER INTEGRATION: USER A → logout → USER B (NO contaminación)', () => {
  const originalLs = globalThis.localStorage;
  let host = null;
  let root = null;

  beforeEach(() => {
    installLocalStorage();
    host = document.createElement('div');
    host.setAttribute('id', 'cross-user-root');
    if (!document.body) {
      const bodyEl = document.createElement('body');
      document.documentElement.appendChild(bodyEl);
    }
    document.body.appendChild(host);
  });

  afterEach(() => {
    if (root && typeof root.unmount === 'function') {
      try { root.unmount(); } catch {}
    }
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
    root = null;
    if (originalLs === undefined) delete globalThis.localStorage;
    else Object.defineProperty(globalThis, 'localStorage', { value: originalLs, writable: true, configurable: true });
  });

  function mountAndCaptureCtx() {
    const ctxRef = createRef();
    return new Promise((resolve) => {
      function Capture() {
        return (
          <AuthProvider>
            <AuthContext.Consumer>
              {(value) => {
                ctxRef.current = value;
                queueMicrotask(() => resolve(ctxRef));
                return React.createElement('span', null, 'ok');
              }}
            </AuthContext.Consumer>
          </AuthProvider>
        );
      }
      root = createRoot(host);
      // NO StrictMode; login es setUser async state, Consumer actualiza ref cada render pero StrictMode causa doble mount + riesgo stale.
      root.render(React.createElement(Capture));
    });
  }

  it('USER A provider → logout → USER B client. B NO hereda keys sesión/onboarding de A', async () => {
    const ctxRef = await mountAndCaptureCtx();
    const getCtx = () => ctxRef.current;

    // 1) USER A login proveedor (roles client+provider)
    await getCtx().login(
      'usr_A',
      'provider',
      'super_master',
      'own_A',
      false,
      { name: 'Usuario A Proveedor', phone: '+56911111111' },
      ['client', 'provider']
    );

    // 2) USER A completó onboarding provider en LS → estado potencialmente contaminante
    localStorage.setItem('providerData', JSON.stringify({ businessName: 'EMPRESA A LTDA', rut: '11.111.111-1' }));
    localStorage.setItem('machineData', JSON.stringify({ machineryType: 'retroexcavadora', licensePlate: 'AAAA11' }));
    localStorage.setItem('operatorsData', JSON.stringify([{ id: 'op-A', name: 'Operador A' }]));
    localStorage.setItem('bankData', JSON.stringify({ bank: 'Banco A', accountType: 'cta_corriente', accountNumber: '123', holderName: 'A', holderRut: '1-9' }));
    localStorage.setItem('providerOnboardingCompleted', 'true');
    localStorage.setItem('providerOnboardingStep', '3');
    localStorage.setItem('firstMachineOperator', JSON.stringify({ firstName: 'Op', lastName: 'A', rut: '1-9', phone: '+56911111111' }));
    localStorage.setItem('providerCameFromWelcome', 'true');
    localStorage.setItem('providerMachines', JSON.stringify([{ id: 'mach_A', machineryType: 'retroexcavadora', licensePlate: 'AAAA11' }]));
    localStorage.setItem('providerMachines:usr_A', JSON.stringify([{ id: 'mach_A' }]));
    localStorage.setItem('masterPermissionsByUserId', JSON.stringify({ usr_LEGACY: { canManageMachines: true } }));
    localStorage.setItem('bookingDraft', JSON.stringify({ bookingA: true }));
    localStorage.setItem('clientDraft', JSON.stringify({ clientA: true }));
    localStorage.setItem('activeBookingId', 'bk_A_001');
    localStorage.setItem('userPhone', '+56911111111');

    // Pre: confirmar que A tiene estado cargado
    const postLoginA = readLsAudit();
    expect(postLoginA.userRole).toBe('provider');
    expect(JSON.parse(postLoginA.userRoles || '[]')).toEqual(expect.arrayContaining(['provider']));
    expect(postLoginA.providerRole).toBe('super_master');
    expect(postLoginA.ownerId).toBe('own_A');
    expect(postLoginA.providerOnboardingCompleted).toBe('true');
    expect(postLoginA.providerData).toBeTruthy();

    // 3) LOGOUT USER A
    await getCtx().logout();

    // VERIFICACIÓN 1: POST LOGOUT LS LIMPIO (keys audit)
    const afterLogout = readLsAudit();
    const residualKeys = Object.keys(afterLogout);
    expect(residualKeys, `keys residuales después logout USER A: [${residualKeys.join(', ')}]`).toEqual([]);

    // 4) USER B LOGIN CLIENT (solo rol client)
    await getCtx().login(
      'usr_B',
      'client',
      null,
      null,
      false,
      { name: 'Usuario B Cliente', phone: '+56922222222' },
      ['client']
    );

    // VERIFICACIÓN 2: USER B SOLO TIENE KEYS DE CLIENT ESPERADAS
    const afterLoginB = readLsAudit();

    // Rol de B esperado: client
    expect(afterLoginB.userRole, 'B.userRole = client').toBe('client');
    expect(JSON.parse(afterLoginB.userRoles || 'null'), 'B.userRoles = [client]').toEqual(['client']);

    // B NO TIENE providerRole/ownerId (login() rol client borra ambos mediante removeItem → key no existe)
    expect('providerRole' in afterLoginB, 'B.providerRole NO existe en LS audit (client)').toBe(false);
    expect('ownerId' in afterLoginB, 'B.ownerId NO existe en LS audit (client)').toBe(false);

    // B NO HEREDA NINGUNA KEY DE PROVIDER/ONBOARDING DE A
    const forbiddenInB = [
      'providerData','machineData','operatorsData','bankData',
      'providerOnboardingCompleted','providerOnboardingStep','firstMachineOperator',
      'providerCameFromWelcome','providerMachines','masterPermissionsByUserId',
      'bookingDraft','clientDraft','activeBookingId','userPhone',
    ];
    for (const k of forbiddenInB) {
      expect(afterLoginB[k], `USER B NO hereda ${k}`).toBeUndefined();
    }
    // Namespaced: providerMachines:usr_A (cualquiera que empiece con providerMachines:)
    for (const k of Object.keys(afterLoginB)) {
      expect(k.startsWith('providerMachines:'), `Key namespaced residual user anterior → ${k}`).toBe(false);
    }

    // Login B efectivamente setea userId=usr_B en localStorage (el comportamiento observable; ctx.user.state React actualizará en siguiente render en UI)
    expect(localStorage.getItem('userId'), 'LS B.userId = usr_B').toBe('usr_B');
    expect(localStorage.getItem('userRole'), 'LS B.userRole = client').toBe('client');
    const finalRoles = JSON.parse(localStorage.getItem('userRoles') || 'null');
    expect(finalRoles, 'LS B.userRoles = [client]').toEqual(['client']);

    // NO debe sobrevivir providerRole o ownerId en LS (login rol client → removeItem)
    expect(localStorage.getItem('providerRole'), 'LS B.providerRole = null (client)').toBeNull();
    expect(localStorage.getItem('ownerId'), 'LS B.ownerId = null (client)').toBeNull();

    // Namespaced keys por usuario anterior (providerMachines:usr_A) → null
    expect(localStorage.getItem('providerMachines:usr_A'), 'LS NO providerMachines:usr_A (B no hereda A namespace)').toBeNull();
  }, 15000);
});
