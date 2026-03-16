import React from 'react';

/**
 * Componente: Línea de progreso de servicio
 * Estados: finalizado → aprobado → facturado → pagado
 */
const ServiceProgress = ({ status, approvalTime, paymentDate }) => {
  const STATES = [
    { key: 'finished', label: 'Finalizado' },
    { key: 'approved', label: 'Aprobado' },
    { key: 'invoiced', label: 'Facturado' },
    { key: 'paid', label: 'Pagado' }
  ];

  const getStateIndex = (status) => {
    switch (status) {
      case 'finished':
      case 'pending_review': return 0;
      case 'approved': return 1;
      case 'invoiced': return 2;
      case 'paid': return 3;
      default: return 0;
    }
  };

  const currentIndex = getStateIndex(status);

  const getStatusMessage = () => {
    switch (status) {
      case 'finished':
      case 'pending_review':
        return { text: `Aprobación automática en ${approvalTime || '24h'}`, color: '#90BDD3' };
      case 'approved':
        return { text: 'Emite tu factura', color: '#EC6819' };
      case 'invoiced':
        return { text: 'Pago en 2 días hábiles tras subir factura', color: '#90BDD3' };
      case 'paid':
        return { text: `Depositado${paymentDate ? ` · ${paymentDate}` : ''}`, color: '#4CAF50' };
      default:
        return { text: '', color: '#666' };
    }
  };

  const statusMsg = getStatusMessage();

  return (
    <div style={{ padding: '12px 0' }}>
      {/* Línea de progreso */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        marginBottom: 12
      }}>
        {STATES.map((state, index) => (
          <React.Fragment key={state.key}>
            {/* Círculo */}
            <div style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: index <= currentIndex ? '#EC6819' : '#444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {index < currentIndex && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13L9 17L19 7" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
                </svg>
              )}
            </div>
            
            {/* Línea conectora */}
            {index < STATES.length - 1 && (
              <div style={{
                flex: 1,
                height: 2,
                background: index < currentIndex ? '#EC6819' : '#444',
                margin: '0 4px'
              }} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Estado actual y mensaje */}
      <div style={{ textAlign: 'center' }}>
        <p style={{ 
          color: '#fff', 
          fontSize: 13, 
          fontWeight: 600, 
          margin: '0 0 4px' 
        }}>
          {STATES[currentIndex]?.label}
        </p>
        <p style={{ 
          color: statusMsg.color, 
          fontSize: 12, 
          margin: 0 
        }}>
          {statusMsg.text}
        </p>
      </div>
    </div>
  );
};

export default ServiceProgress;
