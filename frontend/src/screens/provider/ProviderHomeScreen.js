import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import { getObject } from '../../utils/safeStorage';
import { playNewRequestSound, playTapSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';

import BACKEND_URL from '../../utils/api';
import { MACHINERY_NAMES } from '../../utils/machineryNames';

/**
 * Pantalla P09 - Home Proveedor con Toggle Disponibilidad
 * El toggle est? bloqueado hasta completar el onboarding
 */
function ProviderHomeScreen() {
  const navigate = useNavigate();
  // Persistir estado de disponibilidad en localStorage
  const [available, setAvailable] = useState(() => {
    return localStorage.getItem('providerAvailable') === 'true';
  });
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [bankDataComplete, setBankDataComplete] = useState(false);

  useEffect(() => {
    // Verificar si complet? el onboarding
    const completed = localStorage.getItem('providerOnboardingCompleted') === 'true';
    setOnboardingCompleted(completed);
    
    // Si no complet? onboarding, verificar si tiene progreso guardado
    if (!completed) {
      const savedStep = localStorage.getItem('providerOnboardingStep');
      if (savedStep && parseInt(savedStep) > 0) {
        // Tiene progreso - mostrar opci?n de continuar
        const STEP_ROUTES = {
          '1': '/provider/data',
          '2': '/provider/machine-data',
          '3': '/provider/machine-photos',
          '4': '/provider/pricing',
          '5': '/provider/operator-data',
          '6': '/provider/review'
        };
        const route = STEP_ROUTES[savedStep];
        if (route) {
          // Auto-redirigir al ?ltimo paso
          navigate(route);
          return;
        }
      }
    }
    
    // Cargar estado de disponibilidad guardado
    const savedAvailable = localStorage.getItem('providerAvailable') === 'true';
    if (completed && savedAvailable !== available) {
      setAvailable(savedAvailable);
    }
    
    // Verificar si datos bancarios est?n completos
    const bankData = getObject('bankData', {});
    const isBankComplete = bankData.bank && bankData.accountType && bankData.accountNumber && bankData.holderName && bankData.holderRut;
    setBankDataComplete(!!isBankComplete);
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
    if (!onboardingCompleted) return; // Bloquear si no complet? onboarding
    
    const newStatus = !available;
    setAvailable(newStatus);
    
    // Desbloquear audio y feedback t?ctil (como en operadores)
    unlockAudio();
    playTapSound();
    vibrate(newStatus ? 'accepted' : 'tap');
    
    // Persistir en localStorage
    localStorage.setItem('providerAvailable', newStatus.toString());
    
    try {
      const userId = localStorage.getItem('userId');
      await axios.patch(`${BACKEND_URL}/api/users/${userId}`, {
        available: newStatus
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Demo: simular solicitud entrante
  const simulateRequest = () => {
    if (!onboardingCompleted) {
      alert('Debes completar el registro de tu maquinaria primero');
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
        <MaqgoLogo size="medium" style={{ marginBottom: 50, marginTop: 20 }} />

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
            disabled={!onboardingCompleted}
            style={{
              width: 100,
              height: 100,
              borderRadius: '50%',
              border: 'none',
              background: available && onboardingCompleted ? '#90BDD3' : '#444',
              cursor: onboardingCompleted ? 'pointer' : 'not-allowed',
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
              Las solicitudes inmediatas pagan hasta <strong style={{ color: '#EC6819' }}>+20% m?s</strong>
            </p>
          </div>
        )}

        <div className="maqgo-spacer"></div>

        {/* Bot?n demo para simular solicitud */}
        <button 
          className="maqgo-btn-primary"
          onClick={simulateRequest}
          disabled={!onboardingCompleted}
          style={{ marginBottom: 15, opacity: onboardingCompleted ? 1 : 0.5 }}
        >
          Simular solicitud entrante (Demo)
        </button>

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
