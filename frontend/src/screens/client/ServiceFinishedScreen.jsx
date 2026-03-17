import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import { playServiceCompletedSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';

import BACKEND_URL from '../../utils/api';
import { MACHINERY_NAMES } from '../../utils/machineryNames';
import { CON_FACTURA_FACTOR, getClientBreakdown, MACHINERY_PER_TRIP } from '../../utils/pricing';
import { getObject, getObjectFirst } from '../../utils/safeStorage';

/**
 * Arma un desglose que sume exactamente totalPagado (evita desglose incoherente con factura).
 * Con factura: totalPagado = totalConFactura(totalSinFactura) => totalSinFactura = totalPagado / factor.
 * Reparte totalSinFactura en subtotal (servicio+traslado+bonus) y comisión MAQGO (10%+IVA sobre comisión).
 */
function buildBreakdownFromTotal(totalPagado, needsInvoice) {
  if (!totalPagado || totalPagado <= 0) return null;
  const totalSinFactura = Math.round(totalPagado / CON_FACTURA_FACTOR);
  // totalSinFactura = subtotal + maqgoFeeNeto*1.19; maqgoFeeNeto = subtotal*0.10 => totalSinFactura = subtotal * 1.119
  const subtotal = Math.round(totalSinFactura / 1.1785);
  const maqgoFeeNeto = Math.round(subtotal * 0.10);
  // IVA (total) para que Servicio + IVA(total) + Tarifa(neto) = totalPagado; sin desglose IVA Tarifa para no duplicar
  const ivaTotal = needsInvoice ? totalPagado - subtotal - maqgoFeeNeto : 0;
  return {
    service: subtotal,
    transport: 0,
    bonus: 0,
    maqgoFee: maqgoFeeNeto,
    maqgoFeeIva: 0,
    ivaProveedor: ivaTotal,
    total: totalPagado,
    needsInvoice: !!needsInvoice
  };
}

/**
 * Pantalla: Servicio Finalizado (CLIENTE)
 * 
 * World-Class MVP:
 * 1. Reporte del servicio con desglose
 * 2. Valorización del proveedor
 * 3. Envío de comprobante
 */
function ServiceFinishedScreen() {
  const navigate = useNavigate();
  const [step, setStep] = useState('report'); // 'report' | 'rating' | 'done'
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Reproducir sonido de servicio completado al cargar
  useEffect(() => {
    unlockAudio();
    playServiceCompletedSound();
    vibrate('finished');
  }, []);
  
  // Datos del servicio
  const [serviceData, setServiceData] = useState({
    machinery: '',
    provider: {},
    hours: 4,
    location: '',
    isPerTrip: false,
    needsInvoice: false,
    startTime: '',
    endTime: '',
    hasRealEnd: false,
    pricing: {}
  });

  const formatTimeHHMM = (isoString) => {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch { return ''; }
  };

  /** Regla: solo horario real de ingreso y salida; nunca inventar fin si falta o coincide con inicio. */
  const getRealStartAndEnd = (startIso, endIso) => {
    const start = formatTimeHHMM(startIso);
    const end = formatTimeHHMM(endIso);
    const hasRealEnd = end && end !== start;
    return {
      startTime: start || '—',
      endTime: hasRealEnd ? end : null,
      hasRealEnd
    };
  };

  useEffect(() => {
    let cancelled = false;
    const serviceId = localStorage.getItem('currentServiceId');

    const loadData = async () => {
      // Total, proveedor y horarios: prioridad API (datos reales del servicio) sobre localStorage
      let totalFromApi = null;
      let providerFromApi = null;
      let arrivalIso = null;
      let finishedIso = null;
      if (serviceId && !serviceId.startsWith('demo')) {
        try {
          const res = await axios.get(`${BACKEND_URL}/api/service-requests/${serviceId}`);
          if (!cancelled && res.data) {
            totalFromApi = res.data.totalAmount != null ? Number(res.data.totalAmount) : null;
            if (res.data.providerId || res.data.providerName) {
              providerFromApi = {
                id: res.data.providerId,
                name: res.data.providerName || res.data.provider?.name,
                operator_name: res.data.providerOperatorName || res.data.provider?.operator_name
              };
            }
            // Horarios reales conforme a lo arrendado:
            // - Ingreso: si hubo inicio automático (cliente no dejó entrar), usar autoStartedAt; si no, arrivalDetectedAt
            // - Salida: finishedAt
            const autoStartedIso = res.data.autoStartedAt || null;
            const arrivalDetectedIso = res.data.arrivalDetectedAt || null;
            arrivalIso = autoStartedIso ?? arrivalDetectedIso;
            finishedIso = res.data.finishedAt || null;
          }
        } catch (e) {
          console.warn('No se pudo cargar servicio para desglose:', e?.message);
        }
      }

      if (cancelled) return;

      const machinery = localStorage.getItem('selectedMachinery') || 'Retroexcavadora';
      const provider = providerFromApi || getObjectFirst(['acceptedProvider', 'selectedProvider'], {});
      const hours = parseInt(localStorage.getItem('selectedHours') || '4');
      const location = localStorage.getItem('serviceLocation') || 'Santiago';
      const pricing = getObject('servicePricing', {});
      const totalAmount = totalFromApi ?? parseInt(localStorage.getItem('totalAmount') || localStorage.getItem('maxTotalAmount') || '0');
      const isPerTrip = MACHINERY_PER_TRIP.includes(machinery);
      const needsInvoice = localStorage.getItem('needsInvoice') === 'true';
      // Prioridad: API (arrivalDetectedAt, finishedAt) > localStorage (solo demo o fallback)
      const serviceStartIso = arrivalIso ?? localStorage.getItem('serviceStartTime');
      const serviceEndIso = finishedIso ?? localStorage.getItem('serviceEndTime');
      const { startTime, endTime, hasRealEnd } = getRealStartAndEnd(serviceStartIso, serviceEndIso);

      const service = pricing.service_amount ?? pricing.breakdown?.service_cost ?? (provider.price_per_hour || 45000) * hours;
      const transport = pricing.transport_cost ?? pricing.breakdown?.transport_cost ?? provider.transport_fee ?? 0;
      const bonus = pricing.immediate_bonus ?? pricing.breakdown?.immediate_bonus ?? 0;
      const maqgoFeeStored = pricing.client_commission ?? pricing.breakdown?.client_commission ?? Math.round((service + transport + bonus) * 0.10);
      const maqgoFeeIvaStored = pricing.client_commission_iva ?? pricing.breakdown?.client_commission_iva ?? Math.round(maqgoFeeStored * 0.19);
      const subtotal = service + transport + bonus;
      const ivaProveedorStored = needsInvoice ? Math.round(subtotal * 0.19) : 0;
      const totalStored = (totalAmount || pricing.final_price) ?? Math.round(subtotal + ivaProveedorStored + maqgoFeeStored + maqgoFeeIvaStored);

      // Con factura: si el desglose guardado no cuadra con el total pagado, derivar desglose desde total
      const totalToShow = totalAmount || totalStored;
      let pricingFinal;
      if (needsInvoice && totalToShow > 0) {
        const sumStored = subtotal + ivaProveedorStored + (maqgoFeeStored + maqgoFeeIvaStored);
        const diff = Math.abs(sumStored - totalToShow);
        if (diff > totalToShow * 0.02) {
          pricingFinal = buildBreakdownFromTotal(totalToShow, true);
        } else {
          pricingFinal = {
            service,
            transport,
            bonus,
            maqgoFee: maqgoFeeStored,
            maqgoFeeIva: maqgoFeeIvaStored,
            ivaProveedor: ivaProveedorStored,
            total: totalToShow,
            needsInvoice: true
          };
        }
      } else {
        pricingFinal = {
          service,
          transport,
          bonus,
          maqgoFee: maqgoFeeStored,
          maqgoFeeIva: maqgoFeeIvaStored,
          ivaProveedor: 0,
          total: totalToShow,
          needsInvoice: false
        };
      }

      setServiceData({
        machinery,
        provider,
        hours,
        location,
        isPerTrip,
        needsInvoice,
        startTime,
        endTime: endTime || '',
        hasRealEnd,
        pricing: pricingFinal
      });
    };

    loadData();
    return () => { cancelled = true; };
  }, []);

  const formatPrice = (price) => {
    return new Intl.NumberFormat('es-CL', { 
      style: 'currency', currency: 'CLP', maximumFractionDigits: 0 
    }).format(price || 0);
  };

  const handleSubmitRating = async () => {
    if (rating === 0) return;
    setLoading(true);
    
    try {
      const serviceId = localStorage.getItem('currentServiceId');
      const userId = localStorage.getItem('userId');
      
      await axios.post(`${BACKEND_URL}/api/ratings`, {
        serviceId,
        fromUserId: userId,
        toUserId: serviceData.provider.id,
        stars: rating,
        comment
      });
    } catch (e) {
      console.error('Error submitting rating:', e);
    }
    
    setLoading(false);
    setStep('done');
    
    // Redirigir después de 3 segundos
    setTimeout(() => {
      navigate('/client/home');
    }, 3000);
  };

  // PASO 1: Reporte del servicio
  if (step === 'report') {
    return (
      <div className="maqgo-app">
        <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 24px' }}>
          {/* Header */}
          <div style={{ marginBottom: 20, textAlign: 'center' }}>
            <MaqgoLogo size="small" />
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 8, letterSpacing: '0.5px' }}>
              Paso 1 de 2
            </p>
          </div>

          {/* Título */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{
              width: 70,
              height: 70,
              borderRadius: '50%',
              background: '#90BDD3',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <svg width="35" height="35" viewBox="0 0 35 35" fill="none">
                <path d="M9 17L15 23L26 12" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h1 className="maqgo-h1" style={{ marginBottom: 4 }}>
              Servicio finalizado
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, margin: 0 }}>
              Resumen de tu reserva
            </p>
          </div>

          {/* Resumen del servicio: datos de la reserva */}
          <div style={{
            background: '#363636',
            borderRadius: 14,
            padding: 16,
            marginBottom: 16
          }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
              Datos de tu reserva
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>Maquinaria</span>
              <span style={{ color: '#fff', fontSize: 13, fontWeight: 500 }}>{MACHINERY_NAMES[serviceData.machinery] || serviceData.machinery}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>Operador</span>
              <span style={{ color: '#fff', fontSize: 13, fontWeight: 500 }}>{serviceData.provider.operator_name || serviceData.provider.providerOperatorName || 'Operador asignado'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>Ubicación de la obra</span>
              <span style={{ color: '#fff', fontSize: 13, fontWeight: 500, maxWidth: '60%', textAlign: 'right' }}>{serviceData.location}</span>
            </div>
            {!serviceData.isPerTrip && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>Duración contratada</span>
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 500 }}>{serviceData.hours} horas</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>Ingreso a obra</span>
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 500 }}>{serviceData.startTime || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>Salida de obra</span>
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 500 }}>{serviceData.hasRealEnd ? serviceData.endTime : '—'}</span>
                </div>
              </>
            )}
            {serviceData.isPerTrip && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>Tipo</span>
                <span style={{ color: '#fff', fontSize: 13, fontWeight: 500 }}>Servicio por viaje</span>
              </div>
            )}
          </div>

          {/* Detalle del cobro */}
          <div style={{
            background: '#2A2A2A',
            borderRadius: 14,
            padding: 16,
            marginBottom: 16
          }}>
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
              Detalle del cobro
            </p>
            {(() => {
              const b = getClientBreakdown(serviceData.pricing);
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>
                      Servicio {serviceData.isPerTrip ? '(viaje)' : `(${serviceData.hours}h)`}
                    </span>
                    <span style={{ color: '#fff', fontSize: 12 }}>{formatPrice(b.service)}</span>
                  </div>
                  {b.bonus > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>Alta demanda</span>
                      <span style={{ color: '#fff', fontSize: 12 }}>{formatPrice(b.bonus)}</span>
                    </div>
                  )}
                  {b.transport > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>Traslado</span>
                      <span style={{ color: '#fff', fontSize: 12 }}>{formatPrice(b.transport)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: b.needsInvoice && b.ivaTotal > 0 ? 6 : 10 }}>
                    <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>
                      Tarifa por Servicio MAQGO{b.needsInvoice ? ' (neta)' : ' (IVA incluido)'}
                    </span>
                    <span style={{ color: '#fff', fontSize: 12 }}>
                      {formatPrice(b.needsInvoice ? b.tarifaNeta : b.tarifaConIva)}
                    </span>
                  </div>
                  {b.needsInvoice && b.ivaTotal > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>IVA (19%)</span>
                      <span style={{ color: '#fff', fontSize: 12 }}>{formatPrice(b.ivaTotal)}</span>
                    </div>
                  )}
                  <div style={{ 
                    borderTop: '1px solid rgba(255,255,255,0.2)', 
                    paddingTop: 10, 
                    marginTop: 4,
                    display: 'flex', 
                    justifyContent: 'space-between' 
                  }}>
                    <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Total pagado</span>
                    <span style={{ color: '#EC6819', fontSize: 14, fontWeight: 700 }}>{formatPrice(b.total)}</span>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Info documento recibido */}
          <div style={{
            background: '#2A2A2A',
            borderRadius: 10,
            padding: 12,
            marginBottom: 20
          }}>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, margin: 0, textAlign: 'center' }}>
              {serviceData.pricing.needsInvoice 
                ? 'Tu factura se emite dentro de los plazos legales del mes en que fue contratada y pagada la reserva, y se envía al correo que indicaste.'
                : 'Tu resumen de servicio será enviado a tu correo electrónico en los próximos días'
              }
            </p>
          </div>

          {/* Botón continuar */}
          <button 
            className="maqgo-btn-primary"
            onClick={() => setStep('rating')}
          >
            Continuar a evaluación
          </button>
        </div>
      </div>
    );
  }

  // PASO 2: Valorización del proveedor
  if (step === 'rating') {
    return (
      <div className="maqgo-app">
        <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 24px' }}>
          {/* Header */}
          <div style={{ marginBottom: 20, textAlign: 'center' }}>
            <MaqgoLogo size="small" />
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 8, letterSpacing: '0.5px' }}>
              Paso 2 de 2
            </p>
          </div>

          {/* Título */}
          <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 8 }}>
            Evalúa el servicio
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, textAlign: 'center', marginBottom: 30 }}>
            Tu opinión ayuda a otros usuarios
          </p>

          {/* Info proveedor */}
          <div style={{
            background: '#363636',
            borderRadius: 14,
            padding: 16,
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 14
          }}>
            <div style={{
              width: 55,
              height: 55,
              borderRadius: '50%',
              background: '#444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="8" r="4" fill="rgba(255,255,255,0.95)"/>
                <path d="M4 20C4 16 8 14 12 14C16 14 20 16 20 20" stroke="rgba(255,255,255,0.95)" strokeWidth="2"/>
              </svg>
            </div>
            <div>
              <p style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: 0 }}>
                {serviceData.provider.operator_name || serviceData.provider.providerOperatorName || 'Operador asignado'}
              </p>
              <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: 0 }}>
                {serviceData.machinery}
              </p>
            </div>
          </div>

          {/* Estrellas */}
          <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, textAlign: 'center', marginBottom: 16 }}>
            ¿Cómo calificarías el servicio?
          </p>
          
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 30 }}>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                data-testid={`star-${star}`}
              >
                <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                  <path 
                    d="M22 4L27 16H40L30 25L34 38L22 29L10 38L14 25L4 16H17L22 4Z" 
                    fill={rating >= star ? '#EC6819' : '#444'}
                    stroke={rating >= star ? '#EC6819' : '#555'}
                    strokeWidth="2"
                  />
                </svg>
              </button>
            ))}
          </div>

          {/* Comentario */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, marginBottom: 8, display: 'block' }}>
              Comentario (opcional)
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Cuéntanos tu experiencia..."
              rows={4}
              style={{
                width: '100%',
                padding: 14,
                background: '#F5EFE6',
                border: 'none',
                borderRadius: 12,
                fontSize: 15,
                color: '#1A1A1A',
                resize: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Botones */}
          <button 
            className="maqgo-btn-primary"
            onClick={handleSubmitRating}
            disabled={rating === 0 || loading}
            aria-busy={loading}
            aria-label={loading ? 'Enviando evaluación' : 'Enviar evaluación'}
            style={{ opacity: rating > 0 ? 1 : 0.5, marginBottom: 12 }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'maqgo-spin 0.8s linear infinite' }} />
                Enviando...
              </span>
            ) : (
              'Enviar evaluación'
            )}
          </button>
          
          <button 
            onClick={() => navigate('/client/home')}
            style={{
              width: '100%',
              padding: 14,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 25,
              color: 'rgba(255,255,255,0.95)',
              fontSize: 15,
              cursor: 'pointer'
            }}
          >
            Omitir
          </button>
        </div>
      </div>
    );
  }

  // PASO 3: Confirmación final
  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ justifyContent: 'center', alignItems: 'center', padding: 'var(--maqgo-screen-padding-top) 24px 24px' }}>
        <div style={{
          width: 90,
          height: 90,
          borderRadius: '50%',
          background: '#90BDD3',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24
        }}>
          <svg width="45" height="45" viewBox="0 0 45 45" fill="none">
            <path d="M12 22L19 29L33 15" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        
        <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 12, fontSize: 24 }}>
          ¡Gracias por tu evaluación!
        </h1>
        
        <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, textAlign: 'center' }}>
          Redirigiendo al inicio...
        </p>
      </div>
    </div>
  );
}

export default ServiceFinishedScreen;
