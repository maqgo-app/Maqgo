import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import StepProgressSegments from './StepProgressSegments';

/**
 * Indicador de progreso del flujo de reserva cliente
 * Misma línea segmentada que onboarding proveedor (`StepProgressSegments`).
 * Dinámico según el tipo de maquinaria y reserva (Horas vs Viaje).
 */

/** Sublabel claro cuando horas y ubicación comparten pantalla (inmediato + hora). */
function getBookingSublabel(path, currentStepLabel) {
  if (path === '/client/service-location') {
    const rt = localStorage.getItem('reservationType') || 'immediate';
    const pt = localStorage.getItem('priceType') || 'hour';
    if (rt === 'immediate' && pt === 'hour') {
      return 'Horas y ubicación';
    }
  }
  return currentStepLabel || '';
}

function BookingProgress({ compact = false }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const path = pathname.replace(/\/$/, '') || '/';

  // Determinar qué pasos están activos según el tipo de reserva actual
  const priceType = localStorage.getItem('priceType') || 'hour';
  const showUrgency = priceType === 'trip';

  const activeSteps = [
    { 
      label: 'Maquinaria', 
      paths: ['/client/machinery', '/client/calendar', '/client/calendar-multi'],
      defaultPath: '/client/machinery'
    },
    ...(showUrgency ? [{ 
      label: 'Horas / Urgencia', 
      paths: ['/client/hours', '/client/hours-selection', '/client/urgency', '/client/reservation-data'],
      defaultPath: '/client/urgency'
    }] : []),
    { 
      label: 'Ubicación', 
      paths: ['/client/service-location'],
      defaultPath: '/client/service-location'
    },
    { 
      label: 'Proveedores', 
      paths: ['/client/providers', '/client/searching', '/client/waiting-confirmation'],
      defaultPath: '/client/providers'
    },
    { 
      label: 'Confirmar', 
      paths: ['/client/confirm', '/client/workday-confirmation'],
      defaultPath: '/client/confirm'
    },
    { 
      label: 'Pago', 
      paths: ['/client/billing', '/client/card', '/client/card-input'],
      defaultPath: '/client/card'
    },
  ];

  const currentStepIndex = activeSteps.findIndex(s => s.paths.includes(path));
  const currentStep = currentStepIndex + 1;

  if (currentStep === 0) return null;

  const totalSteps = activeSteps.length;

  const persisted = localStorage.getItem('bookingProgress');
  let persistedStepNumber = 0;
  if (persisted) {
    try {
      const parsed = JSON.parse(persisted);
      const ageMs = Date.now() - Number(parsed?.timestamp || 0);
      const within24h = ageMs >= 0 && ageMs < 24 * 60 * 60 * 1000;
      if (within24h) persistedStepNumber = Number(parsed?.stepNumber || 0);
    } catch {
      // Ignore malformed storage.
    }
  }

  const maxVisitedStep = Math.max(currentStep, persistedStepNumber);
  const reservationType = localStorage.getItem('reservationType') || 'immediate';

  const sublabel = getBookingSublabel(path, activeSteps[currentStepIndex]?.label);
  const labels = activeSteps.map((s) => s.label);

  const stepClickable = (stepNum) => {
    const isPast = stepNum < currentStep;
    const isActive = stepNum === currentStep;
    // Solo permitir volver atrás a pasos ya visitados
    return isPast && !isActive;
  };

  const onStepClick = (stepNum) => {
    const stepObj = activeSteps[stepNum - 1];
    if (stepObj) {
      navigate(stepObj.defaultPath);
    }
  };

  const ariaLabel = sublabel
    ? `Reserva: paso ${currentStep} de ${totalSteps}, ${sublabel}`
    : `Reserva: paso ${currentStep} de ${totalSteps}`;

  return (
    <StepProgressSegments
      totalSteps={totalSteps}
      currentStep={currentStep}
      labels={labels}
      sublabel={sublabel}
      compact={compact}
      stepClickable={stepClickable}
      onStepClick={onStepClick}
      ariaLabel={ariaLabel}
    />
  );
}

export default BookingProgress;
