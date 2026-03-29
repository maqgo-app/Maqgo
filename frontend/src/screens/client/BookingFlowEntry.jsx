import { useLayoutEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { resetBookingState } from '../../utils/bookingFlow';

/**
 * Punto de entrada /client/booking: estado de reserva limpio antes de mostrar el home cliente.
 */
export default function BookingFlowEntry() {
  useLayoutEffect(() => {
    resetBookingState();
  }, []);
  return <Navigate to="/client/home" replace />;
}
