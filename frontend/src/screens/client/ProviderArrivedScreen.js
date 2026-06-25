import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { playArrivedSound, unlockAudio } from '../../utils/notificationSounds';
import { playNearbyAlert, playSuccessAlert, playAccessGrantedAlert } from '../../utils/alertSound';
import { vibrate } from '../../utils/uberUX';
import { MACHINERY_NAMES } from '../../utils/machineryNames';
import { MACHINERY_PER_TRIP } from '../../utils/pricing';
import { getObjectFirst } from '../../utils/safeStorage';
import BACKEND_URL, { fetchWithAuth } from '../../utils/api';
import { useAdaptivePolling } from '../../hooks/useAdaptivePolling';
import ServiceSecondaryActions from '../../components/serviceState/ServiceSecondaryActions';
import { MapPin } from 'lucide-react';
import { getOperatorRutDisplayForSite, getProviderLicensePlateDisplay } from '../../utils/providerDisplay';
import { getBookingLocationLineOrEmpty } from '../../utils/mapPlaceToAddress';
import MaqgoButton from '../../components/base/MaqgoButton';
import MaqgoLogo from '../../components/MaqgoLogo';
import MaqgoCard from '../../components/base/MaqgoCard';

// Constantes de tiempo (en segundos)
const MAX_WAIT_TIME = 30 * 60; // 30 minutos

/**
 * Pantalla: El operador ha llegado
 * Timer de 30 minutos - si no responde, servicio inicia automáticamente
 * Notificaciones periódicas al cliente
 * Opción "Ya voy" (solo demo)
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
  const startedRef = useRef(false);
  const serviceId = String(localStorage.getItem('currentServiceId') || '').trim();
  const operatorRut = getOperatorRutDisplayForSite(provider);
  const licensePlate = getProviderLicensePlateDisplay(provider);

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

    localStorage.setItem('serviceStatus', 'arrived');
    
    // Reproducir sonido de llegada (triunfante)
    unlockAudio();
    playArrivedSound();
    vibrate('arrived');
  }, []);

  const handleStartService = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    localStorage.setItem('serviceStartTime', new Date().toISOString());
    localStorage.setItem('serviceStatus', 'started'); // Bloquea cancelación (política punto 6)
    navigate('/client/service-active');
  }, [navigate]);

  useAdaptivePolling({
    enabled: Boolean(serviceId),
    baseIntervalMs: 3000,
    maxIntervalMs: 30000,
    run: async () => {
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/service-requests/${encodeURIComponent(serviceId)}`,
        { redirectOn401: false },
        12000
      );
      if (!res.ok) return false;
      const data = await res.json();
      const status = String(data?.status || '').trim();
      if (status === 'in_progress') {
        handleStartService();
      }
      return true;
    },
  });

  // Timer: un solo intervalo (no recrear cada tick); minutos y recordatorios desde el valor actual de cuenta atrás.
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
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
      if (!serviceId) return;
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/service-requests/${encodeURIComponent(serviceId)}/confirm-entry`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startNow: true })
        },
        12000
      );
      if (!res.ok) return;
    } catch {
      void 0;
      return;
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
    void 0;
  }

  const durationLabel = MACHINERY_PER_TRIP.includes(machinery) ? 'Valor viaje' : `${hours} horas${hours >= 6 ? ' + 1hr colación' : ''}`;

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 24px' }}>
        <div className="w-full mx-auto" style={{ maxWidth: 520 }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <MaqgoLogo customSize={120} />
          </div>

          <div style={{ height: 10 }} />

          <MaqgoCard style={{ background: '#2A2A2A', padding: 18, textAlign: 'center' }}>
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: 999,
                background: 'rgba(144, 189, 211, 0.18)',
                border: '1px solid rgba(144, 189, 211, 0.28)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 10px'
              }}
              aria-hidden="true"
            >
              <MapPin size={22} color="#90BDD3" />
            </div>
            <div style={{ color: '#fff', fontSize: 20, fontWeight: 900, lineHeight: 1.2 }}>
              Operador llegó
            </div>
            <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 13, marginTop: 6 }}>
              Autoriza el ingreso para iniciar el servicio.
            </div>
          </MaqgoCard>

          <div style={{ height: 10 }} />

          <MaqgoCard>
            <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.9 }}>
              Verifica identidad
            </div>
            <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: 13, lineHeight: 1.45, marginTop: 8 }}>
              Verifica RUT y patente antes de autorizar el ingreso.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
              <div style={{ flex: '1 1 160px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.9 }}>
                  RUT
                </div>
                <div style={{ color: '#fff', fontSize: 14, fontWeight: 900, marginTop: 6 }}>{operatorRut}</div>
              </div>

              <div style={{ flex: '1 1 160px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: '10px 12px' }} data-testid="license-plate-arrived">
                <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.9 }}>
                  Patente
                </div>
                <div style={{ color: '#fff', fontSize: 14, fontWeight: 900, marginTop: 6 }}>{licensePlate}</div>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <MaqgoButton variant="primary" onClick={handleLetIn} data-testid="let-in-primary-inline">
                Autorizar ingreso
              </MaqgoButton>
            </div>
          </MaqgoCard>

          <div style={{ height: 10 }} />

          <MaqgoCard style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: 900, letterSpacing: 0.8, textTransform: 'uppercase' }}>Tiempo de espera</div>
                <div style={{ color: 'rgba(255,255,255,0.86)', fontSize: 12, marginTop: 2 }}>{waitingMinutes} min de 30</div>
              </div>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 900 }}>{formatTime(timeLeft)}</div>
            </div>
            <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 1.4 }}>
              Si no autorizas el ingreso, el servicio inicia automáticamente al finalizar el tiempo.
            </div>
          </MaqgoCard>

          <div style={{ height: 10 }} />

          <MaqgoCard style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: 13, lineHeight: 1.45 }}>
              Las actualizaciones del servicio se registran en el Centro de Avisos.
            </div>
          </MaqgoCard>

          <div style={{ height: 10 }} />

          <MaqgoCard>
            <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.9 }}>
              Equipo reservado
            </div>
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 900, marginTop: 8 }}>{MACHINERY_NAMES[machinery] || machinery}</div>
            <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, marginTop: 4 }}>{durationLabel}</div>
            {locationLabel ? (
              <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, marginTop: 6 }}>{locationLabel}</div>
            ) : null}
          </MaqgoCard>

          <div style={{ height: 14 }} />

          <ServiceSecondaryActions
            actions={clientOnTheWay
              ? []
              : [{
                  key: 'on-my-way',
                  label: 'Ya voy',
                  variant: 'outline',
                  onClick: handleOnMyWay,
                  testId: 'on-my-way-btn',
                }]}
          />
        </div>
      </div>
    </div>
  );
}

export default ProviderArrivedScreen;
