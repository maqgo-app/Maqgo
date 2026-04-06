import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';

import BACKEND_URL from '../../utils/api';
import { IMMEDIATE_MULTIPLIERS, MACHINERY_PER_HOUR, MACHINERY_NO_TRANSPORT } from '../../utils/pricing';
import { MACHINERY_NAMES, getMachineryId, isPerTripMachineryType } from '../../utils/machineryNames';
import { getObject, getObjectFirst } from '../../utils/safeStorage';
import { getProviderLandingPath } from '../../utils/providerOnboardingStatus';

/**
 * Pantalla: Servicio Finalizado (PROVEEDOR)
 * 
 * Flujo: Servicio completado → Valorar cliente → Voucher con ganancias
 * 
 * El voucher se muestra DESPUÉS de valorar (o si omite valorar)
 */
function ProviderServiceFinishedScreen() {
  const navigate = useNavigate();
  const [step, setStep] = useState('rating'); // 'rating' | 'voucher' (MAQGO factura al cliente, proveedor factura a MAQGO)
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [orderNumber] = useState(() => localStorage.getItem('orderNumber') || `MQ-${Date.now().toString().slice(-8)}`);
  
  // Datos del servicio y cliente para facturación
  const [serviceData] = useState(() => {
    // Cargar datos del servicio
    const request = getObjectFirst(['acceptedRequest', 'incomingRequest'], {});
    const savedProvider = getObject('selectedProvider', {});
    const machineData = getObject('machineData', {});
    
    // Obtener tipo de maquinaria: primero de request, luego de machineData, luego fallback
    let machinery = request.machineryType || request.machineryId || machineData.machineryType || localStorage.getItem('selectedMachinery') || 'retroexcavadora';
    const machineryId = getMachineryId(machinery);
    const reservationType = request.reservationType || localStorage.getItem('reservationType') || 'immediate';
    const hours = request.hours || parseInt(localStorage.getItem('selectedHours') || '4');
    const basePrice = request.base_price_hr || request.basePrice || savedProvider.price_per_hour || 80000;
    
    // Determinar si necesita traslado
    const needsTransport = !MACHINERY_NO_TRANSPORT.includes(machineryId);
    const transportCost = needsTransport
      ? (request.transport_cost ?? request.transportFee ?? savedProvider.transport_fee ?? 35000)
      : 0;
    
    // Prioridad: usar montos reales del request/backend cuando existen.
    const reqServiceAmount = Number(request.service_amount ?? request.serviceAmount);
    const reqBonusAmount = Number(request.bonus_amount ?? request.bonusAmount ?? 0);
    const reqTransportAmount = Number(request.transport_amount ?? request.transportAmount ?? transportCost);
    const reqGrossTotal = Number(request.gross_total ?? request.grossTotal);
    const reqServiceFee = Number(request.service_fee ?? request.serviceFee);
    const reqNetTotal = Number(request.net_total ?? request.netTotal);
    const hasBackendFinancials = Number.isFinite(reqServiceAmount) && reqServiceAmount > 0;

    let serviceBase;
    let serviceWithMultiplier;
    let bonusAmount;
    let grossTotal;
    let totalServiceFee;
    let netTotal;
    let finalTransportAmount;

    if (hasBackendFinancials) {
      serviceWithMultiplier = reqServiceAmount;
      bonusAmount = Number.isFinite(reqBonusAmount) ? reqBonusAmount : 0;
      finalTransportAmount = Number.isFinite(reqTransportAmount) ? reqTransportAmount : 0;
      grossTotal = Number.isFinite(reqGrossTotal) ? reqGrossTotal : (serviceWithMultiplier + finalTransportAmount);
      totalServiceFee = Number.isFinite(reqServiceFee) ? reqServiceFee : (grossTotal * 0.119);
      netTotal = Number.isFinite(reqNetTotal) ? reqNetTotal : (grossTotal - totalServiceFee);
      serviceBase = serviceWithMultiplier - bonusAmount;
    } else {
      const multiplier = reservationType === 'immediate' ? (IMMEDIATE_MULTIPLIERS[hours] || 1.20) : 1;
      const isPerHour = MACHINERY_PER_HOUR.includes(machineryId);
      serviceBase = isPerHour ? basePrice * hours : basePrice;
      serviceWithMultiplier = serviceBase * multiplier;
      bonusAmount = serviceWithMultiplier - serviceBase;
      finalTransportAmount = transportCost;
      grossTotal = serviceWithMultiplier + finalTransportAmount;
      const maqgoFee = grossTotal * 0.10;
      const maqgoFeeIva = maqgoFee * 0.19;
      totalServiceFee = maqgoFee + maqgoFeeIva;
      netTotal = grossTotal - totalServiceFee;
    }
    
    return {
      client: {
        id: request.clientId || request.client_id,
        name: request.clientName || 'Carlos González',
        rating: request.clientRating || 4.7
      },
      machinery: machineryId,
      hours,
      location: request.location || localStorage.getItem('serviceLocation') || 'Santiago',
      earnings: {
        grossTotal: Math.round(grossTotal),
        serviceFee: Math.round(totalServiceFee),
        netTotal: Math.round(netTotal),
        serviceAmount: Math.round(serviceWithMultiplier),
        serviceBase: Math.round(serviceBase),
        transportAmount: Math.round(finalTransportAmount),
        bonusAmount: Math.round(bonusAmount),
        // Monto que debe facturar el proveedor a MAQGO (subtotal menos tarifa plataforma)
        invoiceAmount: Math.round(grossTotal),
        invoiceIva: Math.round(grossTotal * 0.19),
        invoiceTotal: Math.round(grossTotal * 1.19)
      }
    };
  });

  const formatPrice = (price) => {
    return new Intl.NumberFormat('es-CL', { 
      style: 'currency', currency: 'CLP', maximumFractionDigits: 0 
    }).format(price || 0);
  };

  const handleSubmitRating = async () => {
    setLoading(true);
    
    try {
      const serviceId = localStorage.getItem('currentServiceId');
      const userId = localStorage.getItem('userId');
      
      if (rating > 0) {
        await axios.post(`${BACKEND_URL}/api/ratings`, {
          serviceId,
          fromUserId: userId,
          toUserId: serviceData.client.id,
          stars: rating,
          comment,
          type: 'provider_to_client'
        });
      }
    } catch (e) {
      console.error('Error submitting rating:', e);
    }
    
    setLoading(false);
    setStep('voucher');
  };

  const handleSkipRating = () => {
    setStep('voucher');
  };

  const handleFinish = async () => {
    // Guardar servicio completado para upload de factura (con transaction_id)
    localStorage.setItem('lastCompletedService', JSON.stringify({
      id: localStorage.getItem('currentServiceId') || `srv-${Date.now()}`,
      transactionId: orderNumber,
      machineryType: serviceData.machinery,
      hours: serviceData.hours,
      clientName: serviceData.client.name,
      serviceAmount: serviceData.earnings.serviceAmount,
      bonusAmount: serviceData.earnings.bonusAmount,
      transportAmount: serviceData.earnings.transportAmount,
      net_total: serviceData.earnings.netTotal,
      date: new Date().toISOString()
    }));
    // Crear servicio en backend para tracking (proveedor sube factura a MAQGO desde Mis Cobros)
    try {
      const providerId = localStorage.getItem('providerId') || localStorage.getItem('userId') || 'demo-provider-001';
      await axios.post(`${BACKEND_URL}/api/services/create`, {
        provider_id: providerId,
        client_id: serviceData.client.id || 'demo-client',
        client_name: serviceData.client.name,
        machinery_type: serviceData.machinery,
        hours: serviceData.hours,
        location: serviceData.location,
        gross_total: serviceData.earnings.grossTotal,
        service_fee: serviceData.earnings.serviceFee,
        net_total: serviceData.earnings.netTotal,
        service_amount: serviceData.earnings.serviceAmount,
        bonus_amount: serviceData.earnings.bonusAmount,
        transport_amount: serviceData.earnings.transportAmount,
        invoice_amount: serviceData.earnings.netTotal,
        invoice_total: Math.round(serviceData.earnings.netTotal * 1.19),
        transaction_id: orderNumber
      });
    } catch (error) {
      console.error('Error creating service record:', error);
    }
    // Limpiar datos del servicio
    localStorage.removeItem('acceptedRequest');
    localStorage.removeItem('incomingRequest');
    localStorage.removeItem('currentServiceId');
    localStorage.removeItem('assignedOperator');
    localStorage.removeItem('providerArrived');
    localStorage.removeItem('serviceStarted');
    navigate(getProviderLandingPath());
  };

  // Valorización del cliente
  if (step === 'rating') {
    return (
      <div className="maqgo-app maqgo-provider-funnel">
        <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 24px' }}>
          {/* Header */}
          <div style={{ marginBottom: 20, textAlign: 'center' }}>
            <MaqgoLogo size="small" />
          </div>

          {/* Estado completado */}
          <div style={{
            background: 'rgba(144, 189, 211, 0.15)',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M5 13L9 17L19 7" stroke="#90BDD3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ color: '#90BDD3', fontSize: 13, fontWeight: 600 }}>
              SERVICIO COMPLETADO
            </span>
          </div>

          {/* Título */}
          <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 8 }}>
            Evalúa al cliente
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
            Tu opinión ayuda a la comunidad MAQGO
          </p>

          {/* Info cliente */}
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
                Cliente MAQGO
              </p>
              <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: 0 }}>
                Servicio completado
              </p>
            </div>
          </div>

          {/* Estrellas */}
          <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, textAlign: 'center', marginBottom: 16 }}>
            ¿Cómo fue la experiencia con este cliente?
          </p>
          
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 24 }}>
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

          {/* Comentario */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, marginBottom: 8, display: 'block' }}>
              Comentario (opcional)
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="¿Algo que destacar del cliente?"
              rows={3}
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
            disabled={loading}
            aria-busy={loading}
            aria-label={loading ? 'Enviando evaluación' : (rating > 0 ? 'Enviar evaluación' : 'Continuar sin evaluar')}
            style={{ marginBottom: 12 }}
            data-testid="submit-rating-btn"
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'maqgo-spin 0.8s linear infinite' }} />
                Enviando...
              </span>
            ) : (
              rating > 0 ? 'Enviar evaluación' : 'Continuar sin evaluar'
            )}
          </button>
          
          <button 
            onClick={handleSkipRating}
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
            data-testid="skip-rating-btn"
          >
            Omitir y ver detalle
          </button>
        </div>
      </div>
    );
  }

  // PASO 2: Resumen de servicio con ganancias
  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 20px 20px' }}>
        {/* Header */}
        <div style={{ marginBottom: 12, textAlign: 'center' }}>
          <MaqgoLogo size="small" />
        </div>

        {/* Éxito */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{
            width: 50,
            height: 50,
            borderRadius: '50%',
            background: 'rgba(144, 189, 211, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 10px'
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M5 13L9 17L19 7" stroke="#90BDD3" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>
            ¡Servicio completado!
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: 0 }}>
            Orden #{orderNumber}
          </p>
        </div>

        {/* Ganancia neta destacada */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(144, 189, 211, 0.2) 0%, rgba(144, 189, 211, 0.1) 100%)',
          border: '2px solid #90BDD3',
          borderRadius: 14,
          padding: 24,
          marginBottom: 14,
          textAlign: 'center'
        }}>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: 0, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
            Tu ganancia
          </p>
          <p style={{ color: '#90BDD3', fontSize: 36, fontWeight: 700, margin: 0 }}>
            {formatPrice(serviceData.earnings.netTotal)}
          </p>
        </div>

        {/* Desglose de ganancias */}
        <div style={{
          background: '#2A2A2A',
          borderRadius: 12,
          padding: 14,
          marginBottom: 12
        }}>
          <div style={{ 
            color: 'rgba(255,255,255,0.95)', 
            fontSize: 12, 
            textTransform: 'uppercase', 
            letterSpacing: 1,
            marginBottom: 10
          }}>
            Desglose de ganancias
          </div>

          {/* Servicio */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>
              {isPerTripMachineryType(serviceData.machinery) ? 'Servicio (viaje)' : `Servicio (${serviceData.hours}h)`}
            </span>
            <span style={{ color: '#fff', fontSize: 12 }}>
              {formatPrice(serviceData.earnings.serviceBase || serviceData.earnings.serviceAmount)}
            </span>
          </div>

          {/* Bonificación alta demanda - Solo si aplica */}
          {serviceData.earnings.bonusAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>Bonificación alta demanda</span>
              <span style={{ color: '#fff', fontSize: 12 }}>{formatPrice(serviceData.earnings.bonusAmount)}</span>
            </div>
          )}

          {/* Traslado - Solo si aplica */}
          {serviceData.earnings.transportAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>Traslado</span>
              <span style={{ color: '#fff', fontSize: 12 }}>{formatPrice(serviceData.earnings.transportAmount)}</span>
            </div>
          )}

          {/* Subtotal (tu servicio) */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, paddingTop: 6, borderTop: '1px solid #444' }}>
            <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>Subtotal</span>
            <span style={{ color: '#fff', fontSize: 12 }}>{formatPrice(serviceData.earnings.grossTotal)}</span>
          </div>

          {/* Descuento tarifa por servicio */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12 }}>Descuento tarifa por servicio</span>
            <span style={{ color: '#F44336', fontSize: 12 }}>-{formatPrice(serviceData.earnings.serviceFee)}</span>
          </div>

          {/* Tu ganancia */}
          <div style={{ 
            borderTop: '1px solid #444', 
            paddingTop: 10,
            display: 'flex', 
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Tu ganancia</span>
            <span style={{ color: '#90BDD3', fontSize: 20, fontWeight: 700 }}>
              {formatPrice(serviceData.earnings.netTotal)}
            </span>
          </div>
        </div>

        {/* Info del servicio */}
        <div style={{
          background: '#2A2A2A',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: '#444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg width="20" height="16" viewBox="0 0 40 32" fill="none">
                <rect x="4" y="16" width="24" height="10" rx="2" fill="#EC6819"/>
                <rect x="20" y="10" width="10" height="8" rx="1" fill="#EC6819"/>
                <circle cx="10" cy="28" r="3" fill="#fff"/>
                <circle cx="22" cy="28" r="3" fill="#fff"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 500 }}>
                {MACHINERY_NAMES[serviceData.machinery] || serviceData.machinery}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13 }}>
                {isPerTripMachineryType(serviceData.machinery) ? 'Valor viaje' : `${serviceData.hours}h`} · {serviceData.location}
              </div>
            </div>
          </div>
        </div>

        {/* Info de pago */}
        <div
          style={{
            background: 'rgba(144, 189, 211, 0.1)',
            border: '1px solid rgba(144, 189, 211, 0.3)',
            borderRadius: 10,
            padding: 14,
            marginBottom: 20
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'rgba(144, 189, 211, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#90BDD3" strokeWidth="2" />
                <path d="M12 6V12L16 14" stroke="#90BDD3" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p style={{ color: '#90BDD3', fontSize: 14, fontWeight: 600, margin: 0 }}>
                Sube tu factura 24 h después del servicio · Pago en 2 días hábiles tras subirla
              </p>
              <p
                style={{
                  color: 'rgba(255,255,255,0.9)',
                  fontSize: 13,
                  margin: '2px 0 0',
                  lineHeight: 1.5
                }}
              >
                Factura dirigida a MAQGO (desde Mis Cobros).
                <br />
                Ante cualquier duda sobre este servicio, contáctanos en soporte@maqgo.cl.
              </p>
            </div>
          </div>
        </div>

        {/* Botón finalizar */}
        <button 
          className="maqgo-btn-primary"
          onClick={handleFinish}
          data-testid="finish-service-btn"
        >
          Volver al inicio
        </button>
      </div>
    </div>
  );
}

export default ProviderServiceFinishedScreen;
