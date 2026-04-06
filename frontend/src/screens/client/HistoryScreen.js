import React, { useState, useEffect } from 'react';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { useNavigate } from 'react-router-dom';
import { maskName, maskLocation } from '../../utils/privacy';
import { getOperatorDisplayNameFromRecord, getOperatorRutFromRecord } from '../../utils/providerDisplay';
import { MACHINERY_NAMES, isPerTripMachineryType } from '../../utils/machineryNames';
import { getArray } from '../../utils/safeStorage';
import { applyRepeatBookingFromHistory } from '../../utils/repeatBookingFromHistory';
import { getProviderLandingPath } from '../../utils/providerOnboardingStatus';

/**
 * Producción (Vite `import.meta.env.PROD`): NUNCA datos demo — lista vacía si no hay `serviceHistory`.
 * Demo solo en `npm run dev` (`import.meta.env.DEV`). No usar env para activar demo en build release.
 */
const SHOW_HISTORY_DEMO = Boolean(import.meta.env.DEV);

const DEMO_SERVICES_PROVIDER = [
  {
    id: 'hist-demo-p1',
    date: '2024-12-28',
    machinery: 'retroexcavadora',
    clientName: 'Carlos González',
    clientRating: 4.8,
    hours: 4,
    earnings: 168407,
    status: 'completed',
    myRating: 5,
    location: 'Av. Providencia 1234'
  },
  {
    id: 'hist-demo-p2',
    date: '2024-12-20',
    machinery: 'retroexcavadora',
    clientName: 'María Fernández',
    clientRating: 4.5,
    hours: 6,
    earnings: 235000,
    status: 'completed',
    myRating: 4,
    location: 'Las Condes 567'
  },
  {
    id: 'hist-demo-p3',
    date: '2024-12-15',
    machinery: 'retroexcavadora',
    clientName: 'Juan Pérez',
    clientRating: 3.9,
    hours: 8,
    earnings: 0,
    status: 'cancelled',
    location: 'Vitacura 890'
  }
];

const DEMO_SERVICES_CLIENT = [
  {
    id: 'hist-demo-c1',
    date: '2024-12-28',
    machinery: 'retroexcavadora',
    operatorName: 'Carlos Silva',
    operatorRut: '18.765.432-1',
    operatorRating: 4.8,
    hours: 4,
    total: 241593,
    status: 'completed',
    myRating: 5,
    location: 'Av. Providencia 1234',
    reservationType: 'immediate',
    priceType: 'hour',
    serviceLat: -33.4372,
    serviceLng: -70.6506,
    serviceComuna: 'Providencia',
  },
  {
    id: 'hist-demo-c2',
    date: '2025-02-10',
    machinery: 'camion_tolva',
    operatorName: 'Pedro Muñoz',
    operatorRut: '15.432.109-8',
    operatorRating: 4.6,
    hours: 6,
    total: 312000,
    status: 'completed',
    myRating: 4,
    location: 'Avenida Las Condes 567',
    reservationType: 'scheduled',
    priceType: 'trip',
    selectedDates: ['2025-02-10T12:00:00.000Z'],
    serviceLat: -33.4089,
    serviceLng: -70.5708,
    serviceComuna: 'Las Condes',
  },
  {
    id: 'hist-demo-c3',
    date: '2024-12-15',
    machinery: 'excavadora',
    operatorName: 'Jorge Ramírez',
    operatorRut: '12.345.678-5',
    operatorRating: 4.2,
    hours: 8,
    total: 0,
    status: 'cancelled',
    location: 'Vitacura 890',
    reservationType: 'immediate',
    priceType: 'hour',
    serviceLat: -33.383,
    serviceLng: -70.583,
    serviceComuna: 'Vitacura',
  }
];

/**
 * Pantalla de Historial de Servicios
 * - Cliente: Ve proveedores que le prestaron servicio
 * - Proveedor: Ve clientes a quienes prestó servicio
 * SIN información de contacto para evitar bypass de la plataforma
 * 
 * REGLA MVP: Cuando servicio está facturado/pagado, anonimizar completamente
 */

