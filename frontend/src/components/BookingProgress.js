import React from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Indicador de progreso del flujo de reserva cliente
 * Maquinaria (1) → Horas/Urgencia (2) → Ubicación (3) → Proveedores (4) → Confirmar (5) → Pago (6)
 * Rutas sin barra final para evitar paso 0.
 */
const ROUTE_TO_STEP = {
  '/client/machinery': 1,
  '/client/calendar': 1,
  '/client/calendar-multi': 1,
  '/client/hours': 2,
  '/client/hours-selection': 2,
  '/client/urgency': 2,
  '/client/reservation-data': 2,
  '/client/service-location': 3,
  '/client/providers': 4,
  '/client/searching': 4,
  '/client/waiting-confirmation': 4,
  '/client/confirm': 5,
  '/client/workday-confirmation': 5,
  '/client/billing': 6,
  '/client/card': 6,
  '/client/card-input': 6,
};

const STEPS = [
  { label: 'Maquinaria' },
  { label: 'Horas / Urgencia' },
  { label: 'Ubicación' },
  { label: 'Proveedores' },
  { label: 'Confirmar' },
  { label: 'Pago' },
];

const CheckIcon = ({ size = 10 }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 6l3 3 5-6" />
  </svg>
);

function BookingProgress() {
  const location = useLocation();
  const path = location.pathname.replace(/\/$/, '') || '/';
  const currentStep = ROUTE_TO_STEP[path] || 0;

  if (currentStep === 0) return null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      marginBottom: 20,
      padding: '0 8px'
    }}>
      <p style={{
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        fontWeight: 500,
        margin: 0,
        fontFamily: "'Inter', sans-serif"
      }} aria-live="polite">
        Paso {currentStep} de {STEPS.length}
      </p>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8
      }}>
      {STEPS.map((step, index) => {
        const stepNum = index + 1;
        const isActive = stepNum === currentStep;
        const isPast = stepNum < currentStep;
        return (
          <div
            key={step.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              flex: index < STEPS.length - 1 ? 0 : undefined
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                background: isPast ? '#EC6819' : isActive ? '#EC6819' : 'rgba(255,255,255,0.12)',
                color: isPast ? '#fff' : isActive ? '#fff' : 'transparent',
                transition: 'all 0.2s ease',
                flexShrink: 0,
                boxShadow: isActive ? '0 0 0 2px rgba(236,104,25,0.4)' : 'none'
              }}
              title={step.label}
            >
              {isPast ? (
                <CheckIcon size={10} />
              ) : isActive ? (
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
              ) : (
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.4)' }} />
              )}
            </div>
            {index < STEPS.length - 1 && (
              <div
                style={{
                  width: 20,
                  height: 2,
                  background: isPast ? '#EC6819' : 'rgba(255,255,255,0.15)',
                  margin: '0 2px'
                }}
              />
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}

export default BookingProgress;
