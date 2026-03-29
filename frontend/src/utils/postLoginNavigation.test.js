import { describe, it, expect } from 'vitest';
import { getPostLoginNavigation } from './postLoginNavigation.js';

describe('getPostLoginNavigation (invariante admin)', () => {
  it('admin → /admin', () => {
    expect(
      getPostLoginNavigation({
        isAdmin: true,
        effectiveRole: 'admin',
        redirectTo: null,
      })
    ).toEqual({ kind: 'navigate', path: '/admin' });
  });

  it('no admin + redirect /admin → error; no navegar al panel', () => {
    expect(
      getPostLoginNavigation({
        isAdmin: false,
        effectiveRole: 'client',
        redirectTo: '/admin',
      })
    ).toEqual({ kind: 'error_not_admin' });
  });

  it('cliente sin redirect → /client/home', () => {
    expect(
      getPostLoginNavigation({
        isAdmin: false,
        effectiveRole: 'client',
        redirectTo: null,
      })
    ).toEqual({ kind: 'navigate', path: '/client/home' });
  });

  it('cliente con redirect /client/... → respeta deep link', () => {
    expect(
      getPostLoginNavigation({
        isAdmin: false,
        effectiveRole: 'client',
        redirectTo: '/client/booking',
      })
    ).toEqual({ kind: 'navigate', path: '/client/booking' });
  });

  it('proveedor sin redirect → /provider/home', () => {
    expect(
      getPostLoginNavigation({
        isAdmin: false,
        effectiveRole: 'provider',
        redirectTo: null,
      })
    ).toEqual({ kind: 'navigate', path: '/provider/home' });
  });
});
