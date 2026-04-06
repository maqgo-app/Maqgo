import React, { useState, useEffect, useRef } from 'react';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { useNavigate, useLocation } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import ProviderOnboardingProgress from '../../components/ProviderOnboardingProgress';
import { useToast } from '../../components/Toast';
import { getArray, getObject } from '../../utils/safeStorage';
import { getProviderBackRoute } from '../../utils/bookingFlow';
import { getMachineryId, MACHINERY_NAMES as MACHINE_NAMES } from '../../utils/machineryNames';
import {
  REFERENCE_PRICES,
  REFERENCE_TRANSPORT,
  MAX_PRICE_ABOVE_MARKET_PCT,
  getPriceAlert,
  getTransportAlert,
  MACHINERY_PER_HOUR,
  needsTransportMachinery,
  PRICE_CAP_RULE_LABEL,
} from '../../utils/pricing';
import { compressImage, MAX_PHOTOS } from '../../utils/machinePhotoLocal';

/**
 * Onboarding proveedor: fotos (opcional) + tarifas en una sola vista.
 * Fotos: uso interno / respaldo; comprimir agresivo para poco peso en localStorage (móvil).
 */
const MULTIPLIERS_HOURS = { 4: 1.2, 5: 1.175, 6: 1.15, 7: 1.125, 8: 1.1 };
const MULTIPLIERS_URGENCY = {
  urgente: { label: 'Urgente (< 2h)', mult: 1.15, desc: 'Llegada en menos de 2 horas' },
  express: { label: 'Express (2-4h)', mult: 1.1, desc: 'Llegada entre 2 y 4 horas' },
  mismo_dia: { label: 'Mismo día', mult: 1.05, desc: 'Llegada en el día' },
  programada: { label: 'Programada', mult: 1.0, desc: 'Reserva anticipada' },
};
const MIN_PRICE_HOUR = 20000;
const MIN_PRICE_SERVICE = 100000;
const MIN_TRANSPORT = 15000;

/**
 * Orientación vs referencia MAQGO (no validación; no bloquea envío).
 * @returns {{ text: string, level: 'positive' | 'warning' | 'neutral' } | null}
 */
function getPriceImpactLabel(price, reference) {
  if (!price) return null;

  if (price < reference * 0.75) {
    return {
      text: 'Precio competitivo que podría aumentar tus solicitudes',
      level: 'positive',
    };
  }

  if (price > reference * 1.4) {
    return {
      text: 'Este precio podría reducir tus probabilidades de ser elegido',
      level: 'warning',
    };
  }

  return {
    text: 'Precio dentro del rango esperado en tu zona',
    level: 'neutral',
  };
}

const inputHintStyle = {
  fontSize: 12,
  color: '#6B7280',
  marginTop: 4,
  marginBottom: 0,
  lineHeight: 1.35,
};

