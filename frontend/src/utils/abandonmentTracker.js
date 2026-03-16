/**
 * Sistema de tracking de abandono de reserva
 * Detecta cuando el usuario abandona el flujo de reserva y programa recordatorios
 */

import BACKEND_URL from './api';

// Pasos del flujo de reserva del cliente
const BOOKING_STEPS = {
  machinery: 1,
  hours: 2,
  location: 3,
  providers: 4,
  confirm: 5,
  payment: 6,
  calendar: 1  // Paso 1 en flujo programado
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

import { getObject } from './safeStorage';

// Detectar si hay una reserva abandonada
export const checkAbandonedBooking = () => {
  const data = getObject('bookingProgress', null);
  if (!data || typeof data !== 'object') return null;

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

// Hook para detectar cuando el usuario va a salir de la página
export const setupAbandonmentDetection = () => {
  // Detectar cierre de pestaña/navegador
  window.addEventListener('beforeunload', (e) => {
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
  setupAbandonmentDetection
};
