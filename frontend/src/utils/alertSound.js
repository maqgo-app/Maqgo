/**
 * Sistema de alertas de sonido para MAQGO
 * 
 * Tipos de alerta:
 * - notification: Sonido suave para notificaciones generales
 * - arrival: Sonido distintivo para llegada del operador
 * - urgent: Sonido de alerta para solicitudes urgentes
 */

// Crear contexto de audio una sola vez
let audioContext = null;

const getAudioContext = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
};

// Generar tonos de alerta usando Web Audio API
const playTone = (frequency, duration, type = 'sine', volume = 0.3) => {
  try {
    const ctx = getAudioContext();
    
    // Resumir contexto si está suspendido (necesario en móviles)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = type;
    
    // Fade in/out suave
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.05);
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch (e) {
    console.log('Audio not supported:', e);
  }
};

// Alerta para nueva solicitud (proveedor)
export const playNewRequestAlert = () => {
  // Secuencia de 3 tonos ascendentes
  playTone(440, 0.15, 'sine', 0.4); // A4
  setTimeout(() => playTone(554, 0.15, 'sine', 0.4), 150); // C#5
  setTimeout(() => playTone(659, 0.2, 'sine', 0.4), 300); // E5
};

// Alerta para llegada del operador (cliente) - con vibración
export const playArrivalAlert = () => {
  // Dos tonos amigables
  playTone(523, 0.2, 'sine', 0.35); // C5
  setTimeout(() => playTone(659, 0.3, 'sine', 0.35), 200); // E5
  vibrate([200, 100, 200, 100, 300]);
};

// Alerta para operador en camino (cliente) - con vibración
export const playEnRouteAlert = () => {
  // Un tono suave
  playTone(440, 0.25, 'sine', 0.3); // A4
  vibrate([150, 50, 150]);
};

// Alerta de éxito/confirmación
export const playSuccessAlert = () => {
  playTone(523, 0.1, 'sine', 0.3); // C5
  setTimeout(() => playTone(659, 0.1, 'sine', 0.3), 100); // E5
  setTimeout(() => playTone(784, 0.15, 'sine', 0.3), 200); // G5
};

// Alerta para operador cerca (estilo Uber) - más intensa
export const playNearbyAlert = () => {
  // Secuencia de 2 tonos repetidos (ding-ding)
  const playDing = (delay) => {
    setTimeout(() => {
      playTone(880, 0.15, 'sine', 0.5); // A5
      setTimeout(() => playTone(1047, 0.2, 'sine', 0.5), 150); // C6
    }, delay);
  };
  
  playDing(0);
  playDing(400);
};

// Vibración del dispositivo
export const vibrate = (pattern = [200, 100, 200]) => {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch (e) {
    console.log('Vibration not supported:', e);
  }
};

// Alerta completa (sonido + vibración) para operador cerca
export const alertOperatorNearby = () => {
  playNearbyAlert();
  vibrate([200, 100, 200, 100, 200]);
};

// Alerta para operador: Cliente aceptó ingreso a obra
export const playAccessGrantedAlert = () => {
  // Sonido de éxito más largo y distintivo
  playTone(523, 0.15, 'sine', 0.4); // C5
  setTimeout(() => playTone(659, 0.15, 'sine', 0.4), 150); // E5
  setTimeout(() => playTone(784, 0.15, 'sine', 0.4), 300); // G5
  setTimeout(() => playTone(1047, 0.25, 'sine', 0.4), 450); // C6
  vibrate([300, 150, 300, 150, 500]);
};

export default {
  playNewRequestAlert,
  playArrivalAlert,
  playEnRouteAlert,
  playSuccessAlert,
  playNearbyAlert,
  vibrate,
  alertOperatorNearby,
  playAccessGrantedAlert
};
