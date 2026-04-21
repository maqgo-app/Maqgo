import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { useToast } from '../../components/Toast';
import { playNewRequestSound, playTapSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';

import BACKEND_URL from '../../utils/api';
import { isPerTripMachineryType } from '../../utils/machineryNames';
import { getObject, getJSON } from '../../utils/safeStorage';
import { getProviderLandingPath } from '../../utils/providerOnboardingStatus';

/**
 * Pantalla Home para OPERADORES
 * 
 * UX positiva y empática:
 * - Muestra logros y estadísticas motivadoras
 * - Información clara de trabajos pendientes
 * - Fácil activación de disponibilidad
 * - Sonidos y vibración para feedback
 */
const parseIsoOrNull = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

function OperatorHomeScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const inFlightRef = useRef(false);
  const errorStreakRef = useRef(0);
  const lastErrorLogAtRef = useRef(0);
  const GPS_FRESH_MINUTES = 10;
  const [available, setAvailable] = useState(() => {
    return localStorage.getItem('providerAvailable') === 'true';
  });
  const [ownerName, setOwnerName] = useState(() => {
    const saved = getObject('providerData', {});
    return saved.businessName || '';
  });
  const [stats, setStats] = useState({ completed: 0, pending: 0, rating: 5.0, hoursWorked: 0 });
  const [loading, setLoading] = useState(true);
  const [nextJob, setNextJob] = useState(null);
  const [gpsMeta, setGpsMeta] = useState(() => ({ hasCoords: false, updatedAt: null }));
  const [gpsHelp, setGpsHelp] = useState('');
  const [operatorPhoto, setOperatorPhoto] = useState(() => {
    try {
      return localStorage.getItem('operatorPhoto') || '';
    } catch {
      return '';
    }
  });

  const buildGpsHelpMessage = (err) => {
    if (!navigator.geolocation) {
      return 'Tu dispositivo o navegador no soporta ubicación. Prueba desde Chrome o Safari y permite Ubicación.';
    }
    const code = err?.code;
    if (code === 1) {
      return 'Permiso de ubicación denegado. Activa Ubicación y permite el acceso en los ajustes del navegador para poder recibir servicios.';
    }
    if (code === 2) {
      return 'Ubicación no disponible. Verifica que el GPS esté encendido y que tengas señal/datos.';
    }
    if (code === 3) {
      return 'No se pudo obtener ubicación (timeout). Enciende el GPS y vuelve a intentar.';
    }
    return 'No se pudo obtener tu ubicación. Enciende el GPS y permite ubicación para MAQGO.';
  };

  const captureGpsSnapshot = useCallback(async () => {
    if (!navigator.geolocation) {
      setGpsHelp(buildGpsHelpMessage(null));
      return null;
    }
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 7000 });
      });
      const location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setGpsMeta({ hasCoords: true, updatedAt: new Date() });
      setGpsHelp('');
      return location;
    } catch (err) {
      setGpsMeta((prev) => ({ ...prev, hasCoords: false, updatedAt: null }));
      setGpsHelp(buildGpsHelpMessage(err));
      return null;
    }
  }, []);

  const getGpsBadge = () => {
    if (!available) {
      return { color: '#666', label: 'Servicio inactivo' };
    }
    if (!gpsMeta?.hasCoords) {
      return { color: '#F44336', label: 'GPS apagado' };
    }
    const updatedAt = gpsMeta?.updatedAt;
    if (!updatedAt) {
      return { color: '#F44336', label: 'GPS apagado' };
    }
    const diffMin = (Date.now() - updatedAt.getTime()) / 60000;
    if (diffMin <= GPS_FRESH_MINUTES) {
      return { color: '#4CAF50', label: 'GPS activo' };
    }
    return { color: '#FFA726', label: 'GPS activo (señal débil)' };
  };

  const loadOperatorData = useCallback(async () => {
    try {
      const userId = localStorage.getItem('userId');
      const ownerId = localStorage.getItem('ownerId');
      const isDemoId = userId && (userId.startsWith('provider-') || userId.startsWith('demo-') || userId.startsWith('operator-'));

      // Obtener nombre del dueño
      if (ownerId) {
        try {
          const ownerRes = await axios.get(`${BACKEND_URL}/api/users/${ownerId}`);
          if (ownerRes.data) {
            setOwnerName(ownerRes.data.name || ownerRes.data.providerData?.businessName || 'Mi Empresa');
          }
        } catch {
          const savedProvider = getObject('providerData', {});
          setOwnerName(savedProvider.businessName || 'Transportes Silva SpA');
        }
      } else {
        const savedProvider = getObject('providerData', {});
        setOwnerName(savedProvider.businessName || 'Transportes Silva SpA');
      }

      // Sincronizar disponibilidad desde backend (fuente de verdad) al montar
      if (userId && !isDemoId) {
        try {
          const userRes = await axios.get(`${BACKEND_URL}/api/users/${userId}`, { timeout: 5000 });
          const avail = userRes.data?.isAvailable ?? userRes.data?.available ?? false;
          setAvailable(!!avail);
          localStorage.setItem('providerAvailable', (!!avail).toString());
          const loc = userRes.data?.location;
          const hasCoords = Boolean(loc && typeof loc === 'object' && loc.lat != null && loc.lng != null);
          const updatedAt = parseIsoOrNull(userRes.data?.locationUpdatedAt);
          setGpsMeta({ hasCoords, updatedAt });
        } catch {
          const saved = localStorage.getItem('providerAvailable') === 'true';
          setAvailable(saved);
        }
      } else {
        const saved = localStorage.getItem('providerAvailable') === 'true';
        setAvailable(saved);
      }
      
      // Obtener estadísticas del operador
      if (userId) {
        try {
          const dashRes = await axios.get(`${BACKEND_URL}/api/services/dashboard/${userId}`);
          if (dashRes.data) {
            setStats({
              completed: dashRes.data.completed_services || 0,
              pending: dashRes.data.pending_services || 0,
              rating: dashRes.data.rating || 5.0,
              hoursWorked: dashRes.data.total_hours || 0
            });
          }
        } catch {
          setStats({ completed: 12, pending: 1, rating: 4.8, hoursWorked: 48 });
        }
      }
      
      const savedJob = getJSON('activeServiceRequest', null);
      if (savedJob) setNextJob(savedJob);

      try {
        setOperatorPhoto(localStorage.getItem('operatorPhoto') || '');
      } catch {
        /* ignore */
      }
    } catch (e) {
      console.error('Error loading operator data:', e);
      setOwnerName('Transportes Silva SpA');
      setStats({ completed: 12, pending: 1, rating: 4.8, hoursWorked: 48 });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Polling para verificar solicitudes entrantes
    const checkRequests = async () => {
      const userId = localStorage.getItem('userId');
      if (userId && available) {
        const res = await axios.get(`${BACKEND_URL}/api/service-requests/pending`);
        if (res.data && res.data.length > 0) {
          localStorage.setItem('incomingRequest', JSON.stringify(res.data[0]));
          unlockAudio();
          playNewRequestSound();
          vibrate('newRequest');
          navigate('/provider/request-received');
        }
      }
    };

    if (!available) return undefined;

    let cancelled = false;
    let timeoutId = null;

    const baseDelayMs = 5000;
    const maxDelayMs = 30000;

    const run = async () => {
      if (cancelled) return;

      if (inFlightRef.current) {
        timeoutId = setTimeout(run, 1000);
        return;
      }

      inFlightRef.current = true;
      try {
        await checkRequests();
        errorStreakRef.current = 0;
      } catch (e) {
        const now = Date.now();
        if (now - lastErrorLogAtRef.current > 60000) {
          if (import.meta.env.DEV) {
            console.warn('OperatorHomeScreen poll error:', e?.message || e);
          }
          lastErrorLogAtRef.current = now;
        }
        errorStreakRef.current += 1;
      } finally {
        inFlightRef.current = false;
        const delay = Math.min(
          maxDelayMs,
          baseDelayMs * (2 ** errorStreakRef.current)
        );
        timeoutId = setTimeout(run, delay);
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [available, navigate]);

  useEffect(() => {
    loadOperatorData();
  }, [loadOperatorData]);

  const toggleAvailability = async () => {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      toast.error('Sesión no encontrada. Vuelve a ingresar con tu código.');
      return;
    }

    const newStatus = !available;
    setAvailable(newStatus);
    localStorage.setItem('providerAvailable', newStatus.toString());
    if (!newStatus) {
      setGpsHelp('');
      setGpsMeta({ hasCoords: false, updatedAt: null });
    }
    
    // Sonido y vibración de feedback
    unlockAudio();
    playTapSound();
    vibrate(newStatus ? 'accepted' : 'tap');
    
    // Modo demo: IDs de fallback cuando el backend no responde
    const isDemoId = userId.startsWith('provider-') || userId.startsWith('demo-') || userId.startsWith('operator-');
    if (isDemoId) {
      toast.success(newStatus ? 'Te conectaste (modo demo)' : 'Te desconectaste');
      return;
    }

    try {
      let location = null;
      if (newStatus) location = await captureGpsSnapshot();

      await axios.put(
        `${BACKEND_URL}/api/users/${userId}/availability`,
        { isAvailable: newStatus, ...(location ? { location } : {}) },
        { timeout: 8000 }
      );
      toast.success(newStatus ? 'Te conectaste' : 'Te desconectaste');
    } catch (e) {
      console.error(e);
      const isNetwork = !e.response || e.code === 'ECONNABORTED' || e.code === 'ERR_NETWORK' || e.message?.includes('Network Error');
      if (e.response?.status === 404) {
        setAvailable(!newStatus);
        localStorage.setItem('providerAvailable', (!newStatus).toString());
        toast.error('Tu sesión expiró. Vuelve a ingresar con tu código.');
      } else if (isNetwork) {
        toast.error('Sin conexión. La disponibilidad se guardó localmente.');
      } else {
        setAvailable(!newStatus);
        localStorage.setItem('providerAvailable', (!newStatus).toString());
        toast.error('No se pudo conectar. Intenta de nuevo.');
      }
    }
  };

  const handleRetryGps = async () => {
    const userId = localStorage.getItem('userId');
    if (!userId) return;
    if (!available) return;
    const location = await captureGpsSnapshot();
    if (!location) return;
    try {
      await axios.put(
        `${BACKEND_URL}/api/users/${userId}/availability`,
        { isAvailable: true, location },
        { timeout: 8000 }
      );
      toast.success('GPS actualizado');
    } catch {
      toast.error('No se pudo actualizar el GPS. Intenta de nuevo.');
    }
  };

  // Demo: simular solicitud entrante
  const simulateRequest = () => {
    const machineData = getObject('machineData', {});
    const machineryType = machineData.machineryType || 'retroexcavadora';
    
    const MACHINERY_NAMES = {
      'retroexcavadora': 'Retroexcavadora',
      'camion_tolva': 'Camión Tolva',
      'excavadora': 'Excavadora Hidráulica',
      'bulldozer': 'Bulldozer',
      'motoniveladora': 'Motoniveladora',
      'grua': 'Grúa Móvil',
      'camion_pluma': 'Camión Pluma',
      'compactadora': 'Compactadora',
      'camion_aljibe': 'Camión Aljibe',
      'minicargador': 'Minicargador'
    };
    
    // Vibrar al recibir
    // ¡Sonido y vibración de nueva solicitud!
    playNewRequestSound();
    vibrate('newRequest');
    
    const serviceLat = parseFloat(localStorage.getItem('serviceLat'));
    const serviceLng = parseFloat(localStorage.getItem('serviceLng'));
    const serviceLocation = localStorage.getItem('serviceLocation') || 'Av. Providencia 1234, Santiago';
    const workCoords = (Number.isFinite(serviceLat) && Number.isFinite(serviceLng))
      ? { lat: serviceLat, lng: serviceLng } : null;
    const clientPhone = localStorage.getItem('userPhone') || '+56987654321';
    localStorage.setItem('incomingRequest', JSON.stringify({
      id: `req-${Date.now()}`,
      machineryType: MACHINERY_NAMES[machineryType] || machineryType,
      machineryId: machineryType,
      location: serviceLocation,
      hours: 4,
      clientName: 'Carlos González',
      clientPhone,
      clientRating: 4.7,
      pricePerHour: 80000,
      transportFee: 35000,
      distance: 5.2,
      eta: 10,
      reservationType: 'immediate',
      client_lat: workCoords?.lat,
      client_lng: workCoords?.lng,
      workCoords
    }));
    navigate('/provider/request-received');
  };

  // Renderizar estrellas de rating
  const renderStars = (rating) => {
    return (
      <div style={{ display: 'flex', gap: 2 }}>
        {[1, 2, 3, 4, 5].map(star => (
          <svg key={star} width="16" height="16" viewBox="0 0 24 24" 
            fill={star <= rating ? '#FFD700' : '#444'}>
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
          </svg>
        ))}
      </div>
    );
  };

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div className="maqgo-screen" style={{ paddingBottom: 80, justifyContent: 'flex-start' }}>
        {/* Header con logo */}
        <MaqgoLogo size="small" style={{ marginBottom: 16, marginTop: 20 }} />

        {/* Info de la empresa - más amigable */}
        <div style={{
          background: '#2A2A2A',
          borderRadius: 14,
          padding: 16,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: operatorPhoto ? 'transparent' : 'linear-gradient(135deg, #EC6819 0%, #d45a10 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {operatorPhoto ? (
              <img
                src={operatorPhoto}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ fontSize: 22 }}>🚜</span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: '0 0 2px' }}>
              Empresa
            </p>
            <p style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: 0 }}>
              {loading ? '...' : ownerName}
            </p>
          </div>
          {renderStars(Math.round(stats.rating))}
        </div>

        {/* Toggle de disponibilidad - más grande y claro */}
        <div style={{
          background: available ? 'rgba(76, 175, 80, 0.1)' : '#363636',
          borderRadius: 20,
          padding: 24,
          marginBottom: 16,
          textAlign: 'center',
          border: available ? '2px solid #4CAF50' : '2px solid transparent',
          transition: 'all 0.3s ease'
        }}>
          <button
            onClick={toggleAvailability}
            style={{
              width: 90,
              height: 90,
              borderRadius: '50%',
              border: 'none',
              background: available ? '#4CAF50' : '#555',
              cursor: 'pointer',
              transition: 'all 0.3s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px',
              boxShadow: available ? '0 0 30px rgba(76, 175, 80, 0.4)' : 'none'
            }}
            data-testid="operator-availability-toggle"
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <path 
                d="M13 3L4 14H12L11 21L20 10H12L13 3Z" 
                fill="#fff" 
                stroke="#fff" 
                strokeWidth="1"
              />
            </svg>
          </button>
          
          <p style={{ 
            color: available ? '#4CAF50' : '#888', 
            fontSize: 22, 
            margin: 0,
            fontWeight: 700,
            marginBottom: 4
          }}>
            {available ? '¡Estás Activo!' : 'Desconectado'}
          </p>
          <p style={{ 
            color: 'rgba(255,255,255,0.95)', 
            fontSize: 13, 
            margin: 0 
          }}>
            {available ? 'Recibirás solicitudes de trabajo' : 'Toca para activarte'}
          </p>
          {(() => {
            const badge = getGpsBadge();
            return (
              <div
                style={{
                  marginTop: 10,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: badge.color,
                    boxShadow: `0 0 0 3px ${badge.color}22`,
                  }}
                />
                <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, fontWeight: 600 }}>
                  {badge.label}
                </span>
              </div>
            );
          })()}
          {available && gpsHelp ? (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 12,
                background: 'rgba(244, 67, 54, 0.12)',
                border: '1px solid rgba(244, 67, 54, 0.35)',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, margin: 0, lineHeight: 1.35 }}>
                  {gpsHelp}
                </p>
                <button
                  type="button"
                  onClick={handleRetryGps}
                  style={{
                    flexShrink: 0,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: '#EC6819',
                    border: 'none',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Reintentar GPS
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Stats motivacionales */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          marginBottom: 16
        }}>
          <div style={{
            background: '#2A2A2A',
            borderRadius: 12,
            padding: 14,
            textAlign: 'center'
          }}>
            <p style={{ 
              color: '#4CAF50', 
              fontSize: 24, 
              fontWeight: 700, 
              margin: 0,
              fontFamily: "'JetBrains Mono', monospace"
            }}>
              {stats.completed}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: '4px 0 0' }}>
              Completados
            </p>
          </div>
          <div style={{
            background: '#2A2A2A',
            borderRadius: 12,
            padding: 14,
            textAlign: 'center'
          }}>
            <p style={{ 
              color: '#90BDD3', 
              fontSize: 24, 
              fontWeight: 700, 
              margin: 0,
              fontFamily: "'JetBrains Mono', monospace"
            }}>
              {stats.hoursWorked}h
            </p>
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: '4px 0 0' }}>
              Trabajadas
            </p>
          </div>
          <div style={{
            background: '#2A2A2A',
            borderRadius: 12,
            padding: 14,
            textAlign: 'center'
          }}>
            <p style={{ 
              color: '#FFD700', 
              fontSize: 24, 
              fontWeight: 700, 
              margin: 0,
              fontFamily: "'JetBrains Mono', monospace"
            }}>
              {stats.rating.toFixed(1)}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: '4px 0 0' }}>
              Rating
            </p>
          </div>
        </div>

        {/* Mensaje motivacional cuando está activo */}
        {available && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(236, 104, 25, 0.15) 0%, rgba(236, 104, 25, 0.05) 100%)',
            borderRadius: 12,
            padding: 14,
            marginBottom: 16,
            textAlign: 'center',
            border: '1px solid rgba(236, 104, 25, 0.3)'
          }}>
            <p style={{ color: '#EC6819', fontSize: 14, fontWeight: 600, margin: 0 }}>
              Las solicitudes llegan automáticamente
            </p>
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, margin: '6px 0 0' }}>
              Mantente cerca de tu máquina y listo para partir
            </p>
          </div>
        )}

        {/* Próximo trabajo si existe */}
        {nextJob && (
          <div style={{
            background: '#2A2A2A',
            borderRadius: 14,
            padding: 16,
            marginBottom: 16,
            borderLeft: '4px solid #90BDD3'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 16 }}>📍</span>
              <p style={{ color: '#90BDD3', fontSize: 12, fontWeight: 600, margin: 0, textTransform: 'uppercase' }}>
                Próximo trabajo
              </p>
            </div>
            <p style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: '0 0 6px' }}>
              {nextJob.machineryType} · {isPerTripMachineryType(nextJob.machinery_type || nextJob.machineryType) ? 'Valor viaje' : `${nextJob.hours}h`}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: 0 }}>
              {nextJob.location}
            </p>
          </div>
        )}

        <div style={{ flex: 1 }}></div>

        {/* Botón demo: oculto en producción live */}
        {import.meta.env.VITE_IS_PRODUCTION !== 'true' && (
          <button 
            className="maqgo-btn-primary"
            onClick={simulateRequest}
            style={{ marginBottom: 12 }}
            data-testid="simulate-request-operator"
          >
            Simular solicitud (Demo)
          </button>
        )}

        <button 
          onClick={() => navigate('/operator/history')}
          style={{
            width: '100%',
            padding: 16,
            background: 'transparent',
            border: '2px solid rgba(255,255,255,0.2)',
            borderRadius: 30,
            color: '#fff',
            fontSize: 15,
            cursor: 'pointer',
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <path d="M16 2v4M8 2v4M3 10h18"/>
          </svg>
          Ver mis trabajos
        </button>

        {/* Botón para volver a vista de Dueño (Demo) - más sutil */}
        <button 
          onClick={() => {
            localStorage.setItem('providerRole', 'owner');
            navigate(getProviderLandingPath());
          }}
          style={{
            width: '100%',
            padding: 12,
            background: 'transparent',
            border: 'none',
            borderRadius: 30,
            color: 'rgba(255,255,255,0.9)',
            fontSize: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6
          }}
          data-testid="back-to-owner-btn"
        >
          <BackArrowIcon size={14} />
          Cambiar a vista Dueño
        </button>
      </div>
    </div>
  );
}

export default OperatorHomeScreen;
