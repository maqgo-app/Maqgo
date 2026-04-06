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
      <div className="maqgo-app maqgo-client-funnel" style={{ background: 'var(--maqgo-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
        
    );
  }

  // Skeleton que imita la tarjeta de precio (evita flash desglose→vacío→P5)
  const isConfirm = path === '/client/confirm';
  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div className="maqgo-screen maqgo-screen--scroll" style={{ padding: 'var(--maqgo-screen-padding-top) 20px 120px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 12 }}>
          <div style={{ width: 24, height: 24 }} />
          <div style={{ flex: 1 }}><MaqgoLogo size="small" /></div>
          
        <BookingProgress />
        <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 16 }}>
          Confirma tu reserva
        </h1>
        {isConfirm && (
          <div style={{ background: '#2A2A2A', borderRadius: 12, padding: 16, marginBottom: 14 }}>
            <div style={{ height: 12, background: 'rgba(255,255,255,0.2)', borderRadius: 4, marginBottom: 12, width: '40%' }} />
            <div style={{ height: 28, background: 'rgba(255,255,255,0.15)', borderRadius: 4, marginBottom: 16, width: '60%' }} />
            <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
              
          </div>
        )}
        {!isConfirm && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 120, padding: 24 }}>
            
        )}
      </div>
    </div>
  );
}

export default BookingFlowFallback;
