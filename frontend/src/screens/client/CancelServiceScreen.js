import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import { CancellationSuccess, CancellationWithCharge } from '../../components/ErrorStates';
import BACKEND_URL from '../../utils/api';

const NON_CANCELLABLE_STATUSES = ['in_progress', 'started'];

/**
 * Pantalla: Cancelar Servicio (CLIENTE)
 *
 * Política de cancelación (Términos y Condiciones):
 * - Desde la aceptación: 0–60 min = 0% · 60–120 min = 20% · +120 min = 40%
 * - Con presencia confirmada en obra o servicio iniciado: no es posible cancelar
 */
function CancelServiceScreen() {
  const navigate = useNavigate();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [chargeAmount, setChargeAmount] = useState(0);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [apiError, setApiError] = useState('');

  const serviceStatus = localStorage.getItem('serviceStatus') || 'pending';
  const cannotCancel = NON_CANCELLABLE_STATUSES.includes(serviceStatus);

  const getStatusMessage = () => {
    switch (serviceStatus) {
      case 'pending': return 'Tu solicitud aún no ha sido asignada';
      case 'assigned': return 'Un operador ya fue asignado a tu reserva';
      case 'en_route': return 'El operador está en camino a la obra';
      case 'arrived': return 'El operador ya llegó a la obra';
      case 'started':
      case 'in_progress': return 'El servicio ya está en curso';
      default: return '';
    }
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('es-CL', { 
      style: 'currency', currency: 'CLP', maximumFractionDigits: 0 
    }).format(price);
  };

  // Primer paso: mostrar modal de confirmación
  const handleInitiateCancel = () => {
    if (!reason.trim()) return;
    setShowConfirmModal(true);
  };

  // Segundo paso: confirmar cancelación
  const handleConfirmCancel = async () => {
    setShowConfirmModal(false);
    setLoading(true);
    setApiError('');

    const serviceId = localStorage.getItem('currentServiceId');

    const clearLocalAndConfirm = (fee = 0) => {
      setChargeAmount(fee);
      localStorage.removeItem('currentServiceId');
      localStorage.removeItem('selectedProvider');
      localStorage.removeItem('serviceStatus');
      localStorage.removeItem('serviceTotal');
      setLoading(false);
      setConfirmed(true);
      setTimeout(() => navigate('/client/home'), 3000);
    };

    if (serviceId) {
      try {
        const { data } = await axios.put(
          `${BACKEND_URL}/api/service-requests/${serviceId}/cancel`,
          { reason: reason.trim() || undefined },
          { timeout: 10000 }
        );
        clearLocalAndConfirm(data.late_fee_amount || 0);
      } catch (err) {
        setLoading(false);
        const msg = err.response?.data?.detail || err.message || 'No se pudo cancelar. Intenta de nuevo.';
        setApiError(Array.isArray(msg) ? msg[0]?.msg || msg : msg);
      }
    } else {
      // Demo o sin serviceId: comportamiento anterior (limpiar y confirmar)
      clearLocalAndConfirm(0);
    }
  };

  // Pantalla de confirmación final
  if (confirmed) {
    return (
      <div className="maqgo-app maqgo-client-funnel">
        <div className="maqgo-screen">
          {chargeAmount > 0 ? (
            <CancellationWithCharge 
              amount={chargeAmount} 
              onClose={() => navigate('/client/home')} 
            />
          ) : (
            <CancellationSuccess 
              onClose={() => navigate('/client/home')} 
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 24px' }}>
        {/* Header */}
        <div style={{ marginBottom: 16, textAlign: 'center' }}>
          <MaqgoLogo size="small" />
        </div>

        {/* Título */}
        <h1 className="maqgo-h1" style={{ marginBottom: 8 }}>
          Cancelar reserva
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, marginBottom: 12 }}>
          {getStatusMessage()}
        </p>

        {/* Regla clara: una línea de % + mensaje principal */}
        <div style={{
          background: 'rgba(236, 104, 25, 0.08)',
          border: '1px solid rgba(236, 104, 25, 0.25)',
          borderRadius: 12,
          padding: 14,
          marginBottom: 20
        }}>
          <p style={{ color: 'var(--maqgo-orange)', fontSize: 12, fontWeight: 700, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Regla de cancelación
          </p>
          <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: '0 0 6px', lineHeight: 1.5 }}>
            <strong style={{ color: '#fff' }}>MAQGO favorece ejecutar el servicio.</strong> Si cancelas: 0–60 min desde la aceptación = 0% · 60–120 min = 20% · +120 min = 40%. Con presencia confirmada en obra o servicio iniciado: no se puede cancelar.
          </p>
        </div>

        {/* Bloqueo: servicio iniciado - no se puede cancelar */}
        {cannotCancel ? (
          <div style={{
            background: 'rgba(244, 67, 54, 0.15)',
            border: '1px solid rgba(244, 67, 54, 0.4)',
            borderRadius: 10,
            padding: 16,
            marginBottom: 20
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <path d="M12 9V13M12 17H12.01M21 12C21 16.97 16.97 21 12 21C7.03 21 3 16.97 3 12C3 7.03 7.03 3 12 3C16.97 3 21 7.03 21 12Z" stroke="#F44336" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <div>
                <p style={{ color: '#F44336', fontSize: 15, fontWeight: 600, margin: '0 0 8px' }}>
                  Ya empezó
                </p>
                <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                  El servicio ya está en curso. Si tienes un problema, contáctanos desde Ayuda y Soporte.
                </p>
              </div>
            </div>
            <button type="button" className="maqgo-btn-secondary" onClick={() => navigate(-1)} style={{ marginTop: 16 }}>
              Volver
            </button>
          </div>
        ) : null}

        {!cannotCancel ? (
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            padding: 14,
            marginBottom: 20
          }}>
            <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13, margin: 0, lineHeight: 1.45 }}>
              El cargo (si aplica) se calcula automáticamente según el tiempo transcurrido desde la aceptación. La confirmación final se muestra al cancelar.
            </p>
          </div>
        ) : null}

        {/* Razón de cancelación (solo si se puede cancelar) */}
        {!cannotCancel && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 8, display: 'block' }}>
            ¿Por qué deseas cancelar?
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              'Cambié de planes',
              'Encontré otra solución',
              'Error en la dirección',
              'El tiempo de espera es muy largo',
              'Otro motivo'
            ].map((option) => (
              <button
                key={option}
                onClick={() => setReason(option)}
                data-testid={`reason-${option.toLowerCase().replace(/\s+/g, '-')}`}
                style={{
                  background: reason === option ? 'rgba(236, 104, 25, 0.15)' : '#2A2A2A',
                  border: reason === option ? '1px solid var(--maqgo-orange)' : '1px solid transparent',
                  borderRadius: 10,
                  padding: '12px 14px',
                  color: reason === option ? 'var(--maqgo-orange)' : 'rgba(255,255,255,0.8)',
                  fontSize: 14,
                  textAlign: 'left',
                  cursor: 'pointer'
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        )}

        {/* Primero: incentivo a continuar (acción principal) */}
        <button
          onClick={() => navigate(-1)}
          data-testid="back-btn"
          className="maqgo-btn-primary"
          style={{
            width: '100%',
            padding: 14,
            marginBottom: 12
          }}
        >
          Continuar con mi reserva
        </button>

        {apiError && (
          <div style={{
            background: 'rgba(244, 67, 54, 0.15)',
            border: '1px solid rgba(244, 67, 54, 0.4)',
            borderRadius: 10,
            padding: 12,
            marginBottom: 16,
            color: '#F44336',
            fontSize: 13
          }}>
            {apiError}
          </div>
        )}

        {/* Cancelar: acción secundaria */}
        {!cannotCancel && (
        <button
          type="button"
          onClick={handleInitiateCancel}
          disabled={!reason || loading}
          className="maqgo-btn-secondary maqgo-btn-secondary-danger"
          style={{ opacity: reason ? 1 : 0.5, cursor: reason ? 'pointer' : 'not-allowed' }}
          aria-busy={loading}
          aria-label={loading ? 'Cancelando reserva' : 'Cancelar de todos modos'}
          data-testid="initiate-cancel-btn"
        >
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'maqgo-spin 0.8s linear infinite' }} />
              Cancelando...
            </span>
          ) : (
            'Cancelar de todos modos'
          )}
        </button>
        )}

        {/* Modal de doble confirmación */}
        {showConfirmModal && (
          <div className="maqgo-modal-overlay">
            <div className="maqgo-modal-dialog maqgo-modal-dialog--danger">
              {/* Icono de alerta */}
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{
                  width: 60,
                  height: 60,
                  borderRadius: '50%',
                  background: 'rgba(244, 67, 54, 0.15)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                    <path d="M12 9V13M12 17H12.01M21 12C21 16.97 16.97 21 12 21C7.03 21 3 16.97 3 12C3 7.03 7.03 3 12 3C16.97 3 21 7.03 21 12Z" stroke="#F44336" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>

              <h2 style={{ 
                color: '#fff', 
                fontSize: 18, 
                fontWeight: 600, 
                textAlign: 'center',
                marginBottom: 12
              }}>
                ¿Confirmar cancelación?
              </h2>

              <div style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10,
                padding: 14,
                marginBottom: 20
              }}>
                <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13, textAlign: 'center', margin: 0, lineHeight: 1.45 }}>
                  Confirmas que deseas cancelar. Si aplica cargo, MAQGO lo calcula automáticamente según el tiempo desde la aceptación.
                </p>
              </div>

              <p style={{ 
                color: 'rgba(255,255,255,0.7)', 
                fontSize: 12, 
                textAlign: 'center',
                marginBottom: 20
              }}>
                Esta acción no se puede deshacer.
              </p>

              {/* Botones del modal: primero incentivo a continuar */}
              <button
                onClick={() => setShowConfirmModal(false)}
                data-testid="cancel-modal-btn"
                className="maqgo-btn-primary"
                style={{
                  width: '100%',
                  padding: 14,
                  marginBottom: 10
                }}
              >
                No, continuar con mi reserva
              </button>

              <button
                onClick={handleConfirmCancel}
                data-testid="confirm-cancel-btn"
                style={{
                  width: '100%',
                  padding: 14,
                  background: 'transparent',
                  border: '1px solid rgba(244, 67, 54, 0.5)',
                  borderRadius: 25,
                  color: 'rgba(255, 200, 200, 0.95)',
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                Sí, cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CancelServiceScreen;
