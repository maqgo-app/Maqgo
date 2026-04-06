import { describe, it, expect, afterEach } from 'vitest';
import {
  mapPlaceToAddress,
  splitManualAddressLine,
  buildSelectedAddressFromForm,
  buildLocationDisplayLine,
  isSelectedAddressPlacesCanonical,
  patchStoredSelectedAddressCommune,
  SELECTED_ADDRESS_KEY
} from './mapPlaceToAddress';

describe('splitManualAddressLine', () => {
  it('detecta número al final (ASCII)', () => {
    const r = splitManualAddressLine('Av. Apoquindo 1234');
    expect(r.hasStreetNumber).toBe(true);
    expect(r.number).toBe('1234');
  });

  it('detecta dígitos Unicode (pegado desde Word/PDF)', () => {
    const withFullwidth = 'Av. Test \uFF11\uFF12\uFF13\uFF14';
    const r = splitManualAddressLine(withFullwidth);
    expect(r.hasStreetNumber).toBe(true);
  });

  it('12 de Octubre 500: número de portal al final (no confundir con nombre de calle)', () => {
    const r = splitManualAddressLine('12 de Octubre 500');
    expect(r.hasStreetNumber).toBe(true);
    expect(r.number).toBe('500');
    expect(r.street).toContain('12 de Octubre');
  });
});

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
    expect(r.street).toMatch(/Providencia/);
    expect(r.number).toBe('1234');
    expect(r.source).toBe('google');
  });

  it('rechaza selección con calle pero sin street_number (MISSING_STREET_NUMBER)', () => {
    const place = {
      geometry: { location: { lat: () => -33.1, lng: () => -70.6 } },
      address_components: [
        { long_name: 'Avenida Providencia', types: ['route'] },
        { long_name: 'Providencia', types: ['locality', 'political'] }
      ]
    };
    expect(mapPlaceToAddress(place)).toEqual({ ok: false, code: 'MISSING_STREET_NUMBER' });
  });

  it('rechaza sin route en componentes (NO_STREET_NUMBER)', () => {
    const place = {
      geometry: { location: { lat: () => -33.1, lng: () => -70.6 } },
      address_components: [{ long_name: 'Providencia', types: ['locality', 'political'] }]
    };
    expect(mapPlaceToAddress(place)).toEqual({ ok: false, code: 'NO_STREET_NUMBER' });
  });

  it('rechaza sin comuna homologada', () => {
    const place = {
      geometry: { location: { lat: () => -33.1, lng: () => -70.6 } },
      address_components: [
        { long_name: 'Calle X', types: ['route'] },
        { long_name: '1', types: ['street_number'] },
        { long_name: 'Zona inventada', types: ['locality', 'political'] }
      ]
    };
    expect(mapPlaceToAddress(place)).toEqual({ ok: false, code: 'NO_COMUNA_FROM_PLACE' });
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
    expect(
      isSelectedAddressPlacesCanonical({
        address_short: 'Av. X 1',
        commune: 'Santiago',
        lat: -33.4,
        lng: -70.6,
        source: 'google',
        number: ''
      })
    ).toBe(false);
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
    expect(r.comuna).toBe('Santiago');
    expect(r.source).toBe('manual');
    expect(r.address_full).toBe('Calle Falsa 123, Santiago, Chile');
    expect(r.lat).toBe(-33);
    expect(r.lng).toBe(-70);
  });

  it('con source google usa calle+número canónicos aunque location muestre comuna', () => {
    const r = buildSelectedAddressFromForm({
      location: 'Av. Apoquindo 1234, Las Condes',
      comuna: 'Las Condes',
      lat: -33.4,
      lng: -70.6,
      street: 'Av. Apoquindo',
      number: '1234',
      source: 'google'
    });
    expect(r.address_short).toBe('Av. Apoquindo 1234');
    expect(r.address_full).toBe('Av. Apoquindo 1234, Las Condes, Chile');
  });
});

describe('patchStoredSelectedAddressCommune', () => {
  const original = globalThis.localStorage;

  afterEach(() => {
    if (original === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = original;
    }
  });

  it('actualiza commune y address_full sin borrar lat/lng', () => {
    const store = {};
    globalThis.localStorage = {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
      removeItem: (k) => {
        delete store[k];
      }
    };
    localStorage.setItem(
      SELECTED_ADDRESS_KEY,
      JSON.stringify({
        address_short: 'Av. Test 100',
        commune: 'Providencia',
        address_full: 'x',
        lat: -33,
        lng: -70
      })
    );
    patchStoredSelectedAddressCommune('Las Condes');
    const o = JSON.parse(localStorage.getItem(SELECTED_ADDRESS_KEY));
    expect(o.commune).toBe('Las Condes');
    expect(o.comuna).toBe('Las Condes');
    expect(o.address_full).toBe('Av. Test 100, Las Condes, Chile');
    expect(o.lat).toBe(-33);
    expect(o.lng).toBe(-70);
  });
});
