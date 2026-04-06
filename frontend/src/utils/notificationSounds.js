/**
 * MAQGO - Sistema de Sonidos de Notificación
 * 
 * Sonidos generados con Web Audio API (sin archivos externos)
 * para eventos críticos de la aplicación.
 */

// Contexto de audio (singleton)
let audioContext = null;

const getAudioContext = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
};

// Desbloquear audio en iOS/Safari (requiere interacción del usuario). Devuelve Promise para poder esperar antes de reproducir.
export const unlockAudio = () => {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    return ctx.resume();
  }
  return Promise.resolve();
};

/**
 * Reproducir tono simple
 */
const playTone = (frequency, duration, type = 'sine', volume = 0.3) => {
  try {
    const ctx = getAudioContext();
    
    // Crear oscilador
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    
    // Envelope suave
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch {
    if (import.meta.env.DEV) {
      console.warn('Audio not available');
    }
  }
};

/**
 * Reproducir secuencia de tonos
 */
const playSequence = (notes, tempo = 150) => {
  const ctx = getAudioContext();
  let time = ctx.currentTime;
  
  notes.forEach(({ freq, dur, type = 'sine', vol = 0.3 }) => {
    try {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(freq, time);
      
      const duration = dur * (60 / tempo);
      
      gainNode.gain.setValueAtTime(0, time);
      gainNode.gain.linearRampToValueAtTime(vol, time + 0.01);
      gainNode.gain.linearRampToValueAtTime(0, time + duration - 0.01);
      
      oscillator.start(time);
      oscillator.stop(time + duration);
      
      time += duration;
    } catch {
      // Silenciar errores
    }
  });
};

// ============ SONIDOS DE NOTIFICACIÓN ============

/**
 * 🔔 Nueva solicitud entrante (para proveedor/operador)
 * Sonido rico y llamativo - campanadas ascendentes con armónicos
 */
export const playNewRequestSound = () => {
  try {
    const ctx = getAudioContext();
    let time = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    const vol = 0.65;
    
    notes.forEach((freq, i) => {
      const isLast = i === notes.length - 1;
      const duration = isLast ? 0.35 : 0.12;
      const gap = i < 2 ? 0.08 : 0.12;
      
      // Tono principal + armónicos (quinta + octava)
      [freq, freq * 1.5, freq * 2].forEach((f, j) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, time);
        const v = vol * (j === 0 ? 1 : j === 1 ? 0.35 : 0.2);
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(v, time + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
        osc.start(time);
        osc.stop(time + duration);
      });
      
      time += duration + gap;
    });
  } catch {
    // Fallback simple
    playSequence([
      { freq: 523, dur: 0.15, type: 'triangle', vol: 0.6 },
      { freq: 659, dur: 0.15, type: 'triangle', vol: 0.6 },
      { freq: 1047, dur: 0.4, type: 'triangle', vol: 0.7 },
    ], 180);
  }
};

/**
 * ✅ Solicitud aceptada (para cliente)
 * Sonido positivo y satisfactorio
 */
export const playAcceptedSound = () => {
  playSequence([
    { freq: 440, dur: 0.1, type: 'sine', vol: 0.3 },    // A4
    { freq: 554, dur: 0.1, type: 'sine', vol: 0.3 },    // C#5
    { freq: 659, dur: 0.2, type: 'sine', vol: 0.4 },    // E5
  ], 250);
};

/**
 * 📍 Operador llegando (2 min away)
 * Sonido de alerta suave pero notable
 */
export const playArrivingSound = () => {
  playSequence([
    { freq: 880, dur: 0.1, type: 'sine', vol: 0.3 },    // A5
    { freq: 880, dur: 0.1, type: 'sine', vol: 0.0 },    // pausa
    { freq: 880, dur: 0.1, type: 'sine', vol: 0.3 },    // A5
    { freq: 1047, dur: 0.2, type: 'sine', vol: 0.4 },   // C6
  ], 300);
};

