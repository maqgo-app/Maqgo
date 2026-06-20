import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { playServiceCompletedSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';
import { CheckCircle2 } from 'lucide-react';

import BACKEND_URL from '../../utils/api';
import { MACHINERY_NAMES, isPerTripMachineryType } from '../../utils/machineryNames';
import { CON_FACTURA_FACTOR, getClientBreakdown } from '../../utils/pricing';
import { getObject, getObjectFirst } from '../../utils/safeStorage';
import { getBookingLocationLineOrEmpty } from '../../utils/mapPlaceToAddress';
import { getOperatorDisplayNameForSite, getOperatorRutDisplayForSite, getProviderLicensePlateDisplay } from '../../utils/providerDisplay';
import ServiceSecondaryActions from '../../components/serviceState/ServiceSecondaryActions';
import MaqgoLogo from '../../components/MaqgoLogo';
import MaqgoCard from '../../components/base/MaqgoCard';

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

  {
    const operatorName = getOperatorDisplayNameForSite(serviceData.provider) || 'Operador asignado';
    const operatorRut = getOperatorRutDisplayForSite(serviceData.provider);
    const licensePlate = getProviderLicensePlateDisplay(serviceData.provider);
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

    const b = getClientBreakdown(serviceData.pricing);

    return (
      <div className="maqgo-app maqgo-client-funnel">
        <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 24px' }}>
          <div className="w-full mx-auto" style={{ maxWidth: 520 }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <MaqgoLogo customSize={120} />
            </div>

            <div style={{ height: 10 }} />

            <div style={{ textAlign: 'center', padding: '6px 0 14px' }}>
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 999,
                  background: 'rgba(144, 189, 211, 0.18)',
                  border: '1px solid rgba(144, 189, 211, 0.28)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 10px'
                }}
                aria-hidden="true"
              >
                <CheckCircle2 size={22} color="#90BDD3" />
              </div>
              <div style={{ color: '#fff', fontSize: 22, fontWeight: 900, lineHeight: 1.15 }}>Servicio finalizado</div>
              <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 13, marginTop: 6 }}>Resumen de tu reserva</div>
            </div>

            <MaqgoCard>
              <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.9 }}>
                Datos de tu reserva
              </div>

              <div style={{ height: 10 }} />

              {[
                ['Maquinaria', MACHINERY_NAMES[serviceData.machinery] || serviceData.machinery || 'Por confirmar'],
                ['Operador', operatorName],
                ['RUT operador', operatorRut],
                ['Patente', licensePlate],
                ['Ubicación de la obra', serviceData.location || 'Por confirmar'],
                ['Duración contratada', durationLabel],
                ...extraRows.map((r) => [r.label, r.value]),
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12 }}>{label}</div>
                  <div style={{ color: '#fff', fontSize: 12, fontWeight: 800, textAlign: 'right', maxWidth: '62%' }}>{value}</div>
                </div>
              ))}
            </MaqgoCard>

            <div style={{ height: 10 }} />

            <MaqgoCard>
              <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.9 }}>
                Detalle del cobro
              </div>

              <div style={{ height: 10 }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'rgba(255,255,255,0.90)', fontSize: 12 }}>
                  Servicio {serviceData.isPerTrip ? '(viaje)' : `(${serviceData.hours}h)`}
                </span>
                <span style={{ color: '#fff', fontSize: 12 }}>{formatPrice(b.service)}</span>
              </div>

              {b.transport > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: 'rgba(255,255,255,0.90)', fontSize: 12 }}>Traslado</span>
                  <span style={{ color: '#fff', fontSize: 12 }}>{formatPrice(b.transport)}</span>
                </div>
              ) : null}

              {b.bonus > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: 'rgba(255,255,255,0.90)', fontSize: 12 }}>Alta demanda</span>
                  <span style={{ color: '#fff', fontSize: 12 }}>{formatPrice(b.bonus)}</span>
                </div>
              ) : null}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'rgba(255,255,255,0.90)', fontSize: 12 }}>
                  Tarifa por Servicio MAQGO{b.needsInvoice ? ' (neta)' : ' (IVA incluido)'}
                </span>
                <span style={{ color: '#fff', fontSize: 12 }}>{formatPrice(b.needsInvoice ? b.tarifaNeta : b.tarifaConIva)}</span>
              </div>

              {b.needsInvoice && b.ivaTotal > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: 'rgba(255,255,255,0.90)', fontSize: 12 }}>IVA (19%)</span>
                  <span style={{ color: '#fff', fontSize: 12 }}>{formatPrice(b.ivaTotal)}</span>
                </div>
              ) : null}

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.20)', paddingTop: 10, marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>Total pagado</span>
                <span style={{ color: '#EC6819', fontSize: 13, fontWeight: 900 }}>{formatPrice(b.total)}</span>
              </div>
            </MaqgoCard>

            <div style={{ height: 10 }} />

            <MaqgoCard style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: 13, lineHeight: 1.45 }}>{invoiceText}</div>
            </MaqgoCard>

            <div style={{ height: 14 }} />

            <ServiceSecondaryActions
              actions={[{ key: 'to-rating', label: 'Continuar a evaluación', variant: 'primary', onClick: () => navigate('/client/rate') }]}
            />
          </div>
        </div>
      </div>
    );
  }
}

export default ServiceFinishedScreen;
