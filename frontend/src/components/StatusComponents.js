/**
 * Componente: Timeline de Estado
 * Muestra claramente en qué paso está el usuario y qué viene después
 */
import React from 'react';

/**
 * Timeline visual para mostrar el progreso del servicio
 */
export const ServiceTimeline = ({ currentStep, steps }) => {
  return (
    <div style={{
      background: '#2A2A2A',
      borderRadius: 12,
      padding: 16,
      marginBottom: 16
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
        {/* Línea de conexión */}
        <div style={{
          position: 'absolute',
          top: 12,
          left: 24,
          right: 24,
          height: 2,
          background: 'rgba(255,255,255,0.1)'
        }} />
        <div style={{
          position: 'absolute',
          top: 12,
          left: 24,
          width: `${(currentStep / (steps.length - 1)) * 100}%`,
          maxWidth: 'calc(100% - 48px)',
          height: 2,
          background: '#4CAF50',
          transition: 'width 0.3s ease'
        }} />
        
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const _isPending = index > currentStep;
          
          return (
            <div key={index} style={{ textAlign: 'center', flex: 1, position: 'relative', zIndex: 1 }}>
              <div style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: isCompleted ? '#4CAF50' : isCurrent ? '#EC6819' : '#363636',
                border: isCurrent ? '3px solid rgba(236, 104, 25, 0.3)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 8px',
                fontSize: 12,
                color: '#fff'
              }}>
                {isCompleted ? '✓' : index + 1}
              </div>
              <p style={{
                color: isCurrent ? '#fff' : 'rgba(255,255,255,0.95)',
                fontSize: 10,
                margin: 0,
                fontWeight: isCurrent ? 600 : 400
              }}>
                {step.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Mensaje "Qué pasa después"
 */
export const NextStepMessage = ({ icon, title, description, time }) => {
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.15) 0%, rgba(76, 175, 80, 0.05) 100%)',
      border: '1px solid rgba(76, 175, 80, 0.3)',
      borderRadius: 12,
      padding: 16,
      marginBottom: 16
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: 'rgba(76, 175, 80, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          flexShrink: 0
        }}>
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ 
            color: '#4CAF50', 
            fontSize: 13, 
            fontWeight: 600, 
            margin: '0 0 4px',
            fontFamily: "'Space Grotesk', sans-serif"
          }}>
            {title}
          </p>
          <p style={{ 
            color: 'rgba(255,255,255,0.95)', 
            fontSize: 12, 
            margin: 0,
            lineHeight: 1.4
          }}>
            {description}
          </p>
          {time && (
            <p style={{ 
              color: 'rgba(255,255,255,0.95)', 
              fontSize: 11, 
              margin: '6px 0 0',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}>
              ⏱️ {time}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Timeline de Pago - Muestra claramente el flujo de dinero
 */
export const PaymentTimeline = ({ status = 'pending' }) => {
  const steps = [
    { id: 'paid', label: 'Pagado', desc: 'Cliente paga a MAQGO' },
    { id: 'review', label: '6h aprobación', desc: 'Pago ágil' },
    { id: 'invoice', label: 'Facturar', desc: 'Proveedor factura a MAQGO' },
    { id: 'payout', label: 'Pago', desc: 'MAQGO paga al proveedor' }
  ];
  
  const statusIndex = {
    'pending': 0,
    'pending_review': 1,
    'approved': 2,
    'invoiced': 3,
    'paid': 4
  };
  
  const currentIndex = statusIndex[status] || 0;
  
  return (
    <div style={{
      background: '#2A2A2A',
      borderRadius: 12,
      padding: 16,
      marginBottom: 16
    }}>
      <p style={{ 
        color: 'rgba(255,255,255,0.95)', 
        fontSize: 11, 
        margin: '0 0 12px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        💰 Flujo de pago
      </p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          
          return (
            <div key={step.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              {/* Indicador vertical */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: isCompleted ? '#4CAF50' : isCurrent ? '#EC6819' : '#363636',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  color: '#fff'
                }}>
                  {isCompleted ? '✓' : index + 1}
                </div>
                {index < steps.length - 1 && (
                  <div style={{
                    width: 2,
                    height: 24,
                    background: isCompleted ? '#4CAF50' : 'rgba(255,255,255,0.1)'
                  }} />
                )}
              </div>
              
              {/* Contenido */}
              <div style={{ paddingBottom: 12 }}>
                <p style={{
                  color: isCurrent ? '#fff' : isCompleted ? '#4CAF50' : 'rgba(255,255,255,0.95)',
                  fontSize: 13,
                  fontWeight: isCurrent ? 600 : 400,
                  margin: 0
                }}>
                  {step.label}
                </p>
                <p style={{
                  color: 'rgba(255,255,255,0.9)',
                  fontSize: 11,
                  margin: '2px 0 0'
                }}>
                  {step.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Alerta informativa
 */
export const InfoAlert = ({ type = 'info', title, children }) => {
  const colors = {
    info: { bg: 'rgba(144, 189, 211, 0.1)', border: 'rgba(144, 189, 211, 0.3)', text: '#90BDD3', icon: 'ℹ️' },
    success: { bg: 'rgba(76, 175, 80, 0.1)', border: 'rgba(76, 175, 80, 0.3)', text: '#4CAF50', icon: '✅' },
    warning: { bg: 'rgba(255, 167, 38, 0.1)', border: 'rgba(255, 167, 38, 0.3)', text: '#FFA726', icon: '⚠️' },
    error: { bg: 'rgba(244, 67, 54, 0.1)', border: 'rgba(244, 67, 54, 0.3)', text: '#F44336', icon: '❌' }
  };
  
  const c = colors[type];
  
  return (
    <div style={{
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 10,
      padding: 14,
      marginBottom: 16
    }}>
      {title && (
        <p style={{ 
          color: c.text, 
          fontSize: 13, 
          fontWeight: 600, 
          margin: '0 0 4px',
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
          <span>{c.icon}</span> {title}
        </p>
      )}
      <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, lineHeight: 1.4 }}>
        {children}
      </div>
    </div>
  );
};
