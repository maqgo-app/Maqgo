import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ChatFloatingButton from '../../components/ChatFloatingButton';
import { playArrivedSound, unlockAudio } from '../../utils/notificationSounds';
import { playNearbyAlert, playSuccessAlert, playAccessGrantedAlert } from '../../utils/alertSound';
import { vibrate } from '../../utils/uberUX';
import MaqgoLogo from '../../components/MaqgoLogo';
import { MACHINERY_NAMES } from '../../utils/machineryNames';
import { MACHINERY_PER_TRIP } from '../../utils/pricing';
import { getObjectFirst } from '../../utils/safeStorage';
import { getProviderLicensePlate } from '../../utils/providerDisplay';

// Constantes de tiempo (en segundos)
const MAX_WAIT_TIME = 30 * 60; // 30 minutos
const REMINDER_INTERVALS = [5, 15, 25]; // Minutos donde se envían recordatorios

/**
 * Pantalla: El operador ha llegado
 * Timer de 30 minutos - si no responde, servicio inicia automáticamente
 * Notificaciones periódicas al cliente
 * Opción "Ya voy" para avisar al operador
 */
function ProviderArrivedScreen() {
  const navigate = useNavigate();
  const [timeLeft, setTimeLeft] = useState(MAX_WAIT_TIME);
  const [provider, setProvider] = useState({});
  const [machinery, setMachinery] = useState('');
  const [hours, setHours] = useState(4);
  const [waitingMinutes, setWaitingMinutes] = useState(0);
  const [showReminder, setShowReminder] = useState(false);
  const [reminderMessage, setReminderMessage] = useState('');
  const [clientOnTheWay, setClientOnTheWay] = useState(false);
  const [lastReminderShown, setLastReminderShown] = useState(0);
  const serviceId = localStorage.getItem('currentServiceId') || `service-${Date.now()}`;

  useEffect(() => {
    // Cargar datos
    const savedProvider = getObjectFirst(['acceptedProvider', 'selectedProvider'], {});
    const savedMachinery = localStorage.getItem('selectedMachinery') || 'Retroexcavadora';
    const savedHours = parseInt(localStorage.getItem('selectedHours') || '4');
    
    setProvider(savedProvider);
    setMachinery(savedMachinery);
    setHours(savedHours);

    // Operador en obra: 60% cargo si cancela (política punto 6)
    localStorage.setItem('serviceStatus', 'arrived');
    
    // Reproducir sonido de llegada (triunfante)
    unlockAudio();
    playArrivedSound();
    vibrate('arrived');
  }, []);

  const handleStartService = useCallback(() => {
    localStorage.setItem('serviceStartTime', new Date().toISOString());
    localStorage.setItem('serviceStatus', 'started'); // Bloquea cancelación (política punto 6)
    navigate('/client/service-active');
  }, [navigate]);

  // Timer principal y notificaciones periódicas
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          // Auto-iniciar servicio
          localStorage.setItem('clientAcceptedEntry', 'true');
          localStorage.setItem('autoStartedService', 'true');
          handleStartService();
          return 0;
        }
        return prev - 1;
      });

      // Calcular minutos de espera
      setWaitingMinutes(_prev => {
        const newMinutes = Math.floor((MAX_WAIT_TIME - timeLeft + 1) / 60);
        
        // Verificar si debemos mostrar un recordatorio
        if (!clientOnTheWay) {
          if (newMinutes >= 25 && lastReminderShown < 25) {
            // Alerta urgente a los 25 min
            setReminderMessage('⚠️ ¡Solo 5 minutos para autorizar ingreso!');
            setShowReminder(true);
            setLastReminderShown(25);
            playNearbyAlert();
            vibrate([300, 100, 300, 100, 500]);
          } else if (newMinutes >= 15 && lastReminderShown < 15) {
            // Recordatorio a los 15 min
            setReminderMessage('El operador lleva 15 minutos esperando');
            setShowReminder(true);
            setLastReminderShown(15);
            vibrate([200, 100, 200]);
          } else if (newMinutes >= 5 && lastReminderShown < 5) {
            // Recordatorio a los 5 min
            setReminderMessage('El operador lleva 5 minutos esperando');
            setShowReminder(true);
            setLastReminderShown(5);
            vibrate([150, 50, 150]);
          }
        }
        
        return newMinutes;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timeLeft, clientOnTheWay, lastReminderShown, handleStartService]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleLetIn = () => {
    unlockAudio();
    playAccessGrantedAlert(); // Sonido + vibración de confirmación
    localStorage.setItem('clientAcceptedEntry', 'true');
    localStorage.setItem('clientAcceptedEntryTime', new Date().toISOString());
    handleStartService();
  };

  const handleOnMyWay = () => {
    unlockAudio();
    playSuccessAlert();
    vibrate([100, 50, 100]);
    setClientOnTheWay(true);
    localStorage.setItem('clientOnTheWay', 'true');
    localStorage.setItem('clientOnTheWayTime', new Date().toISOString());
    setShowReminder(false);
  };

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 20px 30px' }}>
        {/* Logo */}
        <div style={{ marginBottom: 20 }}>
          <MaqgoLogo size="small" />
        </div>

        {/* Banner de recordatorio */}
        {showReminder && (
          <div style={{
            background: waitingMinutes >= 25 
              ? 'linear-gradient(135deg, #ff6b6b 0%, #ff8e53 100%)' 
              : 'linear-gradient(135deg, #FFC107 0%, #FF9800 100%)',
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            textAlign: 'center',
            animation: 'pulse-banner 1s ease-in-out infinite'
          }}>
            <style>{`
              @keyframes pulse-banner {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.02); }
              }
            `}</style>
            <p style={{ 
              color: waitingMinutes >= 25 ? '#fff' : '#1a1a1a', 
              fontSize: 14, 
              fontWeight: 600, 
              margin: 0 
            }}>
              {reminderMessage}
            </p>
            <button
              onClick={() => setShowReminder(false)}
              style={{
                marginTop: 10,
                padding: '6px 16px',
                background: 'rgba(255,255,255,0.3)',
                border: 'none',
                borderRadius: 15,
                color: waitingMinutes >= 25 ? '#fff' : '#1a1a1a',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Entendido
            </button>
          </div>
        )}

        {/* Banner "Ya voy" confirmado */}
        {clientOnTheWay && (
          <div style={{
            background: 'linear-gradient(135deg, #90BDD3 0%, #00ACC1 100%)',
            borderRadius: 12,
            padding: 12,
            marginBottom: 16,
            textAlign: 'center'
          }}>
            <p style={{ color: '#fff', fontSize: 13, fontWeight: 600, margin: 0 }}>
              ✓ El operador sabe que vas en camino
            </p>
          </div>
        )}

        {/* Timer de espera visible */}
        <div style={{
          background: waitingMinutes >= 25 ? 'rgba(255, 107, 107, 0.15)' : 'rgba(255, 193, 7, 0.15)',
          borderRadius: 12,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke={waitingMinutes >= 25 ? '#ff6b6b' : '#FFC107'} strokeWidth="2"/>
              <path d="M12 6V12L16 14" stroke={waitingMinutes >= 25 ? '#ff6b6b' : '#FFC107'} strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <div>
              <p style={{ color: waitingMinutes >= 25 ? '#ff6b6b' : '#FFC107', fontSize: 12, fontWeight: 600, margin: 0 }}>
                Operador esperando
              </p>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, margin: '2px 0 0' }}>
                {waitingMinutes} min de 30
              </p>
            </div>
          </div>
          <div style={{ 
            color: waitingMinutes >= 25 ? '#ff6b6b' : '#FFC107', 
            fontSize: 18, 
            fontWeight: 700,
            fontFamily: 'monospace'
          }}>
            {formatTime(timeLeft)}
          </div>
        </div>

        {/* Regla de los 30 minutos (política punto 7) */}
        <p style={{
          color: 'rgba(255,255,255,0.7)',
          fontSize: 11,
          textAlign: 'center',
          marginBottom: 16,
          lineHeight: 1.4
        }}>
          Tienes 30 min para autorizar el ingreso. Si no respondes, el servicio inicia solo y se cobra lo acordado.
        </p>

        {/* Icono llegada */}
        <div style={{
          width: 90,
          height: 90,
          borderRadius: '50%',
          background: '#90BDD3',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px'
        }}>
          <svg width="45" height="45" viewBox="0 0 50 50" fill="none">
            <path d="M15 25L22 32L35 18" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {/* Título */}
        <h1 style={{
          color: '#fff',
          fontSize: 22,
          fontWeight: 700,
          textAlign: 'center',
          marginBottom: 8
        }}>
          ¡El operador ha llegado!
        </h1>

        <p style={{
          color: 'rgba(255,255,255,0.9)',
          fontSize: 14,
          textAlign: 'center',
          marginBottom: 20
        }}>
          Te espera en la ubicación indicada
        </p>

        {/* Card con datos de la reserva */}
        <div style={{
          background: '#363636',
          borderRadius: 14,
          padding: 14,
          marginBottom: 16
        }}>
          {/* Maquinaria */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
            paddingBottom: 10,
            borderBottom: '1px solid #444'
          }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>Maquinaria</span>
            <span style={{ color: '#EC6819', fontSize: 13, fontWeight: 600 }}>
              {MACHINERY_NAMES[machinery] || machinery}
            </span>
          </div>

          {/* PATENTE SUPER DESTACADA - Para identificar en obra */}
          <div 
            style={{ 
              background: '#EC6819',
              borderRadius: 10,
              padding: 14,
              marginBottom: 12,
              textAlign: 'center'
            }}
            data-testid="license-plate-arrived"
          >
            <div style={{ 
              color: 'rgba(255,255,255,0.8)', 
              fontSize: 11, 
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 4
            }}>
              Busca esta patente
            </div>
            <div style={{ 
              color: '#fff', 
              fontSize: 28, 
              fontWeight: 700,
              letterSpacing: 2,
              fontFamily: 'monospace'
            }}>
              {getProviderLicensePlate(provider) || 'Por confirmar'}
            </div>
          </div>

          {/* Horas */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>Duración</span>
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>
              {MACHINERY_PER_TRIP.includes(machinery) ? 'Valor viaje' : `${hours} horas${hours >= 6 ? ' + 1hr colación' : ''}`}
            </span>
          </div>
        </div>

        {/* Info operador */}
        <div style={{
          background: '#363636',
          borderRadius: 14,
          padding: 14,
          marginBottom: 20
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{
              width: 50,
              height: 50,
              borderRadius: '50%',
              background: '#444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
                <circle cx="14" cy="10" r="5" fill="rgba(255,255,255,0.95)"/>
                <path d="M4 24C4 19 9 16 14 16C19 16 24 19 24 24" stroke="rgba(255,255,255,0.95)" strokeWidth="2"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: 0 }}>
                {provider.operator_name || provider.providerOperatorName || 'Operador asignado'}
              </p>
              <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, margin: 0 }}>
                Operador de maquinaria
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 1L9.5 5.5H14.5L10.5 8.5L12 13.5L8 10.5L4 13.5L5.5 8.5L1.5 5.5H6.5L8 1Z" fill="#EC6819"/>
              </svg>
              <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{(provider.rating ?? 4.8).toFixed(1)}</span>
            </div>
          </div>
          {/* RUT del operador */}
          <div style={{
            background: '#2D2D2D',
            borderRadius: 8,
            padding: '8px 12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>RUT Operador</span>
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>
              {provider.operator_rut || '12.345.678-9'}
            </span>
          </div>
        </div>

        {/* Botón "Ya voy" - si cliente no puede atender inmediatamente */}
        {!clientOnTheWay && (
          <button 
            onClick={handleOnMyWay}
            data-testid="on-my-way-btn"
            style={{
              width: '100%',
              padding: 14,
              background: 'transparent',
              border: '2px solid #90BDD3',
              borderRadius: 10,
              color: '#90BDD3',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              marginTop: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="#90BDD3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            ¡Ya voy! (avisar al operador)
          </button>
        )}

        {/* Botón permitir entrada */}
        <button 
          className="maqgo-btn-primary"
          onClick={handleLetIn}
          data-testid="let-in-btn"
          style={{
            background: '#90BDD3',
            padding: 16,
            fontSize: 15,
            marginTop: clientOnTheWay ? 16 : 12
          }}
        >
          Permitir entrada e iniciar servicio
        </button>

        <p style={{
          color: 'rgba(255,255,255,0.9)',
          fontSize: 11,
          textAlign: 'center',
          marginTop: 12
        }}>
          Regla de 30 min: Si no das acceso, el servicio inicia automáticamente
        </p>
      </div>

      {/* Botón flotante de chat - Discreto */}
      <ChatFloatingButton
        serviceId={serviceId}
        userType="client"
        userName={localStorage.getItem('userName') || 'Cliente'}
        otherName={provider.operator_name || provider.providerOperatorName || 'Operador'}
      />
    </div>
  );
}

export default ProviderArrivedScreen;
