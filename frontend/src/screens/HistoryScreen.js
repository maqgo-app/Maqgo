import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getMachineryId } from '../utils/machineryNames';
import { MACHINERY_PER_TRIP } from '../utils/pricing';

/**
 * Pantalla de Historial (compartida)
 */
function HistoryScreen() {
  const navigate = useNavigate();
  const userRole = localStorage.getItem('userRole');

  // Demo: servicios de ejemplo
  const services = [
    {
      id: 1,
      date: '28 Dic 2024',
      machinery: 'Retroexcavadora',
      hours: 4,
      amount: 180000,
      status: 'completed'
    },
    {
      id: 2,
      date: '25 Dic 2024',
      machinery: 'Camión Tolva',
      hours: 6,
      amount: 240000,
      status: 'completed'
    }
  ];

  const formatMoney = (amount) => {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);
  };

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 30px' }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          marginBottom: 30
        }}>
          <button 
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <span style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>Historial</span>
          </div>
          <div style={{ width: 24 }}></div>
        </div>

        {/* Lista de servicios */}
        {services.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 16 }}>
              No tienes servicios en tu historial
            </p>
          </div>
        ) : (
          <div>
            {services.map((service) => (
              <div 
                key={service.id}
                style={{
                  background: '#363636',
                  borderRadius: 14,
                  padding: 18,
                  marginBottom: 12
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>
                    {service.machinery}
                  </span>
                  <span style={{ 
                    color: '#4CAF50', 
                    fontSize: 12, 
                    fontWeight: 600,
                    background: 'rgba(76, 175, 80, 0.2)',
                    padding: '4px 10px',
                    borderRadius: 10
                  }}>
                    Completado
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14 }}>
                    {service.date}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14 }}>
                    {MACHINERY_PER_TRIP.includes(getMachineryId(service.machinery)) ? 'Valor viaje' : `${service.hours} horas`}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14 }}>
                    {userRole === 'provider' ? 'Ganancia' : 'Total pagado'}
                  </span>
                  <span style={{ color: '#EC6819', fontSize: 16, fontWeight: 700 }}>
                    {formatMoney(service.amount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default HistoryScreen;
