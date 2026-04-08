import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({
  default: {
    defaults: {},
    post: vi.fn(async () => ({ data: { message: 'ok' } })),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

describe('logoutAndClearSession', () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const originalEnv = import.meta.env;

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_BACKEND_URL', 'http://localhost:8000');
    globalThis.window = undefined;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
    if (originalEnv !== undefined) {
      // no-op, keeps linter aware we intentionally avoid process.env in browser tests
    }
  });

  it('llama /auth/logout y limpia sesión local', async () => {
    const store = {
      token: 'tok_123',
      authToken: 'tok_123',
      userId: 'u1',
      userRole: 'client',
      userPhone: '+56912345678',
      userRoles: '["client"]',
      providerRole: 'super_master',
      ownerId: 'owner_x',
      keepDraft: 'ok',
    };
    globalThis.localStorage = {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      removeItem: (k) => {
        delete store[k];
      },
      setItem: (k, v) => {
        store[k] = String(v);
      },
      clear: () => {
        Object.keys(store).forEach((k) => delete store[k]);
      },
    };

    const axios = (await import('axios')).default;
    const api = await import('./api.js');
    await api.logoutAndClearSession();

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, body] = axios.post.mock.calls[0];
    expect(url).toContain('/api/auth/logout');
    expect(body).toEqual({ token: 'tok_123' });

    expect(store.token).toBeUndefined();
    expect(store.authToken).toBeUndefined();
    expect(store.userId).toBeUndefined();
    expect(store.userRole).toBeUndefined();
    expect(store.keepDraft).toBe('ok');
  });
});
