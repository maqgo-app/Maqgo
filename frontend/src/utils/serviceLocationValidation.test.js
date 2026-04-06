import { describe, it, expect } from 'vitest';
import {
  validateServiceLocationContinue,
  REF_MIN_NO_KEY,
  REF_MIN_MAP_FAILED,
  REF_MIN_MANUAL_NOT_IN_LIST
} from './serviceLocationValidation';

const base = {
  locationTrimmed: 'Av. Test 123',
  comunaTrimmed: 'Santiago',
  refLen: 0,
  hasApiKey: true,
  placesPhase: 'ready',
  waitingForPlaces: false,
  serviceLat: -33.4,
  serviceLng: -70.6,
  manualAddressNotFound: false,
  isValidComuna: true,
  comunaFromGoogle: false
};

describe('validateServiceLocationContinue', () => {
  it('rechaza sin dirección', () => {
    expect(validateServiceLocationContinue({ ...base, locationTrimmed: '' }).code).toBe('NO_LOCATION');
  });

  it('rechaza sin comuna', () => {
    expect(validateServiceLocationContinue({ ...base, comunaTrimmed: '' }).code).toBe('NO_COMUNA');
  });

  it('con Places listo y sin coords no exige comuna antes que elegir sugerencia o modo manual', () => {
    expect(
      validateServiceLocationContinue({
        ...base,
        comunaTrimmed: '',
        serviceLat: null,
        serviceLng: null,
        manualAddressNotFound: false,
        locationTrimmed: 'Av. Providencia',
      }).code
    ).toBe('NEED_PLACE_OR_MANUAL');
  });

  it('rechaza comuna inválida', () => {
    expect(validateServiceLocationContinue({ ...base, isValidComuna: false }).code).toBe('INVALID_COMUNA');
  });

  it('rechaza mientras carga Places', () => {
    expect(
      validateServiceLocationContinue({ ...base, waitingForPlaces: true }).code
    ).toBe('WAITING_PLACES');
  });

  it('sin API key exige referencia mínima', () => {
    expect(
      validateServiceLocationContinue({
        ...base,
        hasApiKey: false,
        placesPhase: 'no_key',
        refLen: REF_MIN_NO_KEY - 1
      }).code
    ).toBe('REF_NO_KEY');
    expect(
      validateServiceLocationContinue({
        ...base,
        hasApiKey: false,
        placesPhase: 'no_key',
        refLen: REF_MIN_NO_KEY
      }).ok
    ).toBe(true);
  });

  it('si el mapa falló exige referencia larga', () => {
    expect(
      validateServiceLocationContinue({
        ...base,
        placesPhase: 'failed',
        serviceLat: null,
        serviceLng: null,
        refLen: REF_MIN_MAP_FAILED - 1
      }).code
    ).toBe('REF_MAP_FAILED');
    expect(
      validateServiceLocationContinue({
        ...base,
        placesPhase: 'failed',
        serviceLat: null,
        serviceLng: null,
        refLen: REF_MIN_MAP_FAILED
      }).ok
    ).toBe(true);
  });

  it('con Places listo exige lat/lng o modo manual', () => {
    expect(
      validateServiceLocationContinue({
        ...base,
        placesPhase: 'ready',
        serviceLat: null,
        serviceLng: null,
        manualAddressNotFound: false
      }).code
    ).toBe('NEED_PLACE_OR_MANUAL');
  });

  it('modo manual exige referencia suficiente', () => {
    expect(
      validateServiceLocationContinue({
        ...base,
        placesPhase: 'ready',
        serviceLat: null,
        serviceLng: null,
        manualAddressNotFound: true,
        refLen: REF_MIN_MANUAL_NOT_IN_LIST - 1
      }).code
    ).toBe('REF_MANUAL_SHORT');
    expect(
      validateServiceLocationContinue({
        ...base,
        placesPhase: 'ready',
        serviceLat: null,
        serviceLng: null,
        manualAddressNotFound: true,
        refLen: REF_MIN_MANUAL_NOT_IN_LIST
      }).ok
    ).toBe(true);
  });

  it('con selección de lista y coords ok permite continuar', () => {
    expect(validateServiceLocationContinue(base).ok).toBe(true);
  });

  it('comuna desde Google no exige lista si isValidComuna es false', () => {
    expect(
      validateServiceLocationContinue({
        ...base,
        comunaFromGoogle: true,
        isValidComuna: false
      }).ok
    ).toBe(true);
  });

  it('modo dirección escrita exige al menos un número en la calle', () => {
    expect(
      validateServiceLocationContinue({
        ...base,
        hasApiKey: false,
        placesPhase: 'no_key',
        locationTrimmed: 'Pasaje sin número',
        requiresManualStreetNumber: true,
        refLen: REF_MIN_NO_KEY
      }).code
    ).toBe('MANUAL_NO_STREET_NUMBER');
  });
});