/**
 * 🚜 Operador llegó
 * Sonido triunfante
 */
export const playArrivedSound = () => {
  playSequence([
    { freq: 523, dur: 0.15, type: 'triangle', vol: 0.4 },  // C5
    { freq: 659, dur: 0.15, type: 'triangle', vol: 0.4 },  // E5
    { freq: 784, dur: 0.15, type: 'triangle', vol: 0.4 },  // G5
    { freq: 1047, dur: 0.4, type: 'triangle', vol: 0.5 },  // C6
  ], 200);
};

/**
 * ⚙️ Servicio iniciado
 * Tono de confirmación simple
 */
export const playServiceStartedSound = () => {
  playTone(660, 0.15, 'sine', 0.3);
  setTimeout(() => playTone(880, 0.2, 'sine', 0.35), 150);
};

/**
 * 🏁 Servicio completado
 * Sonido de celebración
 */
export const playServiceCompletedSound = () => {
  playSequence([
    { freq: 523, dur: 0.1, type: 'sine', vol: 0.3 },    // C5
    { freq: 659, dur: 0.1, type: 'sine', vol: 0.3 },    // E5
    { freq: 784, dur: 0.1, type: 'sine', vol: 0.35 },   // G5
    { freq: 1047, dur: 0.1, type: 'sine', vol: 0.4 },   // C6
    { freq: 1319, dur: 0.3, type: 'sine', vol: 0.45 },  // E6
  ], 280);
};

/**
 * 💳 Pago aprobado
 * Sonido de "ka-ching" satisfactorio
 */
export const playPaymentSuccessSound = () => {
  playSequence([
    { freq: 1319, dur: 0.08, type: 'sine', vol: 0.4 },  // E6
    { freq: 1568, dur: 0.15, type: 'sine', vol: 0.45 }, // G6
  ], 400);
};

/**
 * ❌ Error o cancelación
 * Tono descendente de error
 */
export const playErrorSound = () => {
  playSequence([
    { freq: 440, dur: 0.15, type: 'sawtooth', vol: 0.2 },  // A4
    { freq: 349, dur: 0.25, type: 'sawtooth', vol: 0.15 }, // F4
  ], 200);
};

/**
 * 💬 Mensaje/notificación genérica
 * Tono suave de "pop"
 */
export const playNotificationSound = () => {
  playTone(880, 0.1, 'sine', 0.25);
};

/**
 * ⏰ Timer/countdown warning
 * Tono de advertencia
 */
export const playTimerWarningSound = () => {
  playTone(440, 0.08, 'square', 0.15);
  setTimeout(() => playTone(440, 0.08, 'square', 0.15), 150);
};

/**
 * 🎯 Click/tap feedback
 * Sonido muy sutil para confirmación táctil
 */
export const playTapSound = () => {
  playTone(1200, 0.03, 'sine', 0.1);
};

/** Mensaje nuevo en chat servicio (tono corto y distintivo) */
export const playChatIncomingSound = () => {
  playSequence(
    [
      { freq: 784, dur: 0.07, type: 'sine', vol: 0.22 },
      { freq: 1175, dur: 0.09, type: 'sine', vol: 0.24 },
    ],
    220
  );
};

// ============ HELPERS ============

/**
 * Verificar si el audio está disponible
 */
export const isAudioAvailable = () => {
  return typeof window !== 'undefined' && 
         (window.AudioContext || window.webkitAudioContext);
};

/**
 * Objeto con todos los sonidos para fácil acceso
 */
export const sounds = {
  newRequest: playNewRequestSound,
  accepted: playAcceptedSound,
  arriving: playArrivingSound,
  arrived: playArrivedSound,
  serviceStarted: playServiceStartedSound,
  serviceCompleted: playServiceCompletedSound,
  paymentSuccess: playPaymentSuccessSound,
  error: playErrorSound,
  notification: playNotificationSound,
  timerWarning: playTimerWarningSound,
  tap: playTapSound,
  chatIncoming: playChatIncomingSound,
};

export default sounds;
