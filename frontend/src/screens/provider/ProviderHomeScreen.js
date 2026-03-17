import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import { useToast } from '../../components/Toast';
import { getObject } from '../../utils/safeStorage';
import { playNewRequestSound, playTapSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';

import BACKEND_URL from '../../utils/api';
import { MACHINERY_NAMES } from '../../utils/machineryNames';
import { getProviderOnboardingRoute } from '../../utils/providerOnboarding';

/**
 * Pantalla P09 - Home Proveedor con Toggle Disponibilidad
 * El toggle está bloqueado hasta completar el onboarding.
 * Disponibilidad: backend es fuente de verdad; localStorage es fallback (offline/demo).
 */
function ProviderHomeScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const [available, setAvailable] = useState(() => localStorage.getItem('providerAvailable') === 'true');
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [bankDataComplete, setBankDataComplete] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    const completed = localStorage.getItem('providerOnboardingCompleted') === 'true';
    setOnboardingCompleted(completed);

    if (!completed) {
      const savedStep = localStorage.getItem('providerOnboardingStep');
      const route = getProviderOnboardingRoute(savedStep);
      if (route) {
        navigate(route);
        return;
      }
    }

    const bankData = getObject('bankData', {});
    const isBankComplete = !!bankData.bank && !!bankData.accountType && !!bankData.accountNumber && !!bankData.holderName && !!bankData.holderRut;
    setBankDataComplete(isBankComplete);

    // Sincronizar disponibilidad desde backend (fuente de verdad) al montar
    const userId = localStorage.getItem('userId');
    const isDemoId = userId && (userId.startsWith('provider-') || userId.startsWith('demo-') || userId.startsWith('operator-'));
    if (userId && !isDemoId) {
      axios.get(`${BACKEND_URL}/api/users/${userId}`, { timeout: 5000 })
        .then((res) => {
          const avail = res.data?.isAvailable ?? res.data?.available ?? false;
          setAvailable(!!avail);
          localStorage.setItem('providerAvailable', (!!avail).toString());
        })
        .catch(() => {
          const saved = localStorage.getItem('providerAvailable') === 'true';
          setAvailable(saved);
        });
    } else {
      const saved = localStorage.getItem('providerAvailable') === 'true';
      setAvailable(saved);
    }
  }, [navigate]);

  useEffect(() => {
    // Polling para verificar solicitudes entrantes (solo si disponible y onboarding completo)
    const checkRequests = async () => {
      try {
        const userId = localStorage.getItem('userId');
        if (userId && available && onboardingCompleted) {
          const res = await axios.get(`${BACKEND_URL}/api/service-requests/pending?providerId=${userId}`);
          if (res.data && res.data.length > 0) {
            setPendingRequest(res.data[0]);
            localStorage.setItem('incomingRequest', JSON.stringify(res.data[0]));
            unlockAudio();
            playNewRequestSound();
            vibrate('newRequest');
            navigate('/provider/request-received');
          }
        }
      } catch (e) {
        // Silenciar errores de polling
      }
    };

    const interval = setInterval(checkRequests, 5000);
    return () => clearInterval(interval);
  }, [available, onboardingCompleted, navigate]);

  const toggleAvailability = async () => {
    if (!onboardingCompleted || isToggling) return;

    setIsToggling(true);
    const userId = localStorage.getItem('userId');
    if (!userId) {
      setIsToggling(false);
      toast.error('Debes iniciar sesión para conectarte. Cierra sesión y vuelve a entrar.');
      return;
    }

    const newStatus = !available;
    setAvailable(newStatus);

    // Desbloquear audio y feedback táctil (como en operadores)
    unlockAudio();
    playTapSound();
    vibrate(newStatus ? 'accepted' : 'tap');

    // Persistir en localStorage
    localStorage.setItem('providerAvailable', newStatus.toString());

    // Modo demo: IDs de fallback no existen en backend, no llamar API
    const isDemoId = userId.startsWith('provider-') || userId.startsWith('demo-') || userId.startsWith('operator-');
    if (isDemoId) {
      toast.success(newStatus ? 'Te conectaste (modo demo)' : 'Te desconectaste', 'availability');
      setIsToggling(false);
      return;
    }

    const doPatch = () => axios.patch(`${BACKEND_URL}/api/users/${userId}`, {
      available: newStatus
    }, { timeout: 8000 });

    try {
      await doPatch();
      toast.success(newStatus ? 'Te conectaste' : 'Te desconectaste', 'availability');
    } catch (e) {
      // Un reintento en fallo de red (producción: conexiones transitorias)
      const isRetryable = !e.response || e.code === 'ECONNABORTED' || e.code === 'ERR_NETWORK' || e.message?.includes('Network Error');
      if (isRetryable) {
        try {
          await doPatch();
          toast.success(newStatus ? 'Te conectaste' : 'Te desconectaste', 'availability');
          return;
        } catch (e2) {
          console.error('Reintento fallido:', e2);
        }
      }
      const status = e.response?.status;
      const detail = e.response?.data?.detail;
      const detailStr = typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail.map(d => d?.msg || d).join(' ') : '');
      const isNetworkError = !e.response || e.code === 'ECONNREFUSED' || e.code === 'ERR_NETWORK' || e.code === 'ECONNABORTED' || e.message?.includes('Network Error') || e.message?.includes('timeout');

      if (status === 404 || (detailStr && detailStr.toLowerCase().includes('no encontrado'))) {
        setAvailable(!newStatus);
        localStorage.setItem('providerAvailable', (!newStatus).toString());
        toast.error('Tu sesión expiró. Cierra sesión e inicia sesión nuevamente.');
      } else if (isNetworkError) {
        toast.success(newStatus ? 'Te conectaste. No se pudo sincronizar (sin conexión).' : 'Te desconectaste. No se pudo sincronizar (sin conexión).', 'availability');
      } else {
        setAvailable(!newStatus);
        localStorage.setItem('providerAvailable', (!newStatus).toString());
        toast.error('No se pudo conectar. Intenta de nuevo.');
      }
    } finally {
      setIsToggling(false);
    }
  };

  // Demo: simular solicitud entrante
  const simulateRequest = () => {
    if (!onboardingCompleted) {
      toast.warning('Debes completar el registro de tu maquinaria primero');
      return;
    }
    
    // Obtener el tipo de maquinaria registrada por el proveedor
    const machineData = getObject('machineData', {});
    const machineryType = machineData.machineryType || 'retroexcavadora';
    
    const billingData = getObject('billingData', {});
    const serviceLat = parseFloat(localStorage.getItem('serviceLat'));
    const serviceLng = parseFloat(localStorage.getItem('serviceLng'));
    const serviceLocation = localStorage.getItem('serviceLocation') || 'Santiago Centro';
    const workCoords = (Number.isFinite(serviceLat) && Number.isFinite(serviceLng))
      ? { lat: serviceLat, lng: serviceLng } : null;
    const clientPhone = localStorage.getItem('userPhone') || '+56987654321';
    const serviceReference = localStorage.getItem('serviceReference') || '';
    localStorage.setItem('incomingRequest', JSON.stringify({
      id: `req-${Date.now()}`,
      machineryType: MACHINERY_NAMES[machineryType] || machineryType,
      machineryId: machineryType,
      location: serviceLocation,
      hours: 4,
      clientName: billingData.nombre ? `${billingData.nombre} ${billingData.apellido || ''}`.trim() : 'Carlos Gonz?lez',
      clientPhone,
      client_lat: workCoords?.lat,
      client_lng: workCoords?.lng,
      workCoords,
      reference: serviceReference
    }));
    unlockAudio();
    playNewRequestSound();
    vibrate('newRequest');
    navigate('/provider/request-received');
  };

  const goToOnboarding = () => {
    navigate('/provider/data');
  };

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ paddingBottom: 80, justifyContent: 'flex-start' }}>
        {/* Header - Solo logo centrado */}
        <MaqgoLogo size="medium" style={{ marginBottom: 40 }} />

        {/* Alerta si no complet? onboarding */}
        {!onboardingCompleted && (
          <div style={{
            background: '#2A2A2A',
            border: '1px solid #EC6819',
            borderRadius: 14,
            padding: 24,
            marginBottom: 25
          }}>
            <p style={{ color: '#EC6819', fontSize: 14, margin: 0, marginBottom: 12, fontWeight: 600 }}>
              Registro incompleto
            </p>
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: 0, marginBottom: 15, lineHeight: 1.5 }}>
              Completa datos de empresa, maquinaria y operador para recibir solicitudes.
            </p>
            <button
              onClick={goToOnboarding}
              style={{
                width: '100%',
                padding: 14,
                background: '#EC6819',
                border: 'none',
                borderRadius: 25,
                color: '#fff',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Completar registro
            </button>
          </div>
        )}

        {/* Toggle de disponibilidad - Estilo Industrial */}
        <div style={{
          background: '#363636',
          borderRadius: 20,
          padding: 30,
          marginBottom: 20,
          opacity: onboardingCompleted ? 1 : 0.5,
          textAlign: 'center'
        }}>
          {/* Toggle grande central - SIN gradientes */}
          <button
            onClick={toggleAvailability}
            disabled={!onboardingCompleted || isToggling}
            style={{
              width: 100,
              height: 100,
              borderRadius: '50%',
              border: 'none',
              background: available && onboardingCompleted ? '#90BDD3' : '#444',
              cursor: onboardingCompleted && !isToggling ? 'pointer' : 'not-allowed',
              opacity: isToggling ? 0.7 : 1,
              transition: 'background 0.3s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}
            data-testid="availability-toggle"
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <path 
                d="M13 3L4 14H12L11 21L20 10H12L13 3Z" 
                fill="#fff" 
                stroke="#fff" 
                strokeWidth="1"
              />
            </svg>
          </button>
          
          {/* Estado texto */}
          <p style={{ 
            color: available && onboardingCompleted ? '#90BDD3' : '#888', 
            fontSize: 22, 
            margin: 0,
            fontWeight: 700,
            marginBottom: 4
          }}>
            {!onboardingCompleted ? 'Bloqueado' : (available ? 'Disponible' : 'Desconectado')}
          </p>
          <p style={{ 
            color: 'rgba(255,255,255,0.95)', 
            fontSize: 13, 
            margin: 0 
          }}>
            {!onboardingCompleted 
              ? 'Completa tu registro primero' 
              : (available ? 'Toca para desconectarte' : 'Toca para conectarte')
            }
          </p>
        </div>

        {available && onboardingCompleted && (
          <div style={{
            background: '#2A2A2A',
            borderRadius: 12,
            padding: 16,
            marginBottom: 20
          }}>
            <p style={{ color: '#90BDD3', fontSize: 15, fontWeight: 600, margin: 0, textAlign: 'center', marginBottom: 8 }}>
              Listo para recibir solicitudes
            </p>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: 0, textAlign: 'center' }}>
              Las solicitudes inmediatas pagan hasta <strong style={{ color: '#EC6819' }}>+20% más</strong>
            </p>
          </div>
        )}

        <div className="maqgo-spacer"></div>

        {/* Botón demo: solo en desarrollo, oculto en producción live */}
        {import.meta.env.VITE_IS_PRODUCTION !== 'true' && (
          <button 
            className="maqgo-btn-primary"
            onClick={simulateRequest}
            disabled={!onboardingCompleted}
            style={{ marginBottom: 15, opacity: onboardingCompleted ? 1 : 0.5 }}
          >
            Simular solicitud entrante (Demo)
          </button>
        )}

        {/* Indicador de configuraci?n pendiente */}
        {!bankDataComplete && (
          <button 
            onClick={() => navigate('/provider/profile')}
            style={{
              width: '100%',
              padding: 14,
              background: 'rgba(236, 104, 25, 0.1)',
              border: '1px dashed #EC6819',
              borderRadius: 12,
              color: '#EC6819',
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v4M12 16h.01"/>
            </svg>
            Completa tu perfil para recibir pagos
          </button>
        )}
      </div>
    </div>
  );
}

export default ProviderHomeScreen;
