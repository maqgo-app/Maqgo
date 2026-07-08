import { describe, it, expect } from 'vitest';
import { shouldEnforceLegalForPath } from './ProtectedRoute.jsx';

describe('shouldEnforceLegalForPath', () => {
  it('no fuerza legal en provider home', () => {
    expect(shouldEnforceLegalForPath('/provider/home')).toBe(false);
  });

  it('fuerza legal en booking cliente', () => {
    expect(shouldEnforceLegalForPath('/client/booking')).toBe(true);
  });

  it('fuerza legal en retorno OneClick', () => {
    expect(shouldEnforceLegalForPath('/oneclick/complete')).toBe(true);
  });
});

