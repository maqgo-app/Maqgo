import { describe, it, expect } from 'vitest';
import { shouldMountGoogleAddressAutocomplete } from './serviceLocationUi.js';

describe('serviceLocationUi', () => {
  it('monta Google con API key y sin modo manual (evita deadlock con placesPhase)', () => {
    expect(shouldMountGoogleAddressAutocomplete(true, false)).toBe(true);
  });

  it('no monta Google en modo "No encuentro mi dirección"', () => {
    expect(shouldMountGoogleAddressAutocomplete(true, true)).toBe(false);
  });

  it('sin API key no monta Google', () => {
    expect(shouldMountGoogleAddressAutocomplete(false, false)).toBe(false);
  });
});
