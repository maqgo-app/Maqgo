import { describe, it, expect } from 'vitest';
import { isEmpresaBillingComplete } from './clientBillingInvoice';

describe('isEmpresaBillingComplete', () => {
  it('rechaza sin billingType empresa', () => {
    expect(isEmpresaBillingComplete({ razonSocial: 'X', rut: '12345678-5', giro: 'G', direccion: 'D' })).toBe(false);
  });

  it('acepta empresa con todos los campos', () => {
    expect(
      isEmpresaBillingComplete({
        billingType: 'empresa',
        razonSocial: 'Spa Test',
        rut: '12345678-5',
        giro: 'Arriendo',
        direccion: 'Av. Siempre Viva 123, Santiago',
      })
    ).toBe(true);
  });

  it('rechaza giro o dirección vacíos', () => {
    expect(
      isEmpresaBillingComplete({
        billingType: 'empresa',
        razonSocial: 'Spa Test',
        rut: '12345678-5',
        giro: '',
        direccion: 'Calle 1',
      })
    ).toBe(false);
  });
});
