import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import ProviderOnboardingProgress from '../../components/ProviderOnboardingProgress';
import { getProviderBackRoute } from '../../utils/bookingFlow';
import {
  REFERENCE_PRICES,
  REFERENCE_TRANSPORT,
  MAX_PRICE_ABOVE_MARKET_PCT,
  getPriceAlert,
  getTransportAlert,
  MACHINERY_PER_HOUR,
  MACHINERY_PER_SERVICE,
  MACHINERY_NO_TRANSPORT,
  PRICE_CAP_RULE_LABEL,
} from '../../utils/pricing';

/**
 * P07 - Define tus Tarifas (SIMPLIFICADO)
 * Reglas: precio/traslado máx vs mercado; multiplicadores automáticos.
 */

// Alias para compatibilidad con nombres usados en esta pantalla
const NO_TRANSPORT_MACHINES = MACHINERY_NO_TRANSPORT;

// Multiplicadores automáticos por HORAS (solo para maquinaria por hora)
const MULTIPLIERS_HOURS = { 4: 1.20, 5: 1.175, 6: 1.15, 7: 1.125, 8: 1.10 };

// Multiplicadores automáticos por URGENCIA (para maquinaria por servicio/viaje)
const MULTIPLIERS_URGENCY = {
  'urgente': { label: 'Urgente (< 2h)', mult: 1.15, desc: 'Llegada en menos de 2 horas' },
  'express': { label: 'Express (2-4h)', mult: 1.10, desc: 'Llegada entre 2 y 4 horas' },
  'mismo_dia': { label: 'Mismo día', mult: 1.05, desc: 'Llegada en el día' },
  'programada': { label: 'Programada', mult: 1.00, desc: 'Reserva anticipada' }
};

import { MACHINERY_NAMES as MACHINE_NAMES } from '../../utils/machineryNames';
import { getObject } from '../../utils/safeStorage';

const MIN_PRICE_HOUR = 20000;
const MIN_PRICE_SERVICE = 100000;
const MIN_TRANSPORT = 15000;

