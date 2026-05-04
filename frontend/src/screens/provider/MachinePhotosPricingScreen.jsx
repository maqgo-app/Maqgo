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
const PHOTO_SLOT_LABELS = ['Frontal', 'Lateral', 'Trasera'];
const PHOTO_SLOT_OPTIONALITY = {
  Frontal: 'Obligatoria',
  Lateral: 'Opcional',
  Trasera: 'Opcional',
};

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
  const fileInputsRef = useRef({});

  const [photos, setPhotos] = useState(() => {
    const raw = getArray('machinePhotos', []);
    if (!Array.isArray(raw) || raw.length === 0) return [];
    const normalized = raw
      .map((p, idx) => {
        if (typeof p === 'string') {
          return { url: p, label: PHOTO_SLOT_LABELS[idx] || `Foto ${idx + 1}` };
        }
        if (p && typeof p === 'object') {
          const url = typeof p.url === 'string' ? p.url : '';
          const label = typeof p.label === 'string' ? p.label : PHOTO_SLOT_LABELS[idx] || `Foto ${idx + 1}`;
          if (!url) return null;
          return { url, label };
        }
        return null;
      })
      .filter(Boolean);
    return normalized;
  });

  const getPhotoByLabel = (label) => {
    const target = String(label || '').trim().toLowerCase();
    return photos.find((p) => String(p?.label || '').trim().toLowerCase() === target) || null;
  };

  const hasFrontalPhoto = Boolean(getPhotoByLabel('frontal'));
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
  const ctaReady = Boolean(hasFrontalPhoto && canContinue);

  const priceImpact = getPriceImpactLabel(priceBaseNum, refPrice);

  const formatPrice = (price) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(price);

  const persistPhotos = (next) => {
    const sorted = [...next].sort((a, b) => {
      const ia = PHOTO_SLOT_LABELS.indexOf(a.label);
      const ib = PHOTO_SLOT_LABELS.indexOf(b.label);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    setPhotos(sorted);
    localStorage.setItem('machinePhotos', JSON.stringify(sorted));
  };

  const upsertPhotoForLabel = async (file, label) => {
    if (!file || !file.type?.startsWith?.('image/')) return;
    const safeLabel = PHOTO_SLOT_LABELS.includes(label) ? label : PHOTO_SLOT_LABELS[0];
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const dataUrl = event.target.result;
        const compressed = await compressImage(dataUrl);
        const newPhoto = { url: compressed, label: safeLabel };
        const existingIdx = photos.findIndex(
          (p) => String(p?.label || '').trim().toLowerCase() === String(safeLabel).toLowerCase()
        );
        const next =
          existingIdx >= 0
            ? photos.map((p, i) => (i === existingIdx ? newPhoto : p))
            : [...photos, newPhoto].slice(0, MAX_PHOTOS);
        persistPhotos(next);
      } catch {
        const newPhoto = { url: event.target.result, label: safeLabel };
        const existingIdx = photos.findIndex(
          (p) => String(p?.label || '').trim().toLowerCase() === String(safeLabel).toLowerCase()
        );
        const next =
          existingIdx >= 0
            ? photos.map((p, i) => (i === existingIdx ? newPhoto : p))
            : [...photos, newPhoto].slice(0, MAX_PHOTOS);
        persistPhotos(next);
      }
    };
    reader.readAsDataURL(file);
  };

  const openFilePickerForLabel = (label) => {
    const k = String(label || '');
    const input = fileInputsRef.current?.[k];
    if (input && typeof input.click === 'function') input.click();
  };

  const handleRemovePhotoByLabel = (label) => {
    const target = String(label || '').trim().toLowerCase();
    const next = photos.filter((p) => String(p?.label || '').trim().toLowerCase() !== target);
    persistPhotos(next);
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
    if (!hasFrontalPhoto) {
      setError('La foto frontal es obligatoria.');
      document.getElementById('seccion-fotos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
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
    <div className="maqgo-app maqgo-provider-funnel maqgo-provider-p3-wide">
      <style>{`
        .maqgo-photos-pricing-grid > * {
          min-width: 0;
        }
        .maqgo-photos-pricing-grid {
          display: block;
        }
        .maqgo-photos-pricing-sticky {
          position: static;
        }
        @media (min-width: 1200px) {
          .maqgo-app.maqgo-provider-p3-wide {
            max-width: 720px;
          }
        }
      `}</style>
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
          Foto frontal obligatoria. Lateral y trasera opcionales.
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
            Bajar a tarifas
          </button>
        </p>

        <div className="maqgo-photos-pricing-grid">
          <div className="maqgo-photos-pricing-sticky">
            <div id="seccion-fotos" style={sectionCard}>
              <h2 style={sectionTitle}>Fotos de la máquina</h2>

              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
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
                    {!hasFrontalPhoto ? 'Falta foto frontal' : `${photos.length} de 3 listas`}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {PHOTO_SLOT_LABELS.map((label) => {
                  const p = getPhotoByLabel(label);
                  const isRequired = label === 'Frontal';
                  const optionality = PHOTO_SLOT_OPTIONALITY[label] || (isRequired ? 'Obligatoria' : 'Opcional');
                  return (
                    <div
                      key={label}
                      style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'center',
                        padding: 10,
                        borderRadius: 12,
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.03)',
                      }}
                    >
                      <div
                        style={{
                          width: 96,
                          height: 54,
                          borderRadius: 10,
                          background: '#2A2A2A',
                          border: '1px solid rgba(255,255,255,0.08)',
                          overflow: 'hidden',
                          flex: '0 0 auto',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'rgba(255,255,255,0.55)',
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {p ? (
                          <img
                            src={p.url}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          label
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                          <div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>{label}</div>
                          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>{optionality}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                          <input
                            ref={(el) => {
                              if (!fileInputsRef.current) fileInputsRef.current = {};
                              fileInputsRef.current[label] = el;
                            }}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => {
                              const f = e?.target?.files?.[0];
                              if (f) upsertPhotoForLabel(f, label);
                              e.target.value = '';
                            }}
                            style={{ display: 'none' }}
                          />
                          <button
                            type="button"
                            onClick={() => openFilePickerForLabel(label)}
                            style={{
                              borderRadius: 10,
                              border: '1px solid rgba(255,255,255,0.18)',
                              padding: '8px 10px',
                              fontSize: 13,
                              background: p ? 'rgba(255,255,255,0.06)' : '#EC6819',
                              color: '#fff',
                              cursor: 'pointer',
                              fontWeight: 700,
                            }}
                          >
                            {p ? 'Reemplazar' : (isRequired ? 'Subir frontal' : 'Subir')}
                          </button>
                          {p ? (
                            <button
                              type="button"
                              onClick={() => handleRemovePhotoByLabel(label)}
                              style={{
                                borderRadius: 10,
                                border: '1px solid rgba(255,255,255,0.18)',
                                padding: '8px 10px',
                                fontSize: 13,
                                background: 'rgba(255,107,107,0.18)',
                                color: '#fff',
                                cursor: 'pointer',
                                fontWeight: 700,
                              }}
                            >
                              Eliminar
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {!hasFrontalPhoto ? (
                <div style={{ marginTop: 12, background: 'rgba(255,107,107,0.12)', border: '1px solid rgba(255,107,107,0.5)', borderRadius: 12, padding: 12 }}>
                  <p style={{ margin: 0, color: '#ff6b6b', fontSize: 13, textAlign: 'center', fontWeight: 700 }}>
                    Falta la foto frontal (obligatoria)
                  </p>
                </div>
              ) : null}
            </div>
          </div>

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
            </div>
            <p style={inputHintStyle}>
              Ingresa tu precio (referencia: {formatPrice(refPrice)}{isPerHour ? '/h' : ''}).
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
              </div>
              <p style={inputHintStyle}>
                Ingresa el traslado (referencia: {formatPrice(REFERENCE_TRANSPORT)}).
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
      </div>

      <div className="maqgo-fixed-bottom-bar">
        <button
          type="button"
          className="maqgo-btn-primary"
          onClick={handleContinue}
          style={{
            opacity: ctaReady ? 1 : 0.75,
            background: ctaReady ? undefined : '#5a5a5a',
            cursor: 'pointer',
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