function MachinePhotosPricingScreen() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const toast = useToast();
  const backRoute = getProviderBackRoute(pathname) || '/provider/machine-data';
  const prevMachineTypeRef = useRef(null);

  const [photos, setPhotos] = useState(() => getArray('machinePhotos', []));
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
  const [error, setError] = useState('');
  const [showMultiplierInfo, setShowMultiplierInfo] = useState(false);

  const machineDataSnapshot = getObject('machineData', {});
  const rawMachinery =
    machineDataSnapshot.machineryType || machineDataSnapshot.type || 'retroexcavadora';
  const machineType =
    getMachineryId(rawMachinery) ||
    (typeof rawMachinery === 'string' ? rawMachinery.toLowerCase().trim() : '') ||
    'retroexcavadora';
  const needsTransport = needsTransportMachinery(rawMachinery);
  const isPerHour = MACHINERY_PER_HOUR.includes(machineType);
  const machineName = MACHINE_NAMES[machineType] || 'Maquinaria';
  const refPrice = REFERENCE_PRICES[machineType] || 80000;
  const maxPrice = Math.round(refPrice * MAX_PRICE_ABOVE_MARKET_PCT);
  const maxTransport = Math.round(REFERENCE_TRANSPORT * MAX_PRICE_ABOVE_MARKET_PCT);
  const minPrice = isPerHour ? MIN_PRICE_HOUR : MIN_PRICE_SERVICE;
  const priceBaseNum = parseInt(priceBase, 10) || 0;
  const transportNum = parseInt(transportCost, 10) || 0;

  useEffect(() => {
    if (prevMachineTypeRef.current === null) {
      prevMachineTypeRef.current = machineType;
      return;
    }
    if (prevMachineTypeRef.current !== machineType) {
      setPriceBase('');
      setTransportCost('');
      toast.info('Se actualizaron las tarifas sugeridas según el tipo de máquina');
      prevMachineTypeRef.current = machineType;
    }
  }, [machineType, toast]);

  const priceAlert = priceBaseNum >= minPrice ? getPriceAlert(priceBaseNum, refPrice) : null;
  const transportAlert = needsTransport && transportNum >= MIN_TRANSPORT ? getTransportAlert(transportNum) : null;
  const canContinue = needsTransport
    ? priceBaseNum >= minPrice && transportNum >= MIN_TRANSPORT
    : priceBaseNum >= minPrice;

  const priceImpact = getPriceImpactLabel(priceBaseNum, refPrice);

  const formatPrice = (price) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(price);

  const handleAddPhoto = (e) => {
    if (photos.length >= MAX_PHOTOS) return;
    const file = e?.target?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const photoLabels = ['Frontal', 'Lateral', 'Trasera'];
    const label = photoLabels[photos.length] || `Foto ${photos.length + 1}`;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const dataUrl = event.target.result;
        const compressed = await compressImage(dataUrl);
        const newPhoto = { url: compressed, label };
        const updated = [...photos, newPhoto];
        setPhotos(updated);
        localStorage.setItem('machinePhotos', JSON.stringify(updated));
      } catch (err) {
        console.error('Error al procesar la foto:', err);
        const newPhoto = { url: event.target.result, label };
        const updated = [...photos, newPhoto];
        setPhotos(updated);
        localStorage.setItem('machinePhotos', JSON.stringify(updated));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemovePhoto = (index) => {
    const updated = photos.filter((_, i) => i !== index);
    setPhotos(updated);
    localStorage.setItem('machinePhotos', JSON.stringify(updated));
  };

  const updatePhotoLabel = (index, newLabel) => {
    setPhotos((prev) => {
      const updated = prev.map((p, i) => {
        if (i !== index) return p;
        if (typeof p === 'string') return { url: p, label: newLabel };
        return { ...p, label: newLabel };
      });
      localStorage.setItem('machinePhotos', JSON.stringify(updated));
      return updated;
    });
  };

  const calculateImmediateExample = (hours) => {
    const mult = MULTIPLIERS_HOURS[hours];
    return Math.round(priceBaseNum * hours * mult);
  };

  const calculateUrgencyExample = (urgencyKey) => {
    const mult = MULTIPLIERS_URGENCY[urgencyKey].mult;
    return Math.round(priceBaseNum * mult);
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
      needsTransport,
      isPerHour,
      machineType,
    };
    localStorage.setItem('machinePricing', JSON.stringify(pricing));
    // Misma numeración que PricingScreen legacy: tras tarifas → paso 5 (operador).
    localStorage.setItem('providerOnboardingStep', '5');
    navigate('/provider/operator-data');
  };

  const sectionTitle = {
    color: '#fff',
    fontSize: 17,
    fontWeight: 700,
    margin: '0 0 10px',
    fontFamily: "'Space Grotesk', sans-serif",
  };

  const sectionCard = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  };

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div
        className="maqgo-screen"
        style={{ padding: 'var(--maqgo-screen-padding-top) 24px 140px', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
          <button
            type="button"
            onClick={() => navigate(backRoute)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#fff' }}
            aria-label="Volver"
          >
            <BackArrowIcon />
          </button>
          <div style={{ flex: 1 }}>
            <MaqgoLogo size="small" />
          </div>
          <div style={{ width: 24 }} />
        </div>

        <ProviderOnboardingProgress currentStep={3} />

        <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 8 }}>
          Fotos y tarifas
        </h1>
        <p
          style={{
            color: 'rgba(255,255,255,0.82)',
            fontSize: 14,
            textAlign: 'center',
            marginBottom: 10,
            lineHeight: 1.45,
            padding: '0 4px',
          }}
        >
          Fotos opcionales. Tarifas obligatorias para publicar.
        </p>
        <p style={{ textAlign: 'center', marginBottom: 22 }}>
          <button
            type="button"
            onClick={() =>
              document.getElementById('seccion-tarifas')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            style={{
              background: 'none',
              border: 'none',
              color: '#90BDD3',
              cursor: 'pointer',
              fontSize: 14,
              textDecoration: 'underline',
              padding: 4,
            }}
          >
          </button>
        </p>

        {/* —— Fotos —— */}
        <div style={sectionCard}>
          <h2 style={sectionTitle}>Fotos de la máquina</h2>
          <p style={{ color: 'rgba(255,255,255,0.88)', fontSize: 14, marginBottom: 14, lineHeight: 1.45 }}>
            Hasta 3: frontal, lateral o trasera.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <div
              style={{
                background: 'rgba(144, 189, 211, 0.2)',
                border: '1px solid #90BDD3',
                borderRadius: 20,
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M4 8L7 11L12 5"
                  stroke="#90BDD3"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span style={{ color: '#90BDD3', fontSize: 13, fontWeight: 600 }}>
                {photos.length === 0
                  ? 'Sin fotos'
                  : `${photos.length} foto${photos.length !== 1 ? 's' : ''}`}
              </span>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 12,
            }}
          >
            {photos.map((photo, index) => {
              const currentLabel =
                typeof photo === 'object' ? photo.label || `Foto ${index + 1}` : `Foto ${index + 1}`;
              const labelOptions = ['Frontal', 'Lateral', 'Trasera'];
              return (
                <div key={index}>
                  <div
                    style={{
                      position: 'relative',
                      background: '#363636',
                      borderRadius: 12,
                      overflow: 'hidden',
                      aspectRatio: '4/3',
                    }}
                  >
                    <img
                      src={typeof photo === 'string' ? photo : photo.url}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        background: 'rgba(0,0,0,0.7)',
                        padding: '4px 8px',
                        fontSize: 13,
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 6,
                      }}
                    >
                      <span>{currentLabel}</span>
                      <span style={{ color: '#90BDD3', fontWeight: 600 }}>✓ Cargada</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(index)}
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: 'rgba(255,107,107,0.9)',
                        border: 'none',
                        color: '#fff',
                        fontSize: 16,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {labelOptions.map((type) => {
                      const isActive = currentLabel === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => updatePhotoLabel(index, type)}
                          style={{
                            borderRadius: 16,
                            border: isActive ? '1px solid #EC6819' : '1px solid #555',
                            padding: '4px 10px',
                            fontSize: 13,
                            background: isActive ? 'rgba(236, 104, 25, 0.15)' : 'transparent',
                            color: isActive ? '#EC6819' : 'rgba(255,255,255,0.8)',
                            cursor: 'pointer',
                          }}
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {photos.length < MAX_PHOTOS && (
              <div
                style={{
                  gridColumn: '1 / -1',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                    justifyContent: 'stretch',
                  }}
                >
                  {/* Cámara: capture pide lente trasera en móvil (mejor para la máquina) */}
                  <label
                    style={{
                      flex: '1 1 140px',
                      minHeight: 120,
                      background: '#363636',
                      border: '2px dashed #555',
                      borderRadius: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: '#EC6819',
                      padding: '12px 8px',
                      boxSizing: 'border-box',
                    }}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleAddPhoto}
                      style={{ display: 'none' }}
                      aria-label={
                        photos.length === 0
                          ? 'Tomar foto frontal con la cámara del celular'
                          : 'Tomar foto opcional con la cámara del celular'
                      }
                    />
                    <svg width="36" height="36" viewBox="0 0 40 40" fill="none" aria-hidden>
                      <rect x="4" y="8" width="32" height="24" rx="3" stroke="#EC6819" strokeWidth="2" fill="none" />
                      <circle cx="12" cy="16" r="3" stroke="#EC6819" strokeWidth="2" fill="none" />
                      <path
                        d="M8 28L14 22L18 26L26 18L32 24"
                        stroke="#EC6819"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx="30" cy="12" r="6" fill="#2D2D2D" stroke="#EC6819" strokeWidth="2" />
                      <path d="M30 9V15M27 12H33" stroke="#EC6819" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span style={{ fontSize: 13, marginTop: 8, textAlign: 'center', fontWeight: 600 }}>
                      Tomar foto
                    </span>
                  </label>
                  <label
                    style={{
                      flex: '1 1 140px',
                      minHeight: 120,
                      background: '#363636',
                      border: '2px dashed #555',
                      borderRadius: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: '#90BDD3',
                      padding: '12px 8px',
                      boxSizing: 'border-box',
                    }}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAddPhoto}
                      style={{ display: 'none' }}
                      aria-label={
                        photos.length === 0
                          ? 'Elegir foto frontal desde galería o archivos'
                          : 'Elegir foto opcional desde galería o archivos'
                      }
                    />
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
                      <circle cx="8.5" cy="9.5" r="1.5" fill="currentColor" />
                    </svg>
                    <span style={{ fontSize: 13, marginTop: 8, textAlign: 'center', fontWeight: 600 }}>
                      Galería
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* —— Tarifas —— */}
        <div
          style={{ ...sectionCard, scrollMarginTop: 72 }}
          id="seccion-tarifas"
        >
          <h2 style={sectionTitle}>Define tus tarifas</h2>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, textAlign: 'center', marginBottom: 16 }}>
            {machineName}
          </p>

          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                color: 'rgba(255,255,255,0.8)',
                fontSize: 14,
                display: 'block',
                marginBottom: 8,
                fontWeight: 500,
              }}
            >
              {isPerHour ? 'Precio por hora neto (sin IVA)' : 'Precio por servicio neto (sin IVA)'}
            </label>
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: 16,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#666',
                  fontSize: 16,
                }}
              >
                $
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={priceBase ? (parseInt(priceBase, 10) || 0).toLocaleString('es-CL') : ''}
                onChange={(e) => setPriceBase(e.target.value.replace(/\D/g, ''))}
                placeholder={refPrice.toLocaleString('es-CL')}
                style={{
                  width: '100%',
                  padding: '16px 16px 16px 36px',
                  background: '#F5EFE6',
                  border: 'none',
                  borderRadius: 12,
                  fontSize: 18,
                  fontWeight: 600,
                  color: '#1A1A1A',
                  boxSizing: 'border-box',
                }}
                data-testid="price-input"
              />
          
          
          )}
            </div>
          {isLowerThanAverage && (<div style={{ backgroundColor: "#3c2f1b", padding: 12, marginTop: 8, borderRadius: 8, border: "1px solid #8f6e21" }}><span style={{ color: "#e6b052", fontSize: 12 }}>Precio bajo — ¡atractivo! Verifica que sea correcto</span></div>)}
          
            <p style={inputHintStyle}>
              Ingresa tu precio. El valor sugerido es solo una referencia.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <button
                type="button"
                onClick={() => setPriceBase(String(refPrice))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#90BDD3',
                  fontSize: 13,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: '2px 0',
                }}
              >
                Usar valor sugerido
              </button>
            </div>
            {priceImpact ? (
              <p
                style={{
                  fontSize: 12,
                  marginTop: 4,
                  marginBottom: 0,
                  lineHeight: 1.35,
                  color:
                    priceImpact.level === 'positive'
                      ? '#166534'
                      : priceImpact.level === 'warning'
                        ? '#B45309'
                        : '#6B7280',
                }}
              >
                {priceImpact.text}
              </p>
            ) : null}
            {priceAlert && (
              <div
                style={{
                  marginTop: 8,
                  padding: 10,
                  borderRadius: 8,
                  minHeight: 40,
                  background: `${priceAlert.color}20`,
                  border: `1px solid ${priceAlert.color}60`,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <p style={{ color: priceAlert.color, fontSize: 12, fontWeight: 600, margin: 0, lineHeight: 1.4 }}>
                  {priceAlert.msg}
                </p>
              </div>
            )}
          </div>

          {needsTransport && (
            <div style={{ marginBottom: 18 }}>
              <label
                style={{
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: 14,
                  display: 'block',
                  marginBottom: 8,
                  fontWeight: 500,
                }}
              >
                Costo de traslado neto (sin IVA)
              </label>
              <div style={{ position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: 16,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#666',
                    fontSize: 16,
                  }}
                >
                  $
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={transportCost ? (parseInt(transportCost, 10) || 0).toLocaleString('es-CL') : ''}
                  onChange={(e) => setTransportCost(e.target.value.replace(/\D/g, ''))}
                  placeholder={REFERENCE_TRANSPORT.toLocaleString('es-CL')}
                  style={{
                    width: '100%',
                    padding: '16px 16px 16px 36px',
                    background: '#F5EFE6',
                    border: 'none',
                    borderRadius: 12,
                    fontSize: 18,
                    fontWeight: 600,
                    color: '#1A1A1A',
                    boxSizing: 'border-box',
                  }}
                  data-testid="transport-input"
                />
          
          )}
              </div>
          {isCompetitive && (<div style={{ backgroundColor: "#172e1f", padding: 12, marginTop: 8, borderRadius: 8, border: "1px solid #284e36" }}><span style={{ color: "#6be689", fontSize: 12 }}>✓ Traslado competitivo — atractivo para clientes</span></div>)}
          
              <p style={inputHintStyle}>
                Ingresa el costo de traslado. El valor sugerido es solo una referencia.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <button
                type="button"
                onClick={() => setTransportCost(String(REFERENCE_TRANSPORT))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#90BDD3',
                  fontSize: 13,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: '2px 0',
                }}
              >
                Usar valor sugerido
              </button>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 6, marginLeft: 4 }}>
                Ref: {formatPrice(REFERENCE_TRANSPORT)} · Máx: {formatPrice(maxTransport)}
              </p>
              {transportAlert && (
                <div
                  style={{
                    marginTop: 8,
                    padding: 10,
                    borderRadius: 8,
                    minHeight: 40,
                    background: `${transportAlert.color}20`,
                    border: `1px solid ${transportAlert.color}60`,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <p style={{ color: transportAlert.color, fontSize: 12, fontWeight: 600, margin: 0, lineHeight: 1.4 }}>
                    {transportAlert.msg}
                  </p>
                </div>
              )}
            </div>
          )}

          {!needsTransport && (
            <div style={{ background: '#2A2A2A', borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <p style={{ color: '#90BDD3', fontSize: 13, margin: 0, textAlign: 'center' }}>
                Sin traslado en esta máquina
              </p>
            </div>
          )}

          {error && (
            <div style={{ background: '#2A2A2A', border: '1px solid #ff6b6b', borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <p style={{ color: '#ff6b6b', fontSize: 13, margin: 0, textAlign: 'center' }}>{error}</p>
            </div>
          )}

          {priceBaseNum >= minPrice && (
            <div style={{ background: '#363636', borderRadius: 14, padding: 16 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                  cursor: 'pointer',
                }}
                role="button"
                tabIndex={0}
                onClick={() => setShowMultiplierInfo(!showMultiplierInfo)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setShowMultiplierInfo((v) => !v);
                }}
              >
                <p style={{ color: '#EC6819', fontSize: 14, fontWeight: 600, margin: 0 }}>Bonificaciones</p>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{ transform: showMultiplierInfo ? 'rotate(180deg)' : 'rotate(0deg)', transition: '0.3s' }}
                  aria-hidden
                >
                  <path d="M6 9L12 15L18 9" stroke="#EC6819" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>

              {showMultiplierInfo &&
                (isPerHour ? (
                  <div style={{ marginBottom: 12 }}>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: '0 0 10px', textAlign: 'center' }}>
                      Por horas:
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                      {[4, 5, 6, 7, 8].map((h) => (
                        <div
                          key={h}
                          style={{
                            background: '#2A2A2A',
                            borderRadius: 8,
                            padding: '8px 0',
                            textAlign: 'center',
                            flex: 1,
                          }}
                        >
                          <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{h}h</div>
                          <div style={{ color: '#90BDD3', fontSize: 12, fontWeight: 600 }}>
                            +{Math.round((MULTIPLIERS_HOURS[h] - 1) * 100)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginBottom: 12 }}>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: '0 0 10px', textAlign: 'center' }}>
                      Por urgencia:
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {Object.entries(MULTIPLIERS_URGENCY).map(([key, data]) => (
                        <div
                          key={key}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: '#2A2A2A',
                            borderRadius: 8,
                            padding: '8px 12px',
                          }}
                        >
                          <span style={{ color: '#fff', fontSize: 13 }}>{data.label}</span>
                          <span
                            style={{
                              color: data.mult > 1 ? '#90BDD3' : 'rgba(255,255,255,0.5)',
                              fontSize: 13,
                              fontWeight: 600,
                            }}
                          >
                            {data.mult > 1 ? `+${Math.round((data.mult - 1) * 100)}%` : 'Precio base'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

              <div style={{ background: '#2A2A2A', borderRadius: 10, padding: 14, marginTop: 12 }}>
                <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: 0, textAlign: 'center', marginBottom: 10 }}>
                  {isPerHour ? 'Ejemplo (4 h)' : 'Ejemplo urgente'}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: 0 }}>Programada</p>
                    <p style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: '4px 0 0' }}>
                      {formatPrice(isPerHour ? priceBaseNum * 4 : priceBaseNum)}
                    </p>
                  </div>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M5 12H19M19 12L13 6M19 12L13 18" stroke="#90BDD3" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ color: '#90BDD3', fontSize: 13, margin: 0, fontWeight: 600 }}>
                      {isPerHour ? 'INMEDIATA' : 'URGENTE'}
                    </p>
                    <p style={{ color: '#EC6819', fontSize: 18, fontWeight: 700, margin: '4px 0 0' }}>
                      {formatPrice(
                        isPerHour ? calculateImmediateExample(4) : calculateUrgencyExample('urgente')
                      )}
                    </p>
                  </div>
                </div>
                <p style={{ color: '#90BDD3', fontSize: 13, fontWeight: 600, margin: '10px 0 0', textAlign: 'center' }}>
                  +
                  {formatPrice(
                    isPerHour
                      ? calculateImmediateExample(4) - priceBaseNum * 4
                      : calculateUrgencyExample('urgente') - priceBaseNum
                  )}{' '}
                  {isPerHour ? 'extra · disponibilidad' : 'extra · urgencia'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="maqgo-fixed-bottom-bar">
        <button
          type="button"
          className="maqgo-btn-primary"
          onClick={handleContinue}
          disabled={!canContinue}
          style={{
            opacity: canContinue ? 1 : 0.55,
            background: canContinue ? undefined : '#5a5a5a',
            cursor: canContinue ? 'pointer' : 'not-allowed',
          }}
          data-testid="machine-photos-pricing-continue"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}

export default MachinePhotosPricingScreen;
