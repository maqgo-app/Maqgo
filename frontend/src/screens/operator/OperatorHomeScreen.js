import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import { useToast } from '../../components/Toast';
import { playNewRequestSound, playTapSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';

import BACKEND_URL from '../../utils/api';
import { getMachineryId } from '../../utils/machineryNames';
import { MACHINERY_PER_TRIP } from '../../utils/pricing';
import { getObject, getJSON } from '../../utils/safeStorage';

/**
 * Pantalla Home para OPERADORES
 * 
 * UX positiva y empática:
 * - Muestra logros y estadísticas motivadoras
 * - Información clara de trabajos pendientes
 * - Fácil activación de disponibilidad
 * - Sonidos y vibración para feedback
 */
function OperatorHomeScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const [available, setAvailable] = useState(() => {
    return localStorage.getItem('providerAvailable') === 'true';
  });
  const [ownerName, setOwnerName] = useState('');
  const [stats, setStats] = useState({ completed: 0, pending: 0, rating: 5.0, hoursWorked: 0 });
  const [loading, setLoading] = useState(true);
  const [nextJob, setNextJob] = useState(null);

  useEffect(() => {
    loadOperatorData();
  }, []);

  const loadOperatorData = async () => {
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
        } catch (e) {
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
        } catch (e) {
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
        } catch (e) {
          setStats({ completed: 12, pending: 1, rating: 4.8, hoursWorked: 48 });
        }
      }
      
      const savedJob = getJSON('activeServiceRequest', null);
      if (savedJob) setNextJob(savedJob);
    } catch (e) {
      console.error('Error loading operator data:', e);
      setOwnerName('Transportes Silva SpA');
      setStats({ completed: 12, pending: 1, rating: 4.8, hoursWorked: 48 });
    }
    setLoading(false);
  };

  useEffect(() => {
    // Polling para verificar solicitudes entrantes
    const checkRequests = async () => {
      try {
        const userId = localStorage.getItem('userId');
        if (userId && available) {
          const res = await axios.get(`${BACKEND_URL}/api/service-requests/pending?providerId=${userId}`);
          if (res.data && res.data.length > 0) {
            localStorage.setItem('incomingRequest', JSON.stringify(res.data[0]));
            // ¡Sonido y vibración de nueva solicitud!
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
  }, [available, navigate]);

  const toggleAvailability = async () => {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      toast.error('Sesión no encontrada. Vuelve a ingresar con tu código.');
      return;
    }

    const newStatus = !available;
    setAvailable(newStatus);
    localStorage.setItem('providerAvailable', newStatus.toString());
    
    // Sonido y vibración de feedback
    unlockAudio();
    playTapSound();
    vibrate(newStatus ? 'accepted' : 'tap');
    
    // Modo demo: IDs de fallback cuando el backend no responde
    const isDemoId = userId.startsWith('provider-') || userId.startsWith('demo-');
    if (isDemoId) {
      toast.success(newStatus ? 'Te conectaste (modo demo)' : 'Te desconectaste');
      return;
    }

    try {
      await axios.patch(`${BACKEND_URL}/api/users/${userId}`, {
        available: newStatus
      }, { timeout: 8000 });
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
    <div className="maqgo-app">
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
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'linear-gradient(135deg, #EC6819 0%, #d45a10 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{ fontSize: 22 }}>🚜</span>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 11, margin: '0 0 2px' }}>
              Equipo
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
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 11, margin: '4px 0 0' }}>
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
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 11, margin: '4px 0 0' }}>
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
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 11, margin: '4px 0 0' }}>
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
              {nextJob.machineryType} · {MACHINERY_PER_TRIP.includes(getMachineryId(nextJob.machinery_type || nextJob.machineryType)) ? 'Valor viaje' : `${nextJob.hours}h`}
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
            navigate('/provider/home');
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18L9 12L15 6"/>
          </svg>
          Cambiar a vista Dueño
        </button>
      </div>
    </div>
  );
}

export default OperatorHomeScreen;
