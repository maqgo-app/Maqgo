import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import StepProgressSegments from './StepProgressSegments';

/**
 * Indicador de progreso del flujo de reserva cliente
 * Misma línea segmentada que onboarding proveedor (`StepProgressSegments`).
 * Maquinaria (1) → Horas/Urgencia (2) → Ubicación (3) → Proveedores (4) → Confirmar (5) → Pago (6)
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

function resolveBookingStep(path) {
  return ROUTE_TO_STEP[path] || 0;
}

/** Sublabel claro cuando horas y ubicación comparten pantalla (inmediato + hora). */
function getBookingSublabel(path, currentStep) {
  if (path === '/client/service-location') {
    const rt = localStorage.getItem('reservationType') || 'immediate';
    const pt = localStorage.getItem('priceType') || 'hour';
    if (rt === 'immediate' && pt === 'hour') {
      return 'Horas y ubicación';
    }
  }
  return STEPS[currentStep - 1]?.label || '';
}

function BookingProgress({ compact = false }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const path = pathname.replace(/\/$/, '') || '/';
  const currentStep = (() => {
  const pathMap = {
    "/client/machinery": 1,
    "/client/service-location": 2,
    "/client/urgency": 2,
    "/client/calendar": 3,
    "/client/providers": 4,
    "/client/confirm": 5,
    "/client/card": 6
  };
  return pathMap[path] || 1;
})();

  if (currentStep === 0) return null;

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

  const priceType = localStorage.getItem('priceType') || 'hour';
  const selectedDatesRaw = localStorage.getItem('selectedDates');
  let selectedDates = [];
  try {
    selectedDates = selectedDatesRaw ? JSON.parse(selectedDatesRaw) : [];
  } catch {
    selectedDates = [];
  }
  const hasCalendarMulti = Array.isArray(selectedDates) && selectedDates.length > 0;

  const step1Route = reservationType === 'scheduled'
    ? (hasCalendarMulti ? '/client/calendar-multi' : '/client/calendar')
    : '/client/machinery';

  const step2Route = priceType === 'trip' ? '/client/urgency' : '/client/service-location';

  const stepToPath = {
    1: step1Route,
    2: step2Route,
    3: '/client/service-location',
    4: '/client/providers',
    5: '/client/confirm',
    6: '/client/card',
  };

  const sublabel = getBookingSublabel(path, currentStep);
  const labels = STEPS.map((s) => s.label);

  const stepClickable = (stepNum) => {
    const isReachable = stepNum <= maxVisitedStep;
    const isPast = stepNum < currentStep;
    const isActive = stepNum === currentStep;
    return (
      isReachable &&
      !isActive &&
      isPast &&
      !(reservationType === 'scheduled' && stepNum === 2)
    );
  };

  const onStepClick = (stepNum) => {
    const goTo = stepToPath[stepNum] || '/client/machinery';
    navigate(goTo);
  };

  const ariaLabel = sublabel
    ? `Reserva: paso ${currentStep} de ${STEPS.length}, ${sublabel}`
    : `Reserva: paso ${currentStep} de ${STEPS.length}`;

  return (
    <StepProgressSegments
      totalSteps={STEPS.length}
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