function HistoryScreen() {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [activeTab, setActiveTab] = useState('completed');
  
  // Detectar si es cliente o proveedor
  const userRole = localStorage.getItem('userRole') || 'client';
  const isProvider = userRole === 'provider';

  useEffect(() => {
    const saved = getArray('serviceHistory', []);
    if (saved.length > 0) {
      setServices(saved);
      return;
    }
    if (SHOW_HISTORY_DEMO) {
      setServices(isProvider ? DEMO_SERVICES_PROVIDER : DEMO_SERVICES_CLIENT);
      return;
    }
    setServices([]);
  }, [isProvider]);

  const formatPrice = (price) => {
    return new Intl.NumberFormat('es-CL', { 
      style: 'currency', 
      currency: 'CLP',
      maximumFractionDigits: 0 
    }).format(price);
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const handleRepeat = (service) => {
    if (isProvider) return;
    applyRepeatBookingFromHistory(service);
    navigate('/client/providers');
  };

  const filteredServices = services.filter(s => 
    activeTab === 'completed' ? s.status === 'completed' : s.status === 'cancelled'
  );

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 20px 90px' }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          marginBottom: 25
        }}>
          <button 
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            aria-label="Volver"
          >
            <BackArrowIcon style={{ color: '#fff' }} />
          </button>
          <h1 className="maqgo-h1" style={{ flex: 1, textAlign: 'center', margin: 0 }}>
            {isProvider ? 'Mis Trabajos' : 'Mi Historial'}
          </h1>
          

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: 10,
          marginBottom: 20
        }}>
          <button
            onClick={() => setActiveTab('completed')}
            style={{
              flex: 1,
              padding: '10px 16px',
              background: activeTab === 'completed' ? '#EC6819' : '#363636',
              border: 'none',
              borderRadius: 10,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Completados
          </button>
          <button
            onClick={() => setActiveTab('cancelled')}
            style={{
              flex: 1,
              padding: '10px 16px',
              background: activeTab === 'cancelled' ? '#EC6819' : '#363636',
              border: 'none',
              borderRadius: 10,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Cancelados
          </button>
        </div>

        {/* Lista de servicios */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredServices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{
                width: 70,
                height: 70,
                borderRadius: '50%',
                background: '#363636',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2"/>
                  <path d="M16 2v4M8 2v4M3 10h18"/>
                </svg>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 15, margin: '0 0 4px' }}>
                No tienes {isProvider ? 'trabajos' : 'reservas'} {activeTab === 'completed' ? 'completadas' : 'canceladas'}
              </p>
              {activeTab === 'completed' && !isProvider && (
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: '0 0 20px' }}>
                  Cuando hagas y completes una reserva aparecerá aquí.
                </p>
              )}
              {activeTab === 'completed' && isProvider && (
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: '0 0 20px' }}>
                  Cuando completes servicios aparecerán en esta lista.
                </p>
              )}
              {!isProvider && activeTab === 'completed' && (
                <button
                  type="button"
                  className="maqgo-btn-primary"
                  onClick={() => navigate('/client/home')}
                  style={{ maxWidth: 280 }}
                >
                  Reservar maquinaria
                </button>
              )}
              {isProvider && (
                <button
                  type="button"
                  className="maqgo-btn-primary"
                  onClick={() => navigate(getProviderLandingPath())}
                  style={{ maxWidth: 280 }}
                >
                  Ir al inicio
                </button>
              )}
            </div>
          ) : (
            filteredServices.map(service => (
              <div 
                key={service.id}
                style={{
                  background: '#363636',
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 12
                }}
              >
                {/* Header del servicio */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 10
                }}>
                  <div>
                    <p style={{ color: '#EC6819', fontSize: 15, fontWeight: 600, margin: 0 }}>
                      {MACHINERY_NAMES[service.machinery] || service.machinery}
                    </p>
                    <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, margin: '4px 0 0' }}>
                      {formatDate(service.date)} · {isPerTripMachineryType(service.machinery) ? 'Valor viaje' : `${service.hours} horas`}
                    </p>
                  </div>
                  <span style={{
                    background: service.status === 'completed' ? 'rgba(144, 189, 211, 0.2)' : 'rgba(255, 107, 107, 0.2)',
                    color: service.status === 'completed' ? '#90BDD3' : '#ff6b6b',
                    fontSize: 13,
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: 12
                  }}>
                    {service.status === 'completed' ? 'Completado' : 'Cancelado'}
                  </span>
                </div>

                {/* Detalles - diferentes según rol */}
                <div style={{ 
                  background: '#2D2D2D', 
                  borderRadius: 8, 
                  padding: 10,
                  marginBottom: 10
                }}>
                  {/* Cliente: operador (nombre + RUT para registro en obra), sin nombre de empresa del proveedor.
                      Proveedor: cliente anonimizado */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>
                      {isProvider ? 'Cliente' : 'Operador'}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#fff', fontSize: 12, textAlign: 'right' }}>
                        {isProvider ? maskName(service.clientName) : getOperatorDisplayNameFromRecord(service)}
                      </span>
                      {/* Rating de la contraparte */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="#EC6819">
                          <path d="M5 0.5L6 3.5H9L6.5 5.5L7.5 8.5L5 6.5L2.5 8.5L3.5 5.5L1 3.5H4L5 0.5Z"/>
                        </svg>
                        <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>
                          {isProvider ? service.clientRating : service.operatorRating}
                        </span>
                      </div>
                    </div>
                  </div>
                  {!isProvider && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>RUT operador</span>
                      <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>
                        {getOperatorRutFromRecord(service) || 'Por confirmar'}
                      </span>
                    </div>
                  )}
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>Ubicación</span>
                    <span style={{ color: '#fff', fontSize: 12, maxWidth: '60%', textAlign: 'right' }}>
                      {maskLocation(service.location)}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>
                      {isProvider ? 'Ganancia neta' : 'Total pagado'}
                    </span>
                    <span style={{ 
                      color: isProvider ? '#90BDD3' : '#EC6819', 
                      fontSize: 13, 
                      fontWeight: 600 
                    }}>
                      {formatPrice(isProvider ? service.earnings : service.total)}
                    </span>
                  </div>
                </div>

                {/* Rating dado y acciones */}
                {service.status === 'completed' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {/* Mi calificación */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13 }}>Mi calificación:</span>
                      <div style={{ display: 'flex', gap: 2 }}>
                        {[1, 2, 3, 4, 5].map(star => (
                          <svg key={star} width="14" height="14" viewBox="0 0 14 14" fill={star <= service.myRating ? '#EC6819' : '#444'}>
                            <path d="M7 1L8.5 4.5H12.5L9.5 7L10.5 11L7 8.5L3.5 11L4.5 7L1.5 4.5H5.5L7 1Z"/>
                          </svg>
                        ))}
                      </div>
                    </div>
                    
                    {/* Botón repetir - SOLO para clientes */}
                    {!isProvider && (
                      <button
                        onClick={() => handleRepeat(service)}
                        style={{
                          background: 'transparent',
                          border: '1px solid #EC6819',
                          borderRadius: 8,
                          padding: '6px 14px',
                          color: '#EC6819',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 4v6h6M23 20v-6h-6"/>
                          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                        </svg>
                        Repetir
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Aviso de contacto via plataforma */}
        <div style={{
          background: 'rgba(236, 104, 25, 0.1)',
          border: '1px solid rgba(236, 104, 25, 0.3)',
          borderRadius: 10,
          padding: 12,
          marginTop: 12,
          marginBottom: 12
        }}>
          <p style={{ 
            color: 'rgba(255,255,255,0.95)', 
            fontSize: 13, 
            margin: 0,
            textAlign: 'center',
            lineHeight: 1.4
          }}>
            📱 Para cualquier consulta o reclamo, contacta a través de la app. 
            MAQGO es tu canal de comunicación seguro.
          </p>
        </div>

        {/* Botón según rol */}
        <button 
          className="maqgo-btn-primary"
          onClick={() => navigate(isProvider ? getProviderLandingPath() : '/client/home')}
          style={{ marginTop: 8 }}
        >
          {isProvider ? 'Volver al inicio' : 'Nuevo arriendo'}
        </button>
      </div>
    </div>
  );
}

export default HistoryScreen;
