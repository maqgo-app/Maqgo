import { useEffect, useMemo } from 'react';
import { useCheckoutState } from '../context/CheckoutContext';
import {
  deriveBookingPaymentReadModel,
  touchDerivedBookingPaymentPhaseForExhaustiveUi,
  type DerivedBookingPaymentPhase,
} from '../domain/booking/bookingPaymentReadModel';

/**
 * Read model de UI: una sola derivación → phase estable (sin alternar checkout crudo vs snapshot).
 */
function renderDerivedPaymentPhaseUi(phase: DerivedBookingPaymentPhase): null {
  switch (phase) {
    case 'NOT_STARTED':
    case 'PRE_CHARGE':
    case 'AUTHORIZATION':
    case 'COMPLETED':
    case 'FAILED':
    case 'AMBIGUOUS':
      return null;
    default: {
      const _exhaustive: never = phase;
      void _exhaustive;
      return null;
    }
  }
}

export default function BookingPaymentRouteStateBinding() {
  const { state: checkoutState } = useCheckoutState();

  const phase = useMemo(
    () => deriveBookingPaymentReadModel(checkoutState).phase,
    [checkoutState]
  );

  useEffect(() => {
    touchDerivedBookingPaymentPhaseForExhaustiveUi(phase);
  }, [phase]);

  return renderDerivedPaymentPhaseUi(phase);
}
