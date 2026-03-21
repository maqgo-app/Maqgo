/**
 * Sistema de tracking de abandono de reserva
 * Detecta cuando el usuario abandona el flujo de reserva y programa recordatorios
 */

import BACKEND_URL from './api';
import { getObject } from './safeStorage';

// Pasos del flujo de reserva del cliente
const BOOKING_STEPS = {
  machinery: 1,
  hours: 2,
  urgency: 2,
  location: 3,
  providers: 4,
  confirm: 5,
  payment: 6,
  calendar: 1  // Paso 1 en flujo programado
};

const RESUMABLE_STEPS = new Set(Object.keys(BOOKING_STEPS));

const isValidReservationType = (value) => value === 'immediate' || value === 'scheduled';

const validateProgressShape = (data) => {
  if (!data || typeof data !== 'object') return { ok: false, reason: 'missing-data' };
  if (!data.step || !RESUMABLE_STEPS.has(data.step)) return { ok: false, reason: 'invalid-step' };
  if (typeof data.timestamp !== 'number') return { ok: false, reason: 'invalid-timestamp' };

  const expectedStepNumber = BOOKING_STEPS[data.step] || 0;
  const currentStepNumber = Number(data.stepNumber || 0);
  if (currentStepNumber !== expectedStepNumber) return { ok: false, reason: 'invalid-step-number' };

  const reservationType = data?.data?.reservationType || localStorage.getItem('reservationType');
  if (!isValidReservationType(reservationType)) return { ok: false, reason: 'invalid-reservation-type' };

  return { ok: true, reason: 'ok' };
};

// Guardar progreso de reserva
export const saveBookingProgress = (step, data = {}) => {
  const progress = {
    step,
    stepNumber: BOOKING_STEPS[step] || 0,
    timestamp: Date.now(),
    data: {
      ...data,
      machinery: localStorage.getItem('selectedMachinery'),
      hours: localStorage.getItem('selectedHours'),
      location: localStorage.getItem('serviceLocation'),
      reservationType: localStorage.getItem('reservationType')
    }
  };
  
  localStorage.setItem('bookingProgress', JSON.stringify(progress));
  localStorage.setItem('clientBookingStep', step);
  
  // Registrar en backend para tracking
  trackAbandonmentRisk(progress);
};

// Limpiar progreso (reserva completada o cancelada intencionalmente)
export const clearBookingProgress = () => {
  localStorage.removeItem('bookingProgress');
  localStorage.removeItem('clientBookingStep');
  
  // Notificar al backend que se completó
  const userId = localStorage.getItem('userId');
  if (userId) {
    fetch(`${BACKEND_URL}/api/abandonment/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId })
    }).catch(() => {});
  }
};

// Registrar riesgo de abandono en backend
const trackAbandonmentRisk = async (progress) => {
  try {
    const userId = localStorage.getItem('userId');
    const userPhone = localStorage.getItem('userPhone');
    const userEmail = localStorage.getItem('userEmail');
    const userName = localStorage.getItem('userName');
    
    if (!userId) return;
    
    await fetch(`${BACKEND_URL}/api/abandonment/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        user_name: userName,
        user_phone: userPhone,
        user_email: userEmail,
        step: progress.step,
        step_number: progress.stepNumber,
        machinery: progress.data.machinery,
        location: progress.data.location,
        timestamp: progress.timestamp
      })
    });
  } catch (error) {
    console.error('Error tracking abandonment:', error);
  }
};

// Detectar si hay una reserva abandonada
export const checkAbandonedBooking = () => {
  const userRole = localStorage.getItem('userRole');
  // Solo aplica a flujo cliente; si venimos de otro rol, limpiar estado residual.
  if (userRole && userRole !== 'client') {
    clearBookingProgress();
    return null;
  }

  const data = getObject('bookingProgress', null);
  if (!data || typeof data !== 'object') return null;

  // Evitar falsos positivos: validar estructura completa.
  const shape = validateProgressShape(data);
  if (!shape.ok) {
    clearBookingProgress();
    return null;
  }

  const timeSinceAbandonment = Date.now() - data.timestamp;

  // Solo mostrar si pasaron más de 5 minutos pero menos de 24 horas
  if (timeSinceAbandonment > 5 * 60 * 1000 && timeSinceAbandonment < 24 * 60 * 60 * 1000) {
    return data;
  }

  // Si pasaron más de 24 horas, limpiar
  if (timeSinceAbandonment > 24 * 60 * 60 * 1000) {
    clearBookingProgress();
  }

  return null;
};

// Regla centralizada: solo mostrar "Continuar reserva" si el progreso es valido y reciente.
export const shouldShowResumeBooking = () => {
  const progress = checkAbandonedBooking();
  if (!progress) return { show: false, reason: 'no-valid-progress', progress: null };
  return { show: true, reason: 'valid-progress', progress };
};

// Hook para detectar cuando el usuario va a salir de la página
export const setupAbandonmentDetection = () => {
  // Detectar cierre de pestaña/navegador
  window.addEventListener('beforeunload', () => {
    const progress = localStorage.getItem('bookingProgress');
    if (progress) {
      // El navegador puede mostrar un mensaje de confirmación
      // y el backend ya tiene el tracking
    }
  });
  
  // Detectar cuando la app pierde el foco (usuario cambia de tab)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      const data = getObject('bookingProgress', null);
      if (data && typeof data === 'object') {
        data.lastSeen = Date.now();
        localStorage.setItem('bookingProgress', JSON.stringify(data));
      }
    }
  });
};

export default {
  saveBookingProgress,
  clearBookingProgress,
  checkAbandonedBooking,
  shouldShowResumeBooking,
  setupAbandonmentDetection
};