function PricingScreen() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const backRoute = getProviderBackRoute(pathname);
  const [priceBase, setPriceBase] = useState(() => {
    const savedPricing = getObject('machinePricing', {});
    return savedPricing.priceBase != null
      ? String(savedPricing.priceBase).replace(/\D/g, '').slice(0, 9)
      : '';
  });
  const [transportCost, setTransportCost] = useState(() => {
    const savedPricing = getObject('machinePricing', {});
    return savedPricing.transportCost != null
      ? String(savedPricing.transportCost).replace(/\D/g, '').slice(0, 9)
      : '';
  });
  const [machineType] = useState(() => {
    const machineData = getObject('machineData', {});
    const rawType = machineData.machineryType || machineData.type || 'retroexcavadora';
    const normalizedType = (typeof rawType === 'string' ? rawType : 'retroexcavadora').toLowerCase().trim();
    return normalizedType || 'retroexcavadora';
  });
  const [error, setError] = useState('');
  const [showMultiplierInfo, setShowMultiplierInfo] = useState(false);

  const isPerHour = MACHINERY_PER_HOUR.includes(machineType);
  const needsTransport = !NO_TRANSPORT_MACHINES.includes(machineType);
  const machineName = MACHINE_NAMES[machineType] || 'Maquinaria';
  const refPrice = REFERENCE_PRICES[machineType] || 80000;
  // Máximo = X% del promedio de mercado (evitar precios desproporcionados)
  const maxPrice = Math.round(refPrice * MAX_PRICE_ABOVE_MARKET_PCT);
  const maxTransport = Math.round(REFERENCE_TRANSPORT * MAX_PRICE_ABOVE_MARKET_PCT);
  
  const minPrice = isPerHour ? MIN_PRICE_HOUR : MIN_PRICE_SERVICE;
  
  const priceBaseNum = parseInt(priceBase) || 0;
  const transportNum = parseInt(transportCost) || 0;

  const priceAlert = priceBaseNum >= minPrice ? getPriceAlert(priceBaseNum, refPrice) : null;
  const transportAlert = needsTransport && transportNum >= MIN_TRANSPORT ? getTransportAlert(transportNum) : null;
  const canContinue = needsTransport
    ? priceBaseNum >= minPrice && transportNum >= MIN_TRANSPORT
    : priceBaseNum >= minPrice;

  const formatPrice = (price) => {
    return new Intl.NumberFormat('es-CL', { 
      style: 'currency', currency: 'CLP', maximumFractionDigits: 0 
    }).format(price);
  };

  const handleContinue = () => {
    setError('');
    if (!priceBaseNum || priceBaseNum < minPrice) {
      setError(`El precio mínimo es ${formatPrice(minPrice)}${isPerHour ? '/hora' : ''}`);
      return;
    }
    if (priceBaseNum > maxPrice) {
      setError(`El precio máximo es ${formatPrice(maxPrice)}${isPerHour ? '/hora' : ''}. ${PRICE_CAP_RULE_LABEL}`);
      return;
    }
    if (needsTransport) {
      if (!transportNum || transportNum < MIN_TRANSPORT) {
        setError(`El traslado mínimo es ${formatPrice(MIN_TRANSPORT)}`);
        return;
      }
      if (transportNum > maxTransport) {
        setError(`El traslado máximo es ${formatPrice(maxTransport)}. ${PRICE_CAP_RULE_LABEL}`);
        return;
      }
    }

    const pricing = {
      priceBase: priceBaseNum,
      transportCost: needsTransport ? transportNum : 0,
      needsTransport, isPerHour, machineType
    };
    localStorage.setItem('machinePricing', JSON.stringify(pricing));
    localStorage.setItem('providerOnboardingStep', '5'); // Guardar paso actual
    navigate('/provider/operator-data');
  };

  // Cálculos para maquinaria por hora
  const calculateImmediateExample = (hours) => {
    const mult = MULTIPLIERS_HOURS[hours];
    return Math.round(priceBaseNum * hours * mult);
  };

  // Cálculos para maquinaria por servicio (urgencia)
  const calculateUrgencyExample = (urgencyKey) => {
    const mult = MULTIPLIERS_URGENCY[urgencyKey].mult;
    return Math.round(priceBaseNum * mult);
  };

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 120px', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 25 }}>
          <button onClick={() => navigate(backRoute || -1)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} aria-label="Volver">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          <div style={{ flex: 1 }}><MaqgoLogo size="small" /></div>
          <div style={{ width: 24 }}></div>
        </div>

        <ProviderOnboardingProgress currentStep={4} />

        {/* Título */}
        <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 6 }}>
          Define tus tarifas
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, textAlign: 'center', marginBottom: 20 }}>
          {machineName}
        </p>

        {/* Input precio base */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, display: 'block', marginBottom: 8, fontWeight: 500 }}>
            {isPerHour ? 'Precio por hora neto (sin IVA)' : 'Precio por servicio neto (sin IVA)'}
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#666', fontSize: 16 }}>$</span>
            <input
              type="text"
              inputMode="numeric"
              value={priceBase ? (parseInt(priceBase, 10) || 0).toLocaleString('es-CL') : ''}
              onChange={(e) => setPriceBase(e.target.value.replace(/\D/g, ''))}
              placeholder={refPrice.toLocaleString('es-CL')}
              style={{
                width: '100%', padding: '16px 16px 16px 36px', background: '#F5EFE6',
                border: 'none', borderRadius: 12, fontSize: 18, fontWeight: 600,
                color: '#1A1A1A', boxSizing: 'border-box'
              }}
              data-testid="price-input"
            />
          </div>
          {/* Regla de mercado (ref y máximo) oculta; solo usamos alertas contextuales para guiar precios competitivos */}
          {priceAlert && (
            <div style={{
              marginTop: 8, padding: 10, borderRadius: 8, minHeight: 40,
              background: `${priceAlert.color}20`, border: `1px solid ${priceAlert.color}60`,
              display: 'flex', alignItems: 'center'
            }}>
              <p style={{ color: priceAlert.color, fontSize: 12, fontWeight: 600, margin: 0, lineHeight: 1.4 }}>
                {priceAlert.msg}
              </p>
            </div>
          )}
        </div>

        {/* Input traslado */}
        {needsTransport && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, display: 'block', marginBottom: 8, fontWeight: 500 }}>
              Costo de traslado neto (sin IVA)
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#666', fontSize: 16 }}>$</span>
              <input
                type="text"
                inputMode="numeric"
                value={transportCost ? (parseInt(transportCost, 10) || 0).toLocaleString('es-CL') : ''}
                onChange={(e) => setTransportCost(e.target.value.replace(/\D/g, ''))}
                placeholder="30.000"
                style={{
                  width: '100%', padding: '16px 16px 16px 36px', background: '#F5EFE6',
                  border: 'none', borderRadius: 12, fontSize: 18, fontWeight: 600,
                  color: '#1A1A1A', boxSizing: 'border-box'
                }}
                data-testid="transport-input"
              />
            </div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 6, marginLeft: 4 }}>
              Ref: {formatPrice(REFERENCE_TRANSPORT)} · Máx: {formatPrice(maxTransport)}
            </p>
            {transportAlert && (
              <div style={{
                marginTop: 8, padding: 10, borderRadius: 8, minHeight: 40,
                background: `${transportAlert.color}20`, border: `1px solid ${transportAlert.color}60`,
                display: 'flex', alignItems: 'center'
              }}>
                <p style={{ color: transportAlert.color, fontSize: 12, fontWeight: 600, margin: 0, lineHeight: 1.4 }}>
                  {transportAlert.msg}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Badge sin traslado */}
        {!needsTransport && (
          <div style={{ background: '#2A2A2A', borderRadius: 10, padding: 12, marginBottom: 20 }}>
            <p style={{ color: '#90BDD3', fontSize: 13, margin: 0, textAlign: 'center' }}>
              Tu {machineName} no requiere costo de traslado
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: '#2A2A2A', border: '1px solid #ff6b6b', borderRadius: 10, padding: 12, marginBottom: 20 }}>
            <p style={{ color: '#ff6b6b', fontSize: 13, margin: 0, textAlign: 'center' }}>{error}</p>
          </div>
        )}

        {/* Bonificación - Mensaje de incentivo claro */}
        {priceBaseNum >= minPrice && (
          <div style={{ background: '#363636', borderRadius: 14, padding: 16, marginBottom: 16 }}>
            {/* Header con mensaje de valor - Claro y directo */}
            <div style={{ 
              background: '#2A2A2A', 
              borderRadius: 10, 
              padding: 14, 
              marginBottom: 14,
              textAlign: 'center'
            }}>
              <p style={{ color: '#90BDD3', fontSize: 15, fontWeight: 700, margin: 0 }}>
                {isPerHour ? 'Responde rápido, gana más' : 'Responde rápido, gana más'}
              </p>
            </div>

            <div 
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, cursor: 'pointer' }}
              onClick={() => setShowMultiplierInfo(!showMultiplierInfo)}
            >
              <p style={{ color: '#EC6819', fontSize: 14, fontWeight: 600, margin: 0 }}>
                Ver tabla de bonificaciones
              </p>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ transform: showMultiplierInfo ? 'rotate(180deg)' : 'rotate(0deg)', transition: '0.3s' }}>
                <path d="M6 9L12 15L18 9" stroke="#EC6819" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>

            {/* Tabla de multiplicadores - SIMPLIFICADA sin valores en pesos */}
            {showMultiplierInfo && (
              isPerHour ? (
                // Tabla por HORAS - Solo horas y porcentaje
                <div style={{ marginBottom: 12 }}>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: '0 0 10px', textAlign: 'center' }}>
                    Bonificación según horas contratadas:
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                    {[4, 5, 6, 7, 8].map(h => (
                      <div key={h} style={{ 
                        background: '#2A2A2A', 
                        borderRadius: 8, 
                        padding: '8px 0',
                        textAlign: 'center',
                        flex: 1
                      }}>
                        <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{h}h</div>
                        <div style={{ color: '#90BDD3', fontSize: 12, fontWeight: 600 }}>+{Math.round((MULTIPLIERS_HOURS[h] - 1) * 100)}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                // Tabla por URGENCIA - Simplificada
                <div style={{ marginBottom: 12 }}>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: '0 0 10px', textAlign: 'center' }}>
                    Bonificación según urgencia:
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {Object.entries(MULTIPLIERS_URGENCY).map(([key, data]) => (
                      <div key={key} style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#2A2A2A', 
                        borderRadius: 8, 
                        padding: '8px 12px'
                      }}>
                        <span style={{ color: '#fff', fontSize: 13 }}>{data.label}</span>
                        <span style={{ color: data.mult > 1 ? '#90BDD3' : 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 600 }}>
                          {data.mult > 1 ? `+${Math.round((data.mult - 1) * 100)}%` : 'Precio base'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}

            {/* Comparativa clara: Programada vs Inmediata/Urgente */}
            <div style={{ background: '#2A2A2A', borderRadius: 10, padding: 14, marginTop: 12 }}>
              <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 11, margin: 0, textAlign: 'center', marginBottom: 10 }}>
                {isPerHour ? 'Ejemplo con 4 horas de trabajo:' : 'Ejemplo de servicio urgente:'}
              </p>
              
              <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
                {/* Programada */}
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 11, margin: 0 }}>Programada</p>
                  <p style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: '4px 0 0' }}>
                    {formatPrice(isPerHour ? priceBaseNum * 4 : priceBaseNum)}
                  </p>
                </div>
                
                {/* Flecha */}
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12H19M19 12L13 6M19 12L13 18" stroke="#90BDD3" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                
                {/* Inmediata/Urgente */}
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: '#90BDD3', fontSize: 11, margin: 0, fontWeight: 600 }}>
                    {isPerHour ? 'INMEDIATA' : 'URGENTE'}
                  </p>
                  <p style={{ color: '#EC6819', fontSize: 18, fontWeight: 700, margin: '4px 0 0' }}>
                    {formatPrice(isPerHour ? calculateImmediateExample(4) : calculateUrgencyExample('urgente'))}
                  </p>
                </div>
              </div>
              
              <p style={{ color: '#90BDD3', fontSize: 13, fontWeight: 600, margin: '10px 0 0', textAlign: 'center' }}>
                +{formatPrice(
                  isPerHour 
                    ? calculateImmediateExample(4) - (priceBaseNum * 4) 
                    : calculateUrgencyExample('urgente') - priceBaseNum
                )} extra por {isPerHour ? 'estar disponible' : 'responder rápido'}
              </p>
            </div>
          </div>
        )}

      </div>

      {/* Botón fijo - siempre visible */}
      <div className="maqgo-fixed-bottom-bar">
        <button 
          className="maqgo-btn-primary"
          onClick={handleContinue}
          disabled={!canContinue}
          style={{
            opacity: canContinue ? 1 : 0.55,
            background: canContinue ? undefined : '#5a5a5a',
            cursor: canContinue ? 'pointer' : 'not-allowed'
          }}
          data-testid="continue-btn"
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

export default PricingScreen;
