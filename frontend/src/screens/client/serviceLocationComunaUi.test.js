import { describe, it, expect } from 'vitest';
import {
  isServiceComunaReadonly,
  shouldHideServiceLocationComunaField
} from './serviceLocationComunaUtils.js';

/**
 * Contrato UI: ocultar comuna solo con fuente Places canónica (o legacy google) y comuna no vacía.
 */
describe('ServiceLocationScreen — comuna (contrato UI)', () => {
  it('ocultar solo con places_canonical|google y comuna no vacía', () => {
    expect(shouldHideServiceLocationComunaField('places_canonical', 'Las Condes')).toBe(true);
    expect(shouldHideServiceLocationComunaField('google', 'Las Condes')).toBe(true);
    expect(shouldHideServiceLocationComunaField('google', '  ')).toBe(false);
    expect(shouldHideServiceLocationComunaField('google', '')).toBe(false);
  });

  it('isServiceComunaReadonly coincide con shouldHide (alias)', () => {
    expect(isServiceComunaReadonly('google', 'X')).toBe(shouldHideServiceLocationComunaField('google', 'X'));
    expect(isServiceComunaReadonly('manual', 'Santiago')).toBe(false);
    expect(isServiceComunaReadonly('manual', '')).toBe(false);
  });
});
