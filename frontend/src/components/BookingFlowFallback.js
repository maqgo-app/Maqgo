import React from 'react';
import { useLocation } from 'react-router-dom';
import BookingProgress from './BookingProgress';
import MaqgoLogo from './MaqgoLogo';

/**
 * Fallback de Suspense para pasos 5 y 6 del flujo de reserva.
 * Mantiene el mismo layout (header, BookingProgress) para evitar flash al cargar chunks.
 */
function BookingFlowFallback() {
  const { pathname } = useLocation();
  const path = (pathname || '').replace(/\/$/, '') || '/';
  const isBookingStep = ['/client/confirm', '/client/billing', '/client/card', '/client/card-input', '/client/workday-confirmation'].includes(path);

  if (!isBookingStep) {
    return (
      <div className="maqgo-app" style={{ minHeight: '100vh', background: 'var(--maqgo-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
        <span style={{ width: 32, height: 32, border: '3px solid rgba(236,104,25,0.3)', borderTopColor: 'var(--maqgo-orange)', borderRadius: '50%', animation: 'maqgo-spin 0.8s linear infinite' }} />
      </div>
    );
  }

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 20px 120px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 12 }}>
          <div style={{ width: 24, height: 24 }} />
          <div style={{ flex: 1 }}><MaqgoLogo size="small" /></div>
          <div style={{ width: 24 }} />
        </div>
        <BookingProgress />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 120, padding: 24 }}>
          <span style={{ width: 28, height: 28, border: '2px solid rgba(236,104,25,0.3)', borderTopColor: 'var(--maqgo-orange)', borderRadius: '50%', animation: 'maqgo-spin 0.8s linear infinite' }} />
        </div>
      </div>
    </div>
  );
}

export default BookingFlowFallback;
