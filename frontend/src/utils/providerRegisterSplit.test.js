import { describe, it, expect } from 'vitest';
import { splitNombreCompletoProveedor } from './providerRegisterSplit';

describe('splitNombreCompletoProveedor', () => {
  it('divide en nombre y apellido (resto)', () => {
    expect(splitNombreCompletoProveedor('  Juan   Pérez  Gómez ')).toEqual({
      nombre: 'Juan',
      apellido: 'Pérez Gómez'
    });
  });

  it('una sola palabra: apellido vacío', () => {
    expect(splitNombreCompletoProveedor('Juan')).toEqual({ nombre: 'Juan', apellido: '' });
  });

  it('vacío', () => {
    expect(splitNombreCompletoProveedor('   ')).toEqual({ nombre: '', apellido: '' });
  });
});
