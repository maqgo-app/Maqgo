import React, { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  ProviderCancellation, 
  CancellationSuccess, 
  CancellationWithCharge,
  RequestExpiredError,
  ProviderRejectedError
} from '../../components/ErrorStates';
import { playErrorSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';

/**
 * Pantalla para mostrar notificaciones de estado del servicio
 * 
 * Estados soportados:
 * - provider_cancelled: El proveedor canceló el servicio
 * - cancelled_valid: Cancelación sin cargo (dentro del plazo)
 * - cancelled_charge: Cancelación con cargo (fuera del plazo)
 * - request_expired: La solicitud expiró sin respuesta
 * - provider_rejected: El proveedor rechazó la solicitud
 */
function ServiceNotificationScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Calcular valores directamente de searchParams/localStorage (sin setState)
  const notificationType = useMemo(() => {
    return searchParams.get('type') || localStorage.getItem('serviceNotification') || '';
  }, [searchParams]);

  const chargeAmount = useMemo(() => {
    const amount = searchParams.get('amount') || localStorage.getItem('cancellationCharge') || 0;
    return parseInt(amount);
  }, [searchParams]);

  // Limpiar datos de localStorage después de leer
  useEffect(() => {
    localStorage.removeItem('serviceNotification');
    localStorage.removeItem('cancellationCharge');
  }, []);

  // Sonido y vibración para notificaciones de cancelación/error
  useEffect(() => {
    if (notificationType) {
      unlockAudio();
      playErrorSound();
      vibrate('cancelled');
    }
  }, [notificationType]);

  const handleSearchOther = () => {
    navigate('/client/providers');
  };

  const handleGoHome = () => {
    navigate('/client/home');
  };

  // Renderizar según tipo de notificación
  switch (notificationType) {
    case 'provider_cancelled':
      return (
        <div className="maqgo-app">
          <div className="maqgo-screen">
            <ProviderCancellation onSearchOther={handleSearchOther} />
          </div>
        </div>
      );
    
    case 'cancelled_valid':
      return (
        <div className="maqgo-app">
          <div className="maqgo-screen">
            <CancellationSuccess onClose={handleGoHome} />
          </div>
        </div>
      );
    
    case 'cancelled_charge':
      return (
        <div className="maqgo-app">
          <div className="maqgo-screen">
            <CancellationWithCharge amount={chargeAmount} onClose={handleGoHome} />
          </div>
        </div>
      );
    
    case 'request_expired':
      return (
        <div className="maqgo-app">
          <div className="maqgo-screen">
            <RequestExpiredError onViewOthers={handleSearchOther} />
          </div>
        </div>
      );
    
    case 'provider_rejected':
      return (
        <div className="maqgo-app">
          <div className="maqgo-screen">
            <ProviderRejectedError onSelectOther={handleSearchOther} />
          </div>
        </div>
      );
    
    default:
      // Si no hay tipo específico, redirigir al home
      return (
        <div className="maqgo-app">
          <div className="maqgo-screen" style={{ 
            justifyContent: 'center', 
            alignItems: 'center',
            padding: 24 
          }}>
            <p style={{ color: 'rgba(255,255,255,0.9)', marginBottom: 20 }}>
              Cargando...
            </p>
            <button 
              className="maqgo-btn-primary"
              onClick={handleGoHome}
            >
              Ir al inicio
            </button>
          </div>
        </div>
      );
  }
}

export default ServiceNotificationScreen;
