import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { playArrivedSound, unlockAudio } from '../../utils/notificationSounds';
import { playNearbyAlert, playSuccessAlert, playAccessGrantedAlert } from '../../utils/alertSound';
import { vibrate } from '../../utils/uberUX';
import { MACHINERY_NAMES } from '../../utils/machineryNames';
import { MACHINERY_PER_TRIP } from '../../utils/pricing';
import { getObjectFirst } from '../../utils/safeStorage';
import BACKEND_URL, { fetchWithAuth } from '../../utils/api';
import ServiceStateLayout from '../../components/serviceState/ServiceStateLayout';
import { MapPin } from 'lucide-react';
import { getOperatorDisplayNameForSite, getOperatorRutForSite, getProviderLicensePlate } from '../../utils/providerDisplay';
import { getBookingLocationLineOrEmpty } from '../../utils/mapPlaceToAddress';

// Constantes de tiempo (en segundos)
const MAX_WAIT_TIME = 30 * 60; // 30 minutos

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
  const clientOnTheWayRef = useRef(false);
  const lastReminderRef = useRef(0);
  const serviceId = localStorage.getItem('currentServiceId') || `service-${Date.now()}`;
  const operatorName = getOperatorDisplayNameForSite(provider) || 'Operador asignado';
  const operatorRut = getOperatorRutForSite(provider) || '';
  const licensePlate = getProviderLicensePlate(provider) || '';

  useEffect(() => {
    clientOnTheWayRef.current = clientOnTheWay;
  }, [clientOnTheWay]);

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

  // Timer: un solo intervalo (no recrear cada tick); minutos y recordatorios desde el valor actual de cuenta atrás.
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          localStorage.setItem('clientAcceptedEntry', 'true');
          localStorage.setItem('autoStartedService', 'true');
          handleStartService();
          return 0;
        }
        const next = prev - 1;
        const newMinutes = Math.floor((MAX_WAIT_TIME - next) / 60);
        setWaitingMinutes(newMinutes);

        if (!clientOnTheWayRef.current) {
          const last = lastReminderRef.current;
          if (newMinutes >= 25 && last < 25) {
            lastReminderRef.current = 25;
            setReminderMessage('Quedan 5 minutos para autorizar ingreso.');
            setShowReminder(true);
            playNearbyAlert();
            vibrate([300, 100, 300, 100, 500]);
          } else if (newMinutes >= 15 && last < 15) {
            lastReminderRef.current = 15;
            setReminderMessage('El operador lleva 15 minutos esperando.');
            setShowReminder(true);
            vibrate([200, 100, 200]);
          } else if (newMinutes >= 5 && last < 5) {
            lastReminderRef.current = 5;
            setReminderMessage('El operador lleva 5 minutos esperando.');
            setShowReminder(true);
            vibrate([150, 50, 150]);
          }
        }

        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [handleStartService]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleLetIn = async () => {
    unlockAudio();
    playAccessGrantedAlert(); // Sonido + vibración de confirmación
    try {
      await fetchWithAuth(
        `${BACKEND_URL}/api/service-requests/${encodeURIComponent(serviceId)}/confirm-entry`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startNow: true })
        },
        12000
      );
    } catch {
      void 0;
    }
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

  const locationLabel = getBookingLocationLineOrEmpty() || 'Por confirmar';
  const alerts = [];
  if (showReminder) {
    alerts.push({
      tone: waitingMinutes >= 25 ? 'danger' : 'warn',
      title: 'Recordatorio',
      description: reminderMessage,
      rightSlot: (
        <button
          type="button"
          onClick={() => setShowReminder(false)}
          style={{
            height: 30,
            padding: '0 10px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.92)',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer'
          }}
        >
          OK
        </button>
      )
    });
  }
  if (clientOnTheWay) {
    alerts.push({
      tone: 'success',
      title: 'Notificación enviada',
      description: 'El operador fue notificado.'
    });
  }

  return (
    <ServiceStateLayout
      topBar={{ showBack: false, showHome: true, onHome: () => navigate('/client/home') }}
      header={{
        icon: <MapPin size={22} />,
        title: 'Operador llegó',
        subtitle: 'Autoriza el ingreso para iniciar el servicio.',
        badgeLabel: 'Llegado',
        badgeTone: 'info',
        meta: [{ label: 'Tiempo', value: formatTime(timeLeft) }],
      }}
      primaryTitle="Ingreso"
      primary={
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '10px 12px',
            borderRadius: 12,
            background: waitingMinutes >= 25 ? 'rgba(244, 67, 54, 0.12)' : 'rgba(255, 193, 7, 0.12)',
            border: waitingMinutes >= 25 ? '1px solid rgba(244, 67, 54, 0.22)' : '1px solid rgba(255, 193, 7, 0.22)'
          }}>
            <div>
              <div style={{ color: waitingMinutes >= 25 ? '#F44336' : '#FFC107', fontSize: 12, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                Operador esperando
              </div>
              <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 2 }}>
                {waitingMinutes} min de 30
              </div>
            </div>
            <div style={{ color: waitingMinutes >= 25 ? '#F44336' : '#FFC107', fontSize: 18, fontWeight: 800, fontFamily: 'monospace' }}>
              {formatTime(timeLeft)}
            </div>
          </div>

          <div style={{ marginTop: 12, color: 'rgba(255,255,255,0.82)', fontSize: 13, lineHeight: 1.4 }}>
            Si no autorizas el ingreso, el servicio inicia automáticamente al finalizar el tiempo.
          </div>

          <div style={{
            marginTop: 12,
            background: '#EC6819',
            borderRadius: 14,
            padding: 14,
            textAlign: 'center'
          }}
            data-testid="license-plate-arrived"
          >
            <div style={{ color: 'rgba(255,255,255,0.86)', fontSize: 12, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>
              Patente
            </div>
            <div style={{ color: '#fff', fontSize: 22, fontWeight: 900, letterSpacing: 0.6 }}>
              {licensePlate ? licensePlate.toUpperCase() : 'Por confirmar'}
            </div>
          </div>
        </div>
      }
      summary={{
        title: 'Resumen',
        machinery: MACHINERY_NAMES[machinery] || machinery,
        operatorName,
        operatorRut,
        licensePlate,
        location: locationLabel,
        duration: MACHINERY_PER_TRIP.includes(machinery) ? 'Valor viaje' : `${hours} horas${hours >= 6 ? ' + 1hr colación' : ''}`,
      }}
      alerts={alerts}
      secondaryActions={[
        ...(clientOnTheWay
          ? []
          : [{
              key: 'on-my-way',
              label: 'Ya voy (avisar al operador)',
              variant: 'outline',
              onClick: handleOnMyWay,
              testId: 'on-my-way-btn',
            }]),
        {
          key: 'let-in',
          label: 'Permitir entrada e iniciar servicio',
          variant: 'primary',
          onClick: handleLetIn,
          testId: 'let-in-btn',
        }
      ]}
    />
  );
}

export default ProviderArrivedScreen;
