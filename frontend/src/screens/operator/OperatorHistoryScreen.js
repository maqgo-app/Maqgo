import React, { useState, useEffect } from 'react';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { useNavigate } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import { fetchWithAuth } from '../../utils/api';

import BACKEND_URL from '../../utils/api';
import { MACHINERY_NAMES, isPerTripMachineryType } from '../../utils/machineryNames';

/**
 * Historial de trabajos para OPERADORES
 * 
 * Muestra información operacional útil:
 * - Fecha y hora del trabajo
 * - Ubicación
 * - Tipo de maquinaria y duración
 * - Estado del servicio
 * - Rating obtenido
 */

const STATUS_CONFIG = {
  pending: { label: 'Pendiente', color: '#FFA726', icon: '⏳' },
  accepted: { label: 'Aceptado', color: '#90BDD3', icon: '✓' },
  en_route: { label: 'En camino', color: '#2196F3', icon: '🚛' },
  arrived: { label: 'En sitio', color: '#9C27B0', icon: '📍' },
  in_progress: { label: 'Trabajando', color: '#4CAF50', icon: '⚙️' },
  completed: { label: 'Completado', color: '#4CAF50', icon: '✅' },
  paid: { label: 'Completado', color: '#4CAF50', icon: '✅' },
  cancelled: { label: 'Cancelado', color: '#F44336', icon: '✗' }
};

function OperatorHistoryScreen() {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ completed: 0, hours: 0 });

  async function fetchServices() {
    try {
      const operatorId = localStorage.getItem('userId');
      const response = await fetchWithAuth(`${BACKEND_URL}/api/services/provider/${operatorId}?user_role=operator`);
      const data = await response.json();
      const serviceList = data.services || [];
      setServices(serviceList);
      
      // Calcular estadísticas
      const completed = serviceList.filter(s => ['completed', 'paid'].includes(s.status)).length;
      const totalHours = serviceList.reduce((sum, s) => sum + (s.hours || 0), 0);
      setStats({ completed, hours: totalHours });
    } catch (error) {
      console.error('Error fetching services:', error);
      // Demo data
      setServices([
        {
          _id: 'demo-1',
          status: 'completed',
          client_name: 'Carlos G.',
          machinery_type: 'retroexcavadora',
          hours: 4,
          location: 'Av. Providencia 1234, Santiago',
          created_at: new Date().toISOString(),
          rating: 5
        },
        {
          _id: 'demo-2',
          status: 'en_route',
          client_name: 'María L.',
          machinery_type: 'excavadora',
          hours: 6,
          location: 'Las Condes, Av. Kennedy 5000',
          created_at: new Date(Date.now() - 86400000).toISOString()
        }
      ]);
      setStats({ completed: 1, hours: 10 });
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchServices();
  }, []);

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    const isYesterday = date.toDateString() === new Date(today - 86400000).toDateString();
    
    if (isToday) return `Hoy ${date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`;
    if (isYesterday) return `Ayer ${date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`;
    
    return date.toLocaleDateString('es-CL', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div
        className="maqgo-screen maqgo-screen--scroll"
        style={{ padding: 24, paddingBottom: 100 }}
      >
      <div style={{ maxWidth: 500, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <button 
            onClick={() => navigate('/operator/home')}
            style={{ background: 'none', border: 'none', padding: 8, cursor: 'pointer' }}
          >
            <BackArrowIcon style={{ color: '#fff' }} />
          </button>
          <h1 className="maqgo-h1" style={{ 
            flex: 1, 
            textAlign: 'center'
          }}>
            Mis Trabajos
          </h1>
          <div style={{ width: 40 }}></div>
        </div>

        {/* Stats del operador */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          marginBottom: 20
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #4CAF50 0%, #388E3C 100%)',
            borderRadius: 12,
            padding: 16,
            textAlign: 'center'
          }}>
            <p style={{ color: '#fff', fontSize: 28, fontWeight: 700, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
              {stats.completed}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, margin: '4px 0 0' }}>
              Trabajos completados
            </p>
          </div>
          <div style={{
            background: '#2A2A2A',
            borderRadius: 12,
            padding: 16,
            textAlign: 'center'
          }}>
            <p style={{ color: '#90BDD3', fontSize: 28, fontWeight: 700, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
              {stats.hours}h
            </p>
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, margin: '4px 0 0' }}>
              Horas trabajadas
            </p>
          </div>
        </div>

        {/* Lista de servicios */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <span style={{ width: 32, height: 32, border: '3px solid rgba(236,104,25,0.3)', borderTopColor: '#EC6819', borderRadius: '50%', animation: 'maqgo-spin 0.8s linear infinite' }} />
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14 }}>Cargando historial...</p>
          </div>
        ) : services.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🚜</div>
            <p style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>
              ¡Listo para tu primer trabajo!
            </p>
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14 }}>
              Activa tu disponibilidad y las solicitudes llegarán aquí
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {services.map(service => {
              const status = STATUS_CONFIG[service.status] || STATUS_CONFIG.pending;
              
              return (
                <div 
                  key={service._id}
                  style={{
                    background: '#2A2A2A',
                    borderRadius: 14,
                    padding: 16,
                    borderLeft: `4px solid ${status.color}`
                  }}
                >
                  {/* Header: Tipo + Estado */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: '#363636',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <span style={{ fontSize: 20 }}>🚜</span>
                      </div>
                      <div>
                        <p style={{ 
                          color: '#fff', 
                          fontSize: 15, 
                          fontWeight: 600, 
                          margin: 0,
                          fontFamily: "'Space Grotesk', sans-serif"
                        }}>
                          {MACHINERY_NAMES[service.machinery_type] || service.machinery_type}
                        </p>
                        <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, margin: '2px 0 0' }}>
                          {isPerTripMachineryType(service.machinery_type || service.machineryType) ? 'Valor viaje' : `${service.hours} horas`}
                        </p>
                      </div>
                    </div>
                    <div style={{
                      background: `${status.color}20`,
                      padding: '6px 12px',
                      borderRadius: 20,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      <span style={{ fontSize: 12 }}>{status.icon}</span>
                      <span style={{ color: status.color, fontSize: 12, fontWeight: 600 }}>
                        {status.label}
                      </span>
                    </div>
                  </div>

                  {/* Ubicación */}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'flex-start', 
                    gap: 8, 
                    marginBottom: 10,
                    padding: '10px 12px',
                    background: '#363636',
                    borderRadius: 8
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginTop: 2, flexShrink: 0 }}>
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="#EC6819" strokeWidth="2"/>
                      <circle cx="12" cy="9" r="2.5" stroke="#EC6819" strokeWidth="2"/>
                    </svg>
                    <p style={{ color: '#fff', fontSize: 13, margin: 0, lineHeight: 1.4 }}>
                      {service.location}
                    </p>
                  </div>

                  {/* Fecha y Rating */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, margin: 0 }}>
                      {formatDate(service.created_at)}
                    </p>
                    {service.rating && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFD700">
                          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                        </svg>
                        <span style={{ color: '#FFD700', fontSize: 13, fontWeight: 600 }}>
                          {service.rating.toFixed(1)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

export default OperatorHistoryScreen;
