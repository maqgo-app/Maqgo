import { describe, it, expect } from 'vitest';
import {
  mapPlaceToAddress,
  buildSelectedAddressFromForm,
  buildLocationDisplayLine,
  isSelectedAddressPlacesCanonical
} from './mapPlaceToAddress';

describe('mapPlaceToAddress', () => {
  it('devuelve null sin address_components', () => {
    expect(
      mapPlaceToAddress({
        geometry: { location: { lat: () => -33, lng: () => -70 } },
        address_components: []
      })
    ).toBeNull();
    expect(
      mapPlaceToAddress({
        geometry: { location: { lat: () => -33, lng: () => -70 } }
      })
    ).toBeNull();
  });

  it('construye address_short desde route y street_number y devuelve lat/lng', () => {
    const place = {
      geometry: { location: { lat: () => -33.1, lng: () => -70.6 } },
      address_components: [
        { long_name: 'Avenida Providencia', types: ['route'] },
        { long_name: '1234', types: ['street_number'] },
        { long_name: 'Providencia', types: ['locality', 'political'] }
      ],
      formatted_address: 'Av. Providencia 1234, Providencia, Región Metropolitana, Chile'
    };
    const r = mapPlaceToAddress(place);
    expect(r).not.toBeNull();
    expect(r.address_short).toMatch(/Providencia/);
    expect(r.address_short).toMatch(/1234/);
    expect(r.commune).toBe('Providencia');
    expect(r.address_full).toContain('Chile');
    expect(r.lat).toBe(-33.1);
    expect(r.lng).toBe(-70.6);
  });
});

describe('isSelectedAddressPlacesCanonical', () => {
  it('requiere address_short, commune y coords numéricas', () => {
    expect(
      isSelectedAddressPlacesCanonical({
        address_short: 'Av. X 1',
        commune: 'Santiago',
        lat: -33.4,
        lng: -70.6
      })
    ).toBe(true);
    expect(
      isSelectedAddressPlacesCanonical({
        address_short: 'Av. X 1',
        commune: '',
        lat: -33.4,
        lng: -70.6
      })
    ).toBe(false);
    expect(
      isSelectedAddressPlacesCanonical({
        address_short: '',
        commune: 'Santiago',
        lat: -33.4,
        lng: -70.6
      })
    ).toBe(false);
    expect(isSelectedAddressPlacesCanonical(null)).toBe(false);
  });
});

describe('buildLocationDisplayLine', () => {
  it('no duplica comuna si ya es el último segmento', () => {
    expect(buildLocationDisplayLine('Lo Barnechea', 'Lo Barnechea')).toBe('Lo Barnechea');
    expect(buildLocationDisplayLine('Calle X, Lo Barnechea', 'Lo Barnechea')).toBe('Calle X, Lo Barnechea');
  });

  it('concatena calle y comuna si faltaba', () => {
    expect(buildLocationDisplayLine('Av. Apoquindo 1234', 'Las Condes')).toBe(
      'Av. Apoquindo 1234, Las Condes'
    );
  });
});

describe('buildSelectedAddressFromForm', () => {
  it('arma address_full y mantiene coordenadas', () => {
    const r = buildSelectedAddressFromForm({
      location: 'Calle Falsa 123',
      comuna: 'Santiago',
      lat: -33,
      lng: -70
    });
    expect(r.address_short).toBe('Calle Falsa 123');
    expect(r.commune).toBe('Santiago');
    expect(r.address_full).toBe('Calle Falsa 123, Santiago, Chile');
    expect(r.lat).toBe(-33);
    expect(r.lng).toBe(-70);
  });
});
