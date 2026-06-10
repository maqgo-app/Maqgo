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
import { persistProviderOnboardingDraft } from '../../utils/providerOnboardingDraft';

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
      text: 'Tarifa sobre el rango esperado para esta maquinaria',
      level: 'warning',
    };
  }

  return {
    text: 'Precio dentro del rango esperado para esta maquinaria',
    level: 'neutral',
  };
}

function getTransportFieldAlert(value) {
  if (!value) return null;
  if (value < MIN_TRANSPORT) {
    return {
      type: 'low_range',
      color: '#F2B15E',
      msg: `Valor fuera de rango. Mínimo ${new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(MIN_TRANSPORT)} netos.`,
    };
  }
  return getTransportAlert(value);
}

const inputHintStyle = {
  fontSize: 12,
  color: 'rgba(255,255,255,0.68)',
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
  const photosRef = useRef([]);

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

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

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
  const [transportSameComuna, setTransportSameComuna] = useState(() => {
    const savedPricing = getObject('machinePricing', {});
    return savedPricing.transportSameComuna != null
      ? String(savedPricing.transportSameComuna).replace(/\D/g, '').slice(0, 9)
      : savedPricing.transportCost != null
        ? String(savedPricing.transportCost).replace(/\D/g, '').slice(0, 9)
        : '';
  });
  const [transportSameRegion, setTransportSameRegion] = useState(() => {
    const savedPricing = getObject('machinePricing', {});
    return savedPricing.transportSameRegion != null
      ? String(savedPricing.transportSameRegion).replace(/\D/g, '').slice(0, 9)
      : savedPricing.transportCost != null
        ? String(savedPricing.transportCost).replace(/\D/g, '').slice(0, 9)
        : '';
  });
  const [transportOtherRegion, setTransportOtherRegion] = useState(() => {
    const savedPricing = getObject('machinePricing', {});
    return savedPricing.transportOtherRegion != null
      ? String(savedPricing.transportOtherRegion).replace(/\D/g, '').slice(0, 9)
      : savedPricing.transportSameRegion != null
        ? String(savedPricing.transportSameRegion).replace(/\D/g, '').slice(0, 9)
        : savedPricing.transportCost != null
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
  const sameComunaNum = parseInt(transportSameComuna, 10) || 0;
  const sameRegionNum = parseInt(transportSameRegion, 10) || 0;
  const otherRegionNum = parseInt(transportOtherRegion, 10) || 0;

  useEffect(() => {
    if (prevMachineTypeRef.current === null) {
      prevMachineTypeRef.current = machineType;
      return;
    }
    if (prevMachineTypeRef.current !== machineType) {
      setPriceBase('');
      setTransportSameComuna('');
      setTransportSameRegion('');
      setTransportOtherRegion('');
      toast.info('Se actualizaron las tarifas sugeridas según el tipo de máquina');
      prevMachineTypeRef.current = machineType;
    }
  }, [machineType, toast]);

  const priceAlert = priceBaseNum >= minPrice ? getPriceAlert(priceBaseNum, refPrice) : null;
  const sameComunaAlert = needsTransport ? getTransportFieldAlert(sameComunaNum) : null;
  const sameRegionAlert = needsTransport ? getTransportFieldAlert(sameRegionNum) : null;
  const otherRegionAlert = needsTransport ? getTransportFieldAlert(otherRegionNum) : null;
  const transportOrderValid = !needsTransport || (sameRegionNum >= sameComunaNum && otherRegionNum >= sameRegionNum);
  const canContinue = needsTransport
    ? priceBaseNum >= minPrice &&
      sameComunaNum >= MIN_TRANSPORT &&
      sameRegionNum >= MIN_TRANSPORT &&
      otherRegionNum >= MIN_TRANSPORT &&
      transportOrderValid
    : priceBaseNum >= minPrice;
  const ctaReady = Boolean(hasFrontalPhoto && canContinue);

  const priceImpact = getPriceImpactLabel(priceBaseNum, refPrice);

  const formatPrice = (price) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(price);

  const ctaHint = (() => {
    if (hasFrontalPhoto === false) return 'Sube la foto frontal para continuar.';
    if (!priceBaseNum || priceBaseNum < minPrice) {
      return `Completa una tarifa base desde ${formatPrice(minPrice)}${isPerHour ? '/hora' : ''}.`;
    }
    if (priceBaseNum > maxPrice) {
      return `La tarifa base no puede superar ${formatPrice(maxPrice)}${isPerHour ? '/hora' : ''}.`;
    }
    if (needsTransport) {
      if (!sameComunaNum || sameComunaNum < MIN_TRANSPORT) {
        return `Completa "Dentro de la misma comuna" desde ${formatPrice(MIN_TRANSPORT)} netos.`;
      }
      if (!sameRegionNum || sameRegionNum < MIN_TRANSPORT) {
        return `Completa "Entre comunas de la misma región" desde ${formatPrice(MIN_TRANSPORT)} netos.`;
      }
      if (!otherRegionNum || otherRegionNum < MIN_TRANSPORT) {
        return `Completa "A región colindante (máx. 150 km)" desde ${formatPrice(MIN_TRANSPORT)} netos.`;
      }
      if (!transportOrderValid) {
        return 'Ordena los tramos: misma región no puede ser menor que misma comuna, y región colindante no puede ser menor que misma región.';
      }
    }
    return '';
  })();

  const isQuotaError = (e) => {
    const err = e || {};
    const name = String(err.name || '');
    const msg = String(err.message || '');
    const code = err.code;
    return (
      name === 'QuotaExceededError' ||
      name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      code === 22 ||
      code === 1014 ||
      /quota/i.test(msg)
    );
  };

  const sortPhotos = (next) => {
    return [...next].sort((a, b) => {
      const ia = PHOTO_SLOT_LABELS.indexOf(a.label);
      const ib = PHOTO_SLOT_LABELS.indexOf(b.label);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  };

  const PHOTO_DATAURL_SOFT_LIMIT = 2_000_000;

  const persistPhotosSafe = (next, opts = {}) => {
    const { showToast = true } = opts;
    const sorted = sortPhotos(next);
    const hasOversized = sorted.some((p) => typeof p?.url === 'string' && p.url.length > PHOTO_DATAURL_SOFT_LIMIT);
    if (hasOversized) {
      if (showToast) toast.error('No pudimos guardar esta foto. Prueba una imagen más liviana.');
      return false;
    }
    let payload = '';
    try {
      payload = JSON.stringify(sorted);
    } catch {
      if (showToast) toast.error('No pudimos guardar esta foto. Prueba una imagen más liviana.');
      return false;
    }
    try {
      localStorage.setItem('machinePhotos', payload);
    } catch (e) {
      if (showToast) {
        toast.error(
          isQuotaError(e)
            ? 'No pudimos guardar esta foto. Prueba una imagen más liviana.'
            : 'No pudimos guardar esta foto en este dispositivo.'
        );
      }
      return false;
    }
    setPhotos(sorted);
    return true;
  };

  const buildNextPhotoList = (base, newPhoto, safeLabel) => {
    const existingIdx = base.findIndex(
      (p) => String(p?.label || '').trim().toLowerCase() === String(safeLabel).toLowerCase()
    );
    const next =
      existingIdx >= 0
        ? base.map((p, i) => (i === existingIdx ? newPhoto : p))
        : [...base, newPhoto].slice(0, MAX_PHOTOS);
    return next;
  };

  const upsertPhotoForLabel = async (file, label) => {
    if (!file || !file.type?.startsWith?.('image/')) return;
    const safeLabel = PHOTO_SLOT_LABELS.includes(label) ? label : PHOTO_SLOT_LABELS[0];
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base = Array.isArray(photosRef.current) ? photosRef.current : [];
      try {
        const dataUrl = event?.target?.result;
        const compressed = await compressImage(dataUrl);
        if (typeof compressed !== 'string' || !compressed) {
          toast.error('No pudimos guardar esta foto. Prueba una imagen más liviana.');
          return;
        }
        const newPhoto = { url: compressed, label: safeLabel };
        const next = buildNextPhotoList(base, newPhoto, safeLabel);
        persistPhotosSafe(next);
      } catch {
        const raw = event?.target?.result;
        if (typeof raw !== 'string' || !raw) {
          toast.error('No pudimos guardar esta foto. Prueba una imagen más liviana.');
          return;
        }
        if (raw.length > PHOTO_DATAURL_SOFT_LIMIT) {
          toast.error('No pudimos guardar esta foto. Prueba una imagen más liviana.');
          return;
        }
        const newPhoto = { url: raw, label: safeLabel };
        const next = buildNextPhotoList(base, newPhoto, safeLabel);
        persistPhotosSafe(next);
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
    const base = Array.isArray(photosRef.current) ? photosRef.current : [];
    const next = base.filter((p) => String(p?.label || '').trim().toLowerCase() !== target);
    persistPhotosSafe(next, { showToast: false });
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
      if (!sameComunaNum || sameComunaNum < MIN_TRANSPORT) {
        setError(`El traslado mínimo para misma comuna es ${formatPrice(MIN_TRANSPORT)}.`);
        return;
      }
      if (!sameRegionNum || sameRegionNum < MIN_TRANSPORT) {
        setError(`Completa el traslado para comuna distinta, misma región.`);
        return;
      }
      if (!otherRegionNum || otherRegionNum < MIN_TRANSPORT) {
        setError(`Completa el traslado para región colindante (máx. 150 km).`);
        return;
      }
      if (sameComunaNum > maxTransport || sameRegionNum > maxTransport || otherRegionNum > maxTransport) {
        setError(`El traslado máximo es ${formatPrice(maxTransport)}. ${PRICE_CAP_RULE_LABEL}`);
        return;
      }
      if (!transportOrderValid) {
        setError('El traslado entre comunas de la misma región no puede ser menor que misma comuna, y región colindante (máx. 150 km) no puede ser menor que misma región.');
        return;
      }
    }

    const pricing = {
      priceBase: priceBaseNum,
      transportCost: needsTransport ? sameComunaNum : 0,
      transportSameComuna: needsTransport ? sameComunaNum : 0,
      transportSameRegion: needsTransport ? sameRegionNum : 0,
      transportOtherRegion: needsTransport ? otherRegionNum : 0,
      needsTransport,
      isPerHour,
      machineType,
    };
    localStorage.setItem('machinePricing', JSON.stringify(pricing));
    persistProviderOnboardingDraft({
      machineData: machineDataSnapshot,
      machinePricing: pricing,
      machinePhotos: photosRef.current,
    }).catch(() => void 0);
    // Misma numeración que PricingScreen legacy: tras tarifas → paso 5 (operador).
    localStorage.setItem('providerOnboardingStep', '5');
    navigate('/provider/operator-data');
  };

  const sectionTitle = {
    color: '#fff',
    fontSize: 18,
    fontWeight: 600,
    letterSpacing: '-0.01em',
    lineHeight: 1.2,
    margin: '0 0 6px',
    fontFamily: "'Inter', sans-serif",
  };

  const sectionCard = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  };

  const pricingModule = {
    background: 'rgba(0,0,0,0.16)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  };

  const moduleTitle = {
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    margin: '0 0 10px',
    lineHeight: 1.25,
  };

  const fieldLabel = {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    display: 'block',
    marginBottom: 8,
    fontWeight: 500,
  };

  const transportRow = (index) => ({
    marginTop: index === 0 ? 0 : 10,
    padding: 12,
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
  });

  const transportLabelRow = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  };

  const transportBadge = {
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    background: 'rgba(236,104,25,0.14)',
    border: '1px solid rgba(236,104,25,0.28)',
    color: '#EC6819',
    fontSize: 12,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
  };

  const transportFieldLabel = {
    ...fieldLabel,
    marginBottom: 0,
    lineHeight: 1.25,
  };

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 140px' }}>
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
            marginBottom: 22,
            lineHeight: 1.45,
            padding: '0 4px',
          }}
        >
          Foto frontal obligatoria. Lateral y trasera opcionales.
        </p>

        <div className="maqgo-photos-pricing-grid">
          <div className="maqgo-photos-pricing-sticky">
            <div id="seccion-fotos" style={sectionCard}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  alignItems: 'flex-start',
                  marginBottom: 14,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={sectionTitle}>{machineName}</h2>
                </div>
                <div
                  style={{
                    background: 'rgba(144, 189, 211, 0.14)',
                    border: '1px solid rgba(144, 189, 211, 0.45)',
                    borderRadius: 999,
                    padding: '7px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flex: '0 0 auto',
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
                  <span style={{ color: '#90BDD3', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {!hasFrontalPhoto ? 'Falta frontal' : `${photos.length} de 3 listas`}
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
                          <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, minHeight: 17 }}>
                            {p ? label : ''}
                          </div>
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
            <h2 style={{ ...sectionTitle, textAlign: 'center' }}>{needsTransport ? 'Define tus tarifas' : 'Define tu tarifa'}</h2>
            <div style={pricingModule}>
              <p style={moduleTitle}>{isPerHour ? 'Tarifa por hora' : 'Tarifa por servicio'}</p>
              <label style={fieldLabel}>
                {isPerHour ? 'Tarifa por hora neto (sin IVA)' : 'Tarifa por servicio neto (sin IVA)'}
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
                Valor referencial: {formatPrice(refPrice)}{isPerHour ? '/h' : ''}.
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
                        ? '#71D08A'
                        : priceImpact.level === 'warning'
                          ? '#F2B15E'
                          : 'rgba(255,255,255,0.76)',
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
              <div style={{ ...pricingModule, marginBottom: 18 }}>
                <p style={moduleTitle}>Costo de traslado neto (sin IVA)</p>
                {[
                {
                  key: 'same-comuna',
                  label: 'Dentro de la misma comuna',
                  value: transportSameComuna,
                  setValue: setTransportSameComuna,
                  alert: sameComunaAlert,
                },
                {
                  key: 'same-region',
                  label: 'Entre comunas de la misma región',
                  value: transportSameRegion,
                  setValue: setTransportSameRegion,
                  alert: sameRegionAlert,
                },
                {
                  key: 'other-region',
                  label: 'A región colindante (máx. 150 km)',
                  value: transportOtherRegion,
                  setValue: setTransportOtherRegion,
                  alert: otherRegionAlert,
                },
                ].map((field, index) => (
                  <div key={field.key} style={transportRow(index)}>
                    <div style={transportLabelRow}>
                      <span style={transportBadge}>{index + 1}</span>
                      <label style={transportFieldLabel}>
                        {field.label}
                      </label>
                    </div>
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
                        value={field.value ? (parseInt(field.value, 10) || 0).toLocaleString('es-CL') : ''}
                        onChange={(e) => field.setValue(e.target.value.replace(/\D/g, ''))}
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
                        data-testid={`transport-input-${field.key}`}
                      />
                    </div>
                    {field.alert ? (
                      <div
                        style={{
                          marginTop: 8,
                          padding: 10,
                          borderRadius: 8,
                          minHeight: 40,
                          background: `${field.alert.color}20`,
                          border: `1px solid ${field.alert.color}60`,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <p style={{ color: field.alert.color, fontSize: 12, fontWeight: 600, margin: 0, lineHeight: 1.4 }}>
                          {field.alert.msg}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ))}
                {!transportOrderValid ? (
                  <p style={{ color: '#ffb36b', fontSize: 12, marginTop: 12, marginBottom: 0, lineHeight: 1.4 }}>
                    Revisa el orden: misma región no puede ser menor que misma comuna, y región colindante (máx. 150 km) no puede ser menor que misma región.
                  </p>
                ) : null}
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
                <p style={{ color: '#EC6819', fontSize: 14, fontWeight: 600, margin: 0 }}>
                  {isPerHour ? 'Bonificación por disponibilidad' : 'Bonificación por urgencia'}
                </p>
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
                    <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: 0 }}>
                      {isPerHour ? 'Base (programada)' : 'Base'}
                    </p>
                    <p style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: '4px 0 0' }}>
                      {formatPrice(isPerHour ? priceBaseNum * 4 : priceBaseNum)}
                    </p>
                    {isPerHour && (
                      <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, margin: '6px 0 0' }}>
                        {formatPrice(priceBaseNum)}/h × 4 h
                      </p>
                    )}
                  </div>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M5 12H19M19 12L13 6M19 12L13 18" stroke="#90BDD3" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ color: '#90BDD3', fontSize: 13, margin: 0, fontWeight: 600 }}>
                      {isPerHour ? 'Con bonificación (inmediata)' : 'URGENTE'}
                    </p>
                    <p style={{ color: '#EC6819', fontSize: 18, fontWeight: 700, margin: '4px 0 0' }}>
                      {formatPrice(
                        isPerHour ? calculateImmediateExample(4) : calculateUrgencyExample('urgente')
                      )}
                    </p>
                    {isPerHour && (
                      <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, margin: '6px 0 0' }}>
                        × {MULTIPLIERS_HOURS[4].toFixed(2)} por disponibilidad
                      </p>
                    )}
                  </div>
                </div>
                <p style={{ color: '#90BDD3', fontSize: 13, fontWeight: 600, margin: '10px 0 0', textAlign: 'center' }}>
                  Bonificación:{' '}
                  {formatPrice(
                    isPerHour
                      ? calculateImmediateExample(4) - priceBaseNum * 4
                      : calculateUrgencyExample('urgente') - priceBaseNum
                  )}{' '}
                  {isPerHour ? 'por disponibilidad inmediata' : 'por urgencia'}
                </p>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      <div className="maqgo-fixed-bottom-bar">
        {!ctaReady ? (
          <p
            style={{
              margin: '0 0 10px',
              color: 'rgba(255,255,255,0.72)',
              fontSize: 12,
              lineHeight: 1.4,
              textAlign: 'center',
              padding: '0 6px',
            }}
          >
            {ctaHint}
          </p>
        ) : null}
        <button
          type="button"
          className="maqgo-btn-primary"
          onClick={handleContinue}
          style={{
            opacity: ctaReady ? 1 : 0.75,
            background: ctaReady ? undefined : '#5a5a5a',
            boxShadow: ctaReady ? undefined : 'none',
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
