import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({
  logoutAndClearSession: vi.fn(async () => {}),
}));

import { logoutAndClearSession } from './api';
import { clearAuthSessionPreservingDraft } from './sessionCleanup';

function installLocalStorageMock(seed = {}) {
  const store = { ...seed };
  globalThis.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
  };
  return store;
}

describe('clearAuthSessionPreservingDraft', () => {
  const original = globalThis.localStorage;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (original === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = original;
    }
  });

  it('invalida sesión backend y limpia flags auth extra', async () => {
    const store = installLocalStorageMock({
      desiredRole: 'provider',
      adminMode: '1',
      isAuthenticated: 'true',
      refreshToken: 'rt',
      keepDraft: 'ok',
    });

    await clearAuthSessionPreservingDraft();

    expect(logoutAndClearSession).toHaveBeenCalledTimes(1);
    expect(store.desiredRole).toBeUndefined();
    expect(store.adminMode).toBeUndefined();
    expect(store.isAuthenticated).toBeUndefined();
    expect(store.refreshToken).toBeUndefined();
    expect(store.keepDraft).toBe('ok');
  });
});
