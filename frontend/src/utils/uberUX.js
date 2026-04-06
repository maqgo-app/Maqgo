/**
 * MAQGO - Utilidades UX tipo Uber
 * 
 * - Vibración para eventos críticos
 * - Alertas de sonido
 * - Geofencing (detección de llegada)
 * - Formateo de ETA
 */

// Patrones de vibración para diferentes eventos
export const VIBRATION_PATTERNS = {
  newRequest: [200, 100, 200, 100, 400],  // Nueva solicitud entrante
  accepted: [100, 50, 100],               // Solicitud aceptada
  arriving: [300, 100, 300],              // Operador llegando
  arrived: [500, 200, 500, 200, 500],     // Operador llegó
  started: [200, 100, 200],               // Servicio iniciado
  finished: [100, 50, 100, 50, 300],      // Servicio finalizado
  cancelled: [400, 200, 400],             // Cancelación
  alert: [100, 50, 100, 50, 100],         // Alerta general
  tap: [50]                               // Feedback táctil
};

// Vibrar dispositivo - acepta string (clave) o array (patrón directo)
export const vibrate = (pattern) => {
  if ('vibrate' in navigator) {
    const vibrationPattern = Array.isArray(pattern)
      ? pattern
      : (VIBRATION_PATTERNS[pattern] || VIBRATION_PATTERNS.tap);
    navigator.vibrate(vibrationPattern);
  }
};

// Reproducir sonido de alerta
export const playAlert = (type = 'notification') => {
  try {
    const audio = new Audio(`/${type}.wav`);
    audio.volume = 1.0;
    audio.play().catch(() => {
      // Silenciar si no hay interacción del usuario
    });
  } catch {
    if (import.meta.env.DEV) {
      console.warn('Audio not available');
    }
  }
};

// Calcular distancia entre dos puntos (Haversine)
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distancia en km
};

// Verificar si está dentro de radio (geofencing)
export const isWithinRadius = (currentLat, currentLon, targetLat, targetLon, radiusMeters = 150) => {
  const distance = calculateDistance(currentLat, currentLon, targetLat, targetLon);
  return distance * 1000 <= radiusMeters; // Convertir km a metros
};

// Formatear ETA de forma amigable
export const formatETA = (minutes) => {
  if (minutes <= 1) return 'Llegando';
  if (minutes <= 2) return '2 min';
  if (minutes <= 5) return `${Math.round(minutes)} min`;
  if (minutes <= 10) return `${Math.round(minutes)} min`;
  if (minutes <= 30) return `${Math.round(minutes)} min`;
  if (minutes <= 60) return `${Math.round(minutes)} min`;
  
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
};

// Obtener mensaje de proximidad
export const getProximityMessage = (distanceKm) => {
  const meters = distanceKm * 1000;
  
  if (meters <= 100) return { text: '¡Ya llegó!', urgent: true, color: '#4CAF50' };
  if (meters <= 150) return { text: 'Llegando...', urgent: true, color: '#4CAF50' };
  if (meters <= 300) return { text: 'A menos de 300m', urgent: false, color: '#90BDD3' };
  if (meters <= 500) return { text: 'A ~500m', urgent: false, color: '#90BDD3' };
  if (distanceKm <= 1) return { text: 'A menos de 1 km', urgent: false, color: '#FFA726' };
  if (distanceKm <= 2) return { text: 'A ~2 km', urgent: false, color: '#FFA726' };
  
  return { text: `A ${distanceKm.toFixed(1)} km`, urgent: false, color: '#fff' };
};

// Hook para tracking de geolocalización
export const startGeolocationTracking = (onUpdate, onError) => {
  if (!('geolocation' in navigator)) {
    onError?.('Geolocalización no disponible');
    return null;
  }
  
  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      onUpdate?.({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp
      });
    },
    (error) => {
      onError?.(error.message);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 5000
    }
  );
  
  return watchId;
};

// Detener tracking
export const stopGeolocationTracking = (watchId) => {
  if (watchId !== null && 'geolocation' in navigator) {
    navigator.geolocation.clearWatch(watchId);
  }
};

// Generar URL de navegación (Waze/Google Maps)
export const getNavigationUrl = (lat, lng, app = 'waze') => {
  if (app === 'waze') {
    return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
};

// Notificación del sistema (si tiene permisos)
export const showSystemNotification = async (title, body, options = {}) => {
  if (!('Notification' in window)) return false;
  
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/logo192.png', ...options });
    return true;
  }
  
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      new Notification(title, { body, icon: '/logo192.png', ...options });
      return true;
    }
  }
  
  return false;
};

// Formatear tiempo restante (para timer de espera)
export const formatTimeRemaining = (seconds) => {
  if (seconds <= 0) return '0:00';
  
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// ETA: 40 min mínimo (20 min sería máquina al lado, irreal). Wow factor si llegan antes.
// Alineado con backend: preparación + ruta ~25 km/h + 25% buffer.
const MIN_ETA_MINUTES = 40;
const ROUTE_SPEED_KMH = 25;
const ROUTE_BUFFER_FACTOR = 1.25;

export const calculateETAMinutes = (distanceKm, speedKmh = ROUTE_SPEED_KMH) => {
  const drivingMin = Math.round(((distanceKm / speedKmh) * 60) * ROUTE_BUFFER_FACTOR);
  const total = 30 + Math.max(15, drivingMin);  // prep base + ruta (mín 15 min)
  return Math.max(MIN_ETA_MINUTES, total);
};

export default {
  vibrate,
  playAlert,
  calculateDistance,
  isWithinRadius,
  formatETA,
  getProximityMessage,
  startGeolocationTracking,
  stopGeolocationTracking,
  getNavigationUrl,
  showSystemNotification,
  formatTimeRemaining,
  calculateETAMinutes,
  VIBRATION_PATTERNS
};
