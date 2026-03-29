import { describe, expect, it } from 'vitest';
import { deriveBookingPaymentReadModel } from './bookingPaymentReadModel';

describe('deriveBookingPaymentReadModel', () => {
  it('solo recibe CheckoutState (read model sin routing)', () => {
    expect(deriveBookingPaymentReadModel.length).toBe(1);
  });

  it('IDLE → NOT_STARTED', () => {
    expect(deriveBookingPaymentReadModel('IDLE')).toEqual({
      phase: 'NOT_STARTED',
      label: 'idle',
    });
  });

  it('fases pre-cobro agrupadas', () => {
    expect(deriveBookingPaymentReadModel('SERVICE_CONFIRMED').phase).toBe('PRE_CHARGE');
    expect(deriveBookingPaymentReadModel('CARD_CAPTURED').phase).toBe('PRE_CHARGE');
    expect(deriveBookingPaymentReadModel('PENDING_PROVIDER_ACCEPTANCE').phase).toBe('PRE_CHARGE');
  });

  it('PAYMENT_AUTHORIZED → AUTHORIZATION', () => {
    expect(deriveBookingPaymentReadModel('PAYMENT_AUTHORIZED').phase).toBe('AUTHORIZATION');
  });

  it('estados terminales', () => {
    expect(deriveBookingPaymentReadModel('PAYMENT_CHARGED').phase).toBe('COMPLETED');
    expect(deriveBookingPaymentReadModel('PAYMENT_FAILED').phase).toBe('FAILED');
    expect(deriveBookingPaymentReadModel('UNKNOWN').phase).toBe('AMBIGUOUS');
  });
});
