import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import OnTheWayMap from '../../components/OnTheWayMap';
import { getObject, getJSON } from '../../utils/safeStorage';
import { getProviderLicensePlateDisplay, getOperatorDisplayNameForSite, getOperatorRutDisplayForSite } from '../../utils/providerDisplay';
import { getBookingLocationLineOrEmpty } from '../../utils/mapPlaceToAddress';
import { MACHINERY_NAMES, getProviderSpecDisplay, isPerTripMachineryType } from '../../utils/machineryNames';
import { playArrivingSound, playNotificationSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';
import { Star } from 'lucide-react';

const ARRIVING_ALERT_RADIUS_METERS = 500;

const calcDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

function ClientEnRouteScreen() {
  const navigate = useNavigate();
  const [provider] = useState(() => {
    const selected = getObject('selectedProvider', {});
    const accepted = getObject('acceptedProvider', null);
    if (accepted && Object.keys(accepted || {}).length > 0) {
      return { ...selected, ...accepted };
    }
    return selected;
  });

  const providerNormalized = useMemo(() => {
    const isEmpty = !provider || (typeof provider === 'object' && Object.keys(provider).length === 0);
    if (!isEmpty) return provider;
    return {
      eta_minutes: 25,
      rating: 4.8,
      providerOperatorName: 'Juan Pérez',
      operatorRut: '12.345.678-9',
      licensePlate: 'POR-DEFINIR',
      machineData: { bucketM3: 0.4 },
      lat: -33.4372,
      lng: -70.6506,
    };
  }, [provider]);

  const [machinery] = useState(localStorage.getItem('selectedMachinery') || 'retroexcavadora');
  const [location] = useState(() => getBookingLocationLineOrEmpty() || 'Av. Providencia 1234');
  const [etaMinutes, setEtaMinutes] = useState(providerNormalized.eta_minutes || 40);

  const operatorFullName = getOperatorDisplayNameForSite(providerNormalized) || 'Operador asignado';
  const operatorRut = getOperatorRutDisplayForSite(providerNormalized);
  const licensePlateLabel = getProviderLicensePlateDisplay(providerNormalized);
  const ratingRaw = providerNormalized.rating ?? providerNormalized.rating_avg;
  const rating = Number.isFinite(Number(ratingRaw)) ? Number(ratingRaw) : null;

  const workLocation = useMemo(() => ({
    lat: parseFloat(localStorage.getItem('serviceLat')) || -33.4489,
    lng: parseFloat(localStorage.getItem('serviceLng')) || -70.6693,
  }), []);

  const [operatorLocationSim, setOperatorLocationSim] = useState(() => ({
    lat: providerNormalized.lat ?? -33.4372,
    lng: providerNormalized.lng ?? -70.6506,
  }));

  const [nearbyAlertShown, setNearbyAlertShown] = useState(false);
  const [showNearbyBanner, setShowNearbyBanner] = useState(false);

  useEffect(() => {
    const status = localStorage.getItem('serviceStatus');
    if (status && status !== 'en_route') {
      navigate('/client/assigned', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    const already = localStorage.getItem('maqgo_en_route_notified') === 'true';
    if (already) return;
    (async () => {
      try {
        await unlockAudio();
        playNotificationSound();
        vibrate('accepted');
        localStorage.setItem('maqgo_en_route_notified', 'true');
      } catch {
        void 0;
      }
    })();
  }, []);

  useEffect(() => {
    const allowSimulated =
      import.meta.env.DEV ||
      localStorage.getItem('maqgo_simulation_enabled') === 'true' ||
      String(localStorage.getItem('currentServiceId') || '').startsWith('demo-');
    if (!allowSimulated) return undefined;

    const etaInterval = setInterval(() => {
      setEtaMinutes((prev) => (prev <= 1 ? 1 : prev - 1));
    }, 10000);
    return () => clearInterval(etaInterval);
  }, []);

  useEffect(() => {
    const allowSimulated =
      import.meta.env.DEV ||
      localStorage.getItem('maqgo_simulation_enabled') === 'true' ||
      String(localStorage.getItem('currentServiceId') || '').startsWith('demo-');
    if (!allowSimulated) return undefined;

    const interval = setInterval(() => {
      setOperatorLocationSim((prev) => ({
        lat: prev.lat + (workLocation.lat - prev.lat) * 0.03,
        lng: prev.lng + (workLocation.lng - prev.lng) * 0.03,
      }));
    }, 3000);
    return () => clearInterval(interval);
  }, [workLocation.lat, workLocation.lng]);

  useEffect(() => {
    const dist = calcDistance(operatorLocationSim.lat, operatorLocationSim.lng, workLocation.lat, workLocation.lng);
    if (dist <= ARRIVING_ALERT_RADIUS_METERS && !nearbyAlertShown) {
      setNearbyAlertShown(true);
      setShowNearbyBanner(true);
      playArrivingSound();
      vibrate('arriving');
      setTimeout(() => setShowNearbyBanner(false), 10000);
    }
  }, [operatorLocationSim.lat, operatorLocationSim.lng, workLocation.lat, workLocation.lng, nearbyAlertShown]);

  const selectedHours = parseInt(localStorage.getItem('selectedHours') || '4', 10);
  const durationLabel = isPerTripMachineryType(machinery)
    ? 'Valor viaje'
    : `${selectedHours} horas${selectedHours >= 6 ? ' + 1hr colación' : ''}`;
  const machineryName = MACHINERY_NAMES[machinery] || machinery;
  const machinerySpec = getProviderSpecDisplay(machinery, providerNormalized)?.valueFormatted || '—';

  const activeIncident = getJSON('activeIncident', null);

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <MaqgoLogo size="small" />
        </div>

        <div style={{ background: '#363636', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <p style={{ color: '#EC6819', fontSize: 12, fontWeight: 800, margin: 0, textTransform: 'uppercase' }}>
            Operador en camino
          </p>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: '8px 0 0' }}>
            El operador está en camino a tu ubicación.
          </p>
          <div
            style={{
              marginTop: 12,
              background: '#2A2A2A',
              borderRadius: 10,
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.95)" strokeWidth="2" />
              <path d="M12 6V12L16 14" stroke="rgba(255,255,255,0.95)" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13 }}>
              Llegada estimada: <strong style={{ color: '#fff' }}>~{etaMinutes} min</strong>
            </span>
          </div>
        </div>

        <div style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 16, border: '1px solid rgba(255,255,255,0.10)' }}>
          <OnTheWayMap
            operatorLocation={{
              lat: operatorLocationSim.lat,
              lng: operatorLocationSim.lng,
              name: 'Operador',
            }}
            serviceLocation={{
              lat: workLocation.lat,
              lng: workLocation.lng,
              address: location || 'Tu obra',
            }}
          />
        </div>

        <div style={{ background: '#363636', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: 800, margin: 0, textTransform: 'uppercase' }}>
            Operador asignado
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  background: '#2A2A2A',
                  border: '1px solid rgba(255,255,255,0.10)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 12c2.761 0 5-2.239 5-5S14.761 2 12 2 7 4.239 7 7s2.239 5 5 5Z"
                    fill="rgba(255,255,255,0.85)"
                  />
                  <path
                    d="M4 22c0-4.418 3.582-8 8-8s8 3.582 8 8"
                    stroke="rgba(255,255,255,0.85)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div>
                <p style={{ color: '#fff', fontSize: 16, fontWeight: 800, margin: 0 }}>{operatorFullName}</p>
                {rating != null ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <Star size={14} color="#FFC107" fill="#FFC107" />
                    <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 700 }}>{rating.toFixed(1)}</span>
                  </div>
                ) : null}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  background: '#2A2A2A',
                  borderRadius: 10,
                  padding: '8px 10px',
                  border: '1px solid rgba(255,255,255,0.10)',
                }}
              >
                <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, margin: 0 }}>RUT</p>
                <p style={{ color: '#fff', fontSize: 13, fontWeight: 900, margin: '4px 0 0' }}>{operatorRut}</p>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', borderRadius: 10, overflow: 'hidden', background: '#EC6819' }}>
            <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.12)' }}>
              <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>
                Patente
              </span>
            </div>
            <div style={{ flex: 1, textAlign: 'center', padding: '10px 12px' }}>
              <span style={{ color: '#fff', fontSize: 14, fontWeight: 1000, letterSpacing: 0.6 }}>{String(licensePlateLabel).toUpperCase()}</span>
            </div>
          </div>
        </div>

        <div style={{ background: '#363636', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p style={{ color: '#fff', fontSize: 14, fontWeight: 900, margin: 0 }}>{machineryName}</p>
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, margin: '4px 0 0' }}>{durationLabel}</p>
              {machinerySpec !== '—' && (
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, margin: '4px 0 0' }}>{machinerySpec}</p>
              )}
            </div>
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '12px 0' }} />

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginTop: 2 }}>
              <path
                d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
                fill="rgba(255,255,255,0.85)"
              />
              <circle cx="12" cy="9" r="2.5" fill="#0b0f14" />
            </svg>
            <div>
              <p style={{ color: '#fff', fontSize: 13, fontWeight: 800, margin: 0 }}>{location || 'Por confirmar'}</p>
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, margin: '4px 0 0' }}>Dirección de la obra</p>
            </div>
          </div>
        </div>

        {showNearbyBanner && (
          <div
            style={{
              background: 'linear-gradient(135deg, #EC6819 0%, #FF8C42 100%)',
              borderRadius: 12,
              padding: 16,
              marginTop: 16,
              textAlign: 'center',
              animation: 'pulse-banner 1s infinite',
            }}
          >
            <style>{`
              @keyframes pulse-banner {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.02); }
              }
            `}</style>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
                    fill="white"
                  />
                  <circle cx="12" cy="9" r="2.5" fill="#EC6819" />
                </svg>
              </div>
              <div style={{ textAlign: 'left' }}>
                <p style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: 0 }}>El operador está llegando</p>
                <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: '4px 0 0' }}>Prepárate para recibirlo</p>
              </div>
            </div>
          </div>
        )}

        {activeIncident && (
          <div
            style={{
              background: 'rgba(255, 193, 7, 0.15)',
              border: '1px solid rgba(255, 193, 7, 0.3)',
              borderRadius: 12,
              padding: 16,
              marginTop: 16,
            }}
          >
            <p style={{ color: '#FFC107', fontSize: 14, fontWeight: 900, margin: 0 }}>Incidente reportado</p>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: '8px 0 0', lineHeight: 1.5 }}>
              El operador informó un incidente durante la ruta.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ClientEnRouteScreen;
