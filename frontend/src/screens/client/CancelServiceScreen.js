import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import { CancellationSuccess, CancellationWithCharge } from '../../components/ErrorStates';
import { getObject } from '../../utils/safeStorage';
import { CANCELLATION_PERCENTAGES, NON_CANCELLABLE_STATUSES, getCancellationWindowText } from '../../utils/cancellationPolicy';
import BACKEND_URL from '../../utils/api';

/**
 * Pantalla: Cancelar Servicio (CLIENTE)
 *
 * Política de cancelación (Términos y Condiciones):
 * - Antes de asignación: Sin cargo (0%)
 * - Después de asignado: 20% del servicio
 * - Operador en camino: 40% del servicio
 * - Operador en obra: 60% del servicio
 * - Servicio iniciado: no es posible cancelar
 */
function CancelServiceScreen() {
  const navigate = useNavigate();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [chargeAmount, setChargeAmount] = useState(0);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [apiError, setApiError] = useState('');

  // Obtener valor del servicio desde localStorage (totalAmount es el que se guarda en Confirm)
  const serviceTotal = parseInt(
    localStorage.getItem('serviceTotal') || 
    localStorage.getItem('totalAmount') || 
    localStorage.getItem('maxTotalAmount') || 
    '0'
  ) || 0;
  const serviceStatus = localStorage.getItem('serviceStatus') || 'pending';
  const cannotCancel = NON_CANCELLABLE_STATUSES.includes(serviceStatus);
  const reservationType = localStorage.getItem('reservationType') || 'immediate';
  const urgencyType = localStorage.getItem('urgencyType') || null;
  const hoursToday = parseInt(localStorage.getItem('selectedHours') || '4', 10);
  const sinCargoRuleText = getCancellationWindowText({ urgencyType, reservationType, hoursToday });
  // No-show: si el operador informó en ruta (ej. tráfico), sin cargo solo después de 90 min desde la hora de llegada; si no informó, 60 min
  const operatorReportedEnRoute = !!getObject('activeIncident', null);
  const noShowRuleText = operatorReportedEnRoute
    ? 'Si el operador informó algo en ruta (ej. tráfico), puedes cancelar sin cargo solo después de 90 min desde la hora de llegada indicada.'
    : 'Si el operador no ha llegado y no informó nada en ruta, puedes cancelar sin cargo después de 60 min desde la hora de llegada indicada.';

  const getCancellationFee = () => {
    const percentage = CANCELLATION_PERCENTAGES[serviceStatus] || 0;
    return serviceTotal > 0 ? Math.round(serviceTotal * percentage) : 0;
  };

  const getCancellationPercentage = () => {
    return (CANCELLATION_PERCENTAGES[serviceStatus] || 0) * 100;
  };

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

  const cancellationFee = getCancellationFee();
  const cancellationPercentage = getCancellationPercentage();

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
      clearLocalAndConfirm(cancellationFee);
    }
  };

  // Pantalla de confirmación final
  if (confirmed) {
    return (
      <div className="maqgo-app">
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
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ padding: 24 }}>
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
            <strong style={{ color: '#fff' }}>Completar tu reserva no tiene cargo.</strong> Si cancelas después de asignación, aplica cargo: 20% asignado · 40% en camino · 60% en obra · servicio iniciado no cancelable.
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
                  El servicio ya está en curso. Si tienes un problema, escríbenos por el chat.
                </p>
              </div>
            </div>
            <button type="button" className="maqgo-btn-secondary" onClick={() => navigate(-1)} style={{ marginTop: 16 }}>
              Volver
            </button>
          </div>
        ) : null}

        {/* Alerta de cargo (solo si se puede cancelar) */}
        {!cannotCancel && cancellationFee > 0 ? (
          <div style={{
            background: 'rgba(244, 67, 54, 0.1)',
            border: '1px solid rgba(244, 67, 54, 0.3)',
            borderRadius: 10,
            padding: 14,
            marginBottom: 20
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8,
              marginBottom: 12,
              paddingBottom: 10,
              borderBottom: '1px solid rgba(244, 67, 54, 0.2)'
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 9V13M12 17H12.01M21 12C21 16.97 16.97 21 12 21C7.03 21 3 16.97 3 12C3 7.03 7.03 3 12 3C16.97 3 21 7.03 21 12Z" stroke="#F44336" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span style={{ color: '#F44336', fontSize: 14, fontWeight: 600 }}>
                Cargo por cancelación: {cancellationPercentage}%
              </span>
            </div>

            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10
            }}>
              <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>
                {cancellationPercentage}% del valor de la reserva
              </span>
              <span style={{ color: '#F44336', fontSize: 16, fontWeight: 700 }}>
                {formatPrice(cancellationFee)}
              </span>
            </div>

            <div style={{ 
              background: 'rgba(0,0,0,0.2)', 
              borderRadius: 6, 
              padding: 10
            }}>
              <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 11, margin: 0, lineHeight: 1.4 }}>
                Si decides continuar con tu reserva, no se aplicará este cargo. Solo se cobra si cancelas, porque el operador ya reservó su tiempo para ti.
              </p>
              {serviceStatus === 'en_route' && (
                <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, margin: '8px 0 0', lineHeight: 1.4 }}>
                  {noShowRuleText} Desde la pantalla de tu servicio podrás usar “Reportar y cancelar sin cargo” cuando aplique.
                </p>
              )}
            </div>
          </div>
        ) : !cannotCancel ? (
          <div style={{
            background: 'rgba(144, 189, 211, 0.1)',
            border: '1px solid rgba(144, 189, 211, 0.3)',
            borderRadius: 10,
            padding: 14,
            marginBottom: 20
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M9 12L11 14L15 10M21 12C21 16.97 16.97 21 12 21C7.03 21 3 16.97 3 12C3 7.03 7.03 3 12 3C16.97 3 21 7.03 21 12Z" stroke="#90BDD3" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <div>
                <span style={{ color: '#90BDD3', fontSize: 14, fontWeight: 600 }}>
                  Sin cargo por cancelación
                </span>
                <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 11, margin: '4px 0 0' }}>
                  Tu solicitud aún no fue asignada. Si más adelante asignan un operador y cancelas, sí puede haber cargo.
                </p>
              </div>
            </div>
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

              {cancellationFee > 0 ? (
                <div style={{
                  background: 'rgba(244, 67, 54, 0.1)',
                  borderRadius: 10,
                  padding: 14,
                  marginBottom: 20
                }}>
                  <p style={{ 
                    color: 'rgba(255,255,255,0.9)', 
                    fontSize: 13, 
                    textAlign: 'center',
                    margin: '0 0 8px'
                  }}>
                    Se te cobrará el <strong style={{ color: '#F44336' }}>{cancellationPercentage}%</strong> del valor de la reserva:
                  </p>
                  <p style={{ 
                    color: '#F44336', 
                    fontSize: 24, 
                    fontWeight: 700, 
                    textAlign: 'center',
                    margin: 0
                  }}>
                    {formatPrice(cancellationFee)}
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, textAlign: 'center', margin: '8px 0 0' }}>
                    Si cierras y continúas con tu reserva, no se te cobra nada.
                  </p>
                  {serviceStatus === 'en_route' && (
                    <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, textAlign: 'center', margin: '8px 0 0', lineHeight: 1.4 }}>
                      {noShowRuleText} Desde la pantalla de la reserva podrás “Reportar y cancelar sin cargo” cuando aplique.
                    </p>
                  )}
                </div>
              ) : (
                <div style={{
                  background: 'rgba(144, 189, 211, 0.1)',
                  border: '1px solid rgba(144, 189, 211, 0.25)',
                  borderRadius: 10,
                  padding: 14,
                  marginBottom: 20
                }}>
                  <p style={{ color: '#90BDD3', fontSize: 12, fontWeight: 600, margin: '0 0 6px' }}>
                    Según la política de cancelación
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: 0, lineHeight: 1.45 }}>
                    {serviceStatus === 'pending'
                      ? 'Tu solicitud aún no fue asignada. Puedes cancelar sin cargo.'
                      : `${sinCargoRuleText}. Esta cancelación no tiene cargo.`}
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, margin: '10px 0 0' }}>
                    ¿Confirmas que deseas cancelar?
                  </p>
                </div>
              )}

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
                {cancellationFee > 0 
                  ? `Sí, cancelar y pagar ${formatPrice(cancellationFee)}`
                  : 'Sí, cancelar reserva'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CancelServiceScreen;
