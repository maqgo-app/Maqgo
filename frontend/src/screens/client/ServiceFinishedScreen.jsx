import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { playServiceCompletedSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';
import ServiceStateLayout from '../../components/serviceState/ServiceStateLayout';
import { CheckCircle2, Flag, Star } from 'lucide-react';

import BACKEND_URL from '../../utils/api';
import { MACHINERY_NAMES, isPerTripMachineryType } from '../../utils/machineryNames';
import { CON_FACTURA_FACTOR, getClientBreakdown } from '../../utils/pricing';
import { getObject, getObjectFirst } from '../../utils/safeStorage';
import { getBookingLocationLineOrEmpty } from '../../utils/mapPlaceToAddress';

/**
 * Arma un desglose que sume exactamente totalPagado (evita desglose incoherente con factura).
 * Con factura: totalPagado = totalConFactura(totalSinFactura) => totalSinFactura = totalPagado / factor.
 * Reparte totalSinFactura en subtotal (servicio+traslado+bonus) y comisión MAQGO (10%+IVA sobre comisión).
 */
function formatTimeHHMM(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
}

/** Regla: solo horario real de ingreso y salida; nunca inventar fin si falta o coincide con inicio. */
function getRealStartAndEnd(startIso, endIso) {
  const start = formatTimeHHMM(startIso);
  const end = formatTimeHHMM(endIso);
  const hasRealEnd = end && end !== start;
  return {
    startTime: start || '—',
    endTime: hasRealEnd ? end : null,
    hasRealEnd
  };
}

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
          const res = await axios.get(`${BACKEND_URL}/api/service-requests/${serviceId}`, {
            timeout: 8000,
          });
          if (!cancelled && res.data) {
            totalFromApi = res.data.totalAmount != null ? Number(res.data.totalAmount) : null;
            if (res.data.providerId || res.data.providerName) {
              providerFromApi = {
                id: res.data.providerId,
                name: res.data.providerName || res.data.provider?.name,
                operator_name: res.data.providerOperatorName || res.data.provider?.operator_name,
                providerOperatorName: res.data.providerOperatorName,
                operator_rut: res.data.operatorRut ?? res.data.operator_rut ?? res.data.provider?.operator_rut,
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
          if (import.meta.env.DEV) {
            if (import.meta.env.DEV) {
              console.warn('No se pudo cargar servicio para desglose:', e?.message);
            }
          }
        }
      }

      if (cancelled) return;

      const machinery = localStorage.getItem('selectedMachinery') || 'Retroexcavadora';
      const localProv = getObjectFirst(['acceptedProvider', 'selectedProvider'], {});
      const provider = providerFromApi ? { ...localProv, ...providerFromApi } : localProv;
      const hours = parseInt(localStorage.getItem('selectedHours') || '4');
      const location = getBookingLocationLineOrEmpty() || 'Santiago';
      const pricing = getObject('servicePricing', {});
      const totalAmount = totalFromApi ?? parseInt(localStorage.getItem('totalAmount') || localStorage.getItem('maxTotalAmount') || '0');
      const isPerTrip = isPerTripMachineryType(machinery);
      const needsInvoice = localStorage.getItem('needsInvoice') === 'true';
      // Prioridad: API (arrivalDetectedAt, finishedAt) > localStorage (solo demo o fallback)
      const serviceStartIso = arrivalIso ?? localStorage.getItem('serviceStartTime');
      const serviceEndIso = finishedIso ?? localStorage.getItem('serviceEndTime');
      const { startTime, endTime, hasRealEnd } = getRealStartAndEnd(serviceStartIso, serviceEndIso);

      const service = pricing?.service_amount ?? pricing?.breakdown?.service_cost ?? (provider?.price_per_hour || 45000) * hours;
      const transport = isPerTrip
        ? 0
        : (pricing?.transport_cost ?? pricing?.breakdown?.transport_cost ?? provider?.transport_fee ?? 0);
      const bonus = pricing?.immediate_bonus ?? pricing?.breakdown?.immediate_bonus ?? 0;
      const maqgoFeeStored = pricing?.client_commission ?? pricing?.breakdown?.client_commission ?? Math.round((service + transport + bonus) * 0.10);
      const maqgoFeeIvaStored = pricing?.client_commission_iva ?? pricing?.breakdown?.client_commission_iva ?? Math.round(maqgoFeeStored * 0.19);
      const subtotal = service + transport + bonus;
      const ivaProveedorStored = needsInvoice ? Math.round(subtotal * 0.19) : 0;
      const totalStored = (totalAmount || pricing?.final_price) ?? Math.round(subtotal + ivaProveedorStored + maqgoFeeStored + maqgoFeeIvaStored);

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
      
      await axios.post(
        `${BACKEND_URL}/api/ratings`,
        {
          serviceId,
          fromUserId: userId,
          toUserId: serviceData.provider.id,
          stars: rating,
          comment,
        },
        { timeout: 12000 }
      );
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error('Error submitting rating:', e);
      } else {
        console.error('Error submitting rating:', e?.message || 'unknown');
      }
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
    const operatorName = serviceData.provider?.providerOperatorName || serviceData.provider?.operator_name || 'Por confirmar';
    const operatorRut = serviceData.provider?.operator_rut || serviceData.provider?.operatorRut || 'Por confirmar';
    const licensePlate = (serviceData.provider?.licensePlate || serviceData.provider?.license_plate || serviceData.provider?.patente || 'Por confirmar').toString().toUpperCase();
    const invoiceText = serviceData.pricing?.needsInvoice
      ? 'Tu factura se emite dentro de los plazos legales del mes en que fue contratada y pagada la reserva, y se envía al correo indicado.'
      : 'El resumen del servicio se enviará al correo electrónico.';
    const durationLabel = serviceData.isPerTrip ? 'Servicio por viaje' : `${serviceData.hours} horas`;
    const extraRows = serviceData.isPerTrip
      ? [{ label: 'Tipo', value: 'Servicio por viaje' }]
      : [
          { label: 'Ingreso a obra', value: serviceData.startTime || '—' },
          { label: 'Salida de obra', value: serviceData.hasRealEnd ? serviceData.endTime : '—' },
        ];

    return (
      <ServiceStateLayout
        topBar={{ showBack: false, showHome: true, onHome: () => navigate('/client/home') }}
        header={{
          icon: <Flag size={22} />,
          title: 'Servicio finalizado',
          subtitle: 'Resumen y cierre del servicio.',
          badgeLabel: 'Finalizado',
          badgeTone: 'success',
          meta: [],
        }}
        primaryTitle="Detalle de cobro"
        primary={(() => {
          const b = getClientBreakdown(serviceData.pricing);
          return (
            <div>
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
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 10, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>Total pagado</span>
                <span style={{ color: '#EC6819', fontSize: 14, fontWeight: 800 }}>{formatPrice(b.total)}</span>
              </div>
            </div>
          );
        })()}
        summary={{
          title: 'Resumen',
          machinery: MACHINERY_NAMES[serviceData.machinery] || serviceData.machinery,
          operatorName,
          operatorRut,
          licensePlate,
          location: serviceData.location,
          duration: durationLabel,
          extraRows,
        }}
        alerts={[{ tone: 'info', title: serviceData.pricing?.needsInvoice ? 'Factura' : 'Resumen', description: invoiceText }]}
        secondaryActions={[{ key: 'to-rating', label: 'Continuar a evaluación', variant: 'primary', onClick: () => setStep('rating') }]}
      />
    );
  }

  // PASO 2: Valorización del proveedor
  if (step === 'rating') {
    const operatorName = serviceData.provider?.providerOperatorName || serviceData.provider?.operator_name || 'Operador';
    const operatorRut = serviceData.provider?.operator_rut || serviceData.provider?.operatorRut || 'Por confirmar';
    const licensePlate = (serviceData.provider?.licensePlate || serviceData.provider?.license_plate || serviceData.provider?.patente || 'Por confirmar').toString().toUpperCase();
    return (
      <ServiceStateLayout
        topBar={{ showBack: false, showHome: true, onHome: () => navigate('/client/home') }}
        header={{
          icon: <Star size={22} />,
          title: 'Evaluación',
          subtitle: 'Califica el servicio.',
          badgeLabel: 'Finalizado',
          badgeTone: 'success',
          meta: [],
        }}
        primaryTitle="Evaluación"
        primary={
          <div>
            <div style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13, marginBottom: 12 }}>
              ¿Cómo calificarías el servicio?
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 16 }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                  data-testid={`star-${star}`}
                >
                  <svg width="40" height="40" viewBox="0 0 44 44" fill="none">
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

            <div>
              <div style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13, marginBottom: 8, fontWeight: 700 }}>
                Comentario (opcional)
              </div>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Comentario"
                rows={4}
                style={{
                  width: '100%',
                  padding: 14,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 12,
                  fontSize: 14,
                  color: 'rgba(255,255,255,0.95)',
                  resize: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
        }
        summary={{
          title: 'Servicio',
          machinery: MACHINERY_NAMES[serviceData.machinery] || serviceData.machinery,
          operatorName,
          operatorRut,
          licensePlate,
          location: serviceData.location,
          duration: serviceData.isPerTrip ? 'Servicio por viaje' : `${serviceData.hours} horas`,
        }}
        alerts={[]}
        secondaryActions={[
          {
            key: 'submit',
            label: 'Enviar evaluación',
            variant: 'primary',
            onClick: handleSubmitRating,
            disabled: rating === 0 || loading,
            loading,
            ariaLabel: loading ? 'Enviando evaluación' : 'Enviar evaluación',
          },
          {
            key: 'skip',
            label: 'Omitir',
            variant: 'outline',
            onClick: () => navigate('/client/home'),
          }
        ]}
      />
    );
  }

  // PASO 3: Confirmación final
  return (
    <ServiceStateLayout
      topBar={{ showBack: false, showHome: true, onHome: () => navigate('/client/home') }}
      header={{
        icon: <CheckCircle2 size={22} />,
        title: 'Evaluación enviada',
        subtitle: 'Redirigiendo al inicio.',
        badgeLabel: 'Finalizado',
        badgeTone: 'success',
        meta: [],
      }}
      primaryTitle="Estado"
      primary={<div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 1.45 }}>Completado.</div>}
      summary={null}
      alerts={[]}
      secondaryActions={[]}
    />
  );
}

export default ServiceFinishedScreen;
