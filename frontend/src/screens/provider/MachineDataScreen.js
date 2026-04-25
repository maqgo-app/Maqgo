import React, { useState, useLayoutEffect, useEffect, useCallback, useRef } from 'react';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import ProviderOnboardingProgress from '../../components/ProviderOnboardingProgress';
import PasswordField from '../../components/PasswordField';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../context/authHooks';
import { addMachine, updateMachine, getMachineById } from '../../utils/providerMachines';
import { getMachineryCapacityOptions, getProviderSpecLabel } from '../../utils/machineryNames';
import { getArray, getObject } from '../../utils/safeStorage';
import { compressImage, MAX_PHOTOS } from '../../utils/machinePhotoLocal';
import { validateCelularChile } from '../../utils/chileanValidation';
import { getPasswordHint, validatePassword, PASSWORD_RULES } from '../../utils/passwordValidation';
import { getUserAuthState } from '../../utils/userAuthState';
import { submitBecomeProviderMinimal, hasProviderRoleInStorage } from '../../utils/providerBecomeApi';
import {
  REFERENCE_PRICES,
  REFERENCE_TRANSPORT,
  MAX_PRICE_ABOVE_MARKET_PCT,
  getPriceAlert,
  getTransportAlert,
  MACHINERY_PER_HOUR,
  MACHINERY_NO_TRANSPORT,
} from '../../utils/pricing';

const MACHINERY_TYPES = [
  { id: 'retroexcavadora', name: 'Retroexcavadora' },
  { id: 'camion_tolva', name: 'Camión Tolva' },
  { id: 'excavadora', name: 'Excavadora Hidráulica' },
  { id: 'bulldozer', name: 'Bulldozer' },
  { id: 'motoniveladora', name: 'Motoniveladora' },
  { id: 'grua', name: 'Grúa Móvil' },
  { id: 'camion_pluma', name: 'Camión Pluma (Hiab)' },
  { id: 'compactadora', name: 'Compactadora / Rodillo' },
  { id: 'camion_aljibe', name: 'Camión Aljibe' },
  { id: 'minicargador', name: 'Minicargador' },
];

const TYPE_NAME_TO_ID = Object.fromEntries(MACHINERY_TYPES.map((m) => [m.name.toLowerCase(), m.id]));

const LICENSE_PLATE_REGEX = /^[A-Z]{4}-\d{2}$/;

const MIN_PRICE_HOUR = 20000;
const MIN_PRICE_SERVICE = 100000;
const MIN_TRANSPORT = 15000;

function formatClpRangeEs(minVal, maxVal) {
  return `${minVal.toLocaleString('es-CL')} y ${maxVal.toLocaleString('es-CL')}`;
}

/** Evita el copy vago "Precio entre X e Y" en hint/footer: deja claro si es /hora o por servicio y neto sin IVA. */
function tariffBaseRangeMessage(isPerHour, minPrice, maxPrice) {
  const r = formatClpRangeEs(minPrice, maxPrice);
  return isPerHour
    ? `El valor por hora neto (sin IVA) debe quedar entre ${r} CLP.`
    : `El precio por servicio neto (sin IVA) debe quedar entre ${r} CLP.`;
}

function transportRangeMessage(minT, maxT) {
  return `El traslado neto (sin IVA) debe quedar entre ${formatClpRangeEs(minT, maxT)} CLP.`;
}

/** Wizard /provider/add-machine: 3 pasos; mismos segmentos que el texto (sin mezclar con el embudo de 6). */
const MACHINE_FIRST_ONBOARDING_STEPS = [
  { label: 'Tu máquina' },
  { label: 'Precio' },
  { label: 'Confirmar' },
];

/** Referencia sólo para persistencia local/API; la posición útil al cotizar = operador + GPS en servicio. */
const DEFAULT_SERVICE_AREA_LABEL = 'Chile';
const DEFAULT_SERVICE_LAT = -33.4489;
const DEFAULT_SERVICE_LNG = -70.6693;

function formatLicensePlateInput(value) {
  const raw = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const letters = raw.replace(/[^A-Z]/g, '').slice(0, 4);
  const digits = raw.replace(/[^0-9]/g, '').slice(0, 2);
  if (!letters && !digits) return '';
  if (!digits) return letters;
  return `${letters}-${digits}`;
}

const EMPTY_MACHINE_FORM = {
  machineryType: '',
  brand: '',
  model: '',
  year: '',
  licensePlate: '',
  capacityM3: '',
  capacityLiters: '',
  capacityTonM: '',
  bucketM3: '',
  weightTon: '',
  powerHp: '',
  bladeWidthM: '',
  craneTon: '',
  rollerTon: '',
};

function buildMachineForm(isEditMode, editMachine) {
  if (isEditMode && editMachine) {
    const matched = MACHINERY_TYPES.find(
      (m) => m.name === editMachine.type || m.id === editMachine.type?.toLowerCase?.()
    );
    const machineryType = matched?.id || TYPE_NAME_TO_ID[editMachine.type?.toLowerCase?.()] || '';
    const brandModel = editMachine.brand || '';
    const [brand = '', model = ''] = brandModel.includes(' ')
      ? brandModel.split(/\s+(.+)/).slice(0, 2)
      : [brandModel, ''];
    return {
      machineryType,
      brand: brand.trim(),
      model: model.trim(),
      year: editMachine.year || '',
      licensePlate: formatLicensePlateInput(editMachine.licensePlate || ''),
      capacityM3: editMachine.capacityM3 != null ? String(editMachine.capacityM3) : '',
      capacityLiters: editMachine.capacityLiters != null ? String(editMachine.capacityLiters) : '',
      capacityTonM: editMachine.capacityTonM != null ? String(editMachine.capacityTonM) : '',
      bucketM3: editMachine.bucketM3 != null ? String(editMachine.bucketM3) : '',
      weightTon: editMachine.weightTon != null ? String(editMachine.weightTon) : '',
      powerHp: editMachine.powerHp != null ? String(editMachine.powerHp) : '',
      bladeWidthM: editMachine.bladeWidthM != null ? String(editMachine.bladeWidthM) : '',
      craneTon: editMachine.craneTon != null ? String(editMachine.craneTon) : '',
      rollerTon: editMachine.rollerTon != null ? String(editMachine.rollerTon) : '',
    };
  }
  const saved = getObject('machineData', {});
  if (saved.machineryType) {
    return {
      ...EMPTY_MACHINE_FORM,
      ...saved,
      licensePlate: formatLicensePlateInput(saved.licensePlate || ''),
    };
  }
  return { ...EMPTY_MACHINE_FORM };
}

/** Mismas reglas que el alta clásica `/provider/machine-data` (sin paso intermedio inventado). */
function isMachineSpecificationComplete(form, yearError) {
  if (yearError) return false;
  return !!(
    form.machineryType &&
    String(form.brand || '').trim() &&
    String(form.model || '').trim() &&
    LICENSE_PLATE_REGEX.test(String(form.licensePlate || ''))
  );
}

/** Texto legible para resumen (paso confirmación) y detalle de capacidad según tipo. */
function getMachineCapacityDisplayText(form) {
  const opts = getMachineryCapacityOptions(form.machineryType);
  if (!opts?.providerField) return null;
  const raw = form[opts.providerField];
  if (raw === '' || raw == null) return null;
  const v =
    typeof raw === 'number'
      ? raw
      : String(raw).includes('.')
        ? parseFloat(raw)
        : parseInt(String(raw), 10);
  if (!Number.isFinite(v)) return null;
  const unit = opts.unit || '';
  if (unit === 'litros') return v >= 1000 ? `${(v / 1000).toFixed(0)}.000 L` : `${v} L`;
  if (unit === 'm³ balde') return `${String(v).replace('.', ',')} m³`;
  if (unit === 'm³') return `${v} m³`;
  if (unit === 'ton·m') return `${v} ton·m`;
  if (unit === 'ton') return `${v} ton`;
  if (unit === 'HP') return `${v} HP`;
  if (unit === 'm hoja') return `${v} m`;
  return `${v} ${unit}`;
}

/**
 * Campos de ficha de máquina compartidos: machine-first y onboarding legacy.
 */
function MachineSpecificationFields({
  form,
  update,
  handleYearChange,
  yearError,
  currentYear,
  MIN_YEAR,
  machineFirstOptimize = false,
  showMachineFirstFieldErrors = false,
  machineryTypeSelectRef,
}) {
  const hasValidLicensePlate = LICENSE_PLATE_REGEX.test(form.licensePlate);
  const formatCap = (v, unit) => {
    if (unit === 'litros') return v >= 1000 ? `${(v / 1000).toFixed(0)}.000 L` : `${v} L`;
    if (unit === 'm³ balde') return `${String(v).replace('.', ',')} m³`;
    if (unit === 'm³') return `${v} m³`;
    if (unit === 'ton·m') return `${v} ton·m`;
    if (unit === 'ton') return `${v} ton`;
    if (unit === 'HP') return `${v} HP`;
    if (unit === 'm hoja') return `${v} m`;
    return `${v} ${unit}`;
  };
  const opts = getMachineryCapacityOptions(form.machineryType);
  const fieldName = opts?.providerField;
  const unit = opts?.unit || '';

  return (
    <div style={{ flex: 1 }}>
      <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, marginBottom: 8, display: 'block' }}>
        Tipo de maquinaria <span style={{ color: '#EC6819' }}>*</span>
      </label>
      <select
        ref={machineryTypeSelectRef}
        className="maqgo-input"
        value={form.machineryType}
        onChange={(e) => update('machineryType', e.target.value)}
        style={{ marginBottom: 12 }}
      >
        <option value="">Seleccionar tipo...</option>
        {MACHINERY_TYPES.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>

      <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, marginBottom: 8, display: 'block' }}>
        Marca <span style={{ color: '#EC6819' }}>*</span>
      </label>
      <input
        className="maqgo-input"
        placeholder="Ej: Caterpillar, Komatsu"
        value={form.brand}
        onChange={(e) => update('brand', e.target.value)}
        style={{ marginBottom: 12 }}
      />

      <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, marginBottom: 8, display: 'block' }}>
        Modelo <span style={{ color: '#EC6819' }}>*</span>
      </label>
      <input
        className="maqgo-input"
        placeholder="Ej: 320D, PC200"
        value={form.model}
        onChange={(e) => update('model', e.target.value)}
        style={{ marginBottom: 12 }}
      />

      {(!machineFirstOptimize || form.machineryType) && (
        <>
          <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, marginBottom: 8, display: 'block' }}>
            Año (opcional)
          </label>
          <input
            className="maqgo-input"
            type="text"
            inputMode="numeric"
            placeholder={`Ej: 2020 (máx. ${currentYear})`}
            value={form.year}
            onChange={(e) => handleYearChange(e.target.value)}
            maxLength={4}
            style={{ marginBottom: 4, borderColor: yearError ? '#f44336' : undefined }}
            aria-invalid={yearError}
          />
          {yearError && (
            <p style={{ color: '#f44336', fontSize: 12, marginTop: 0, marginBottom: 12 }}>
              Ingresa un año válido entre {MIN_YEAR} y {currentYear}
            </p>
          )}
        </>
      )}

      {opts && fieldName ? (
        <>
          <label
            style={{
              color: 'rgba(255,255,255,0.95)',
              fontSize: 14,
              marginBottom: 8,
              marginTop: 8,
              display: 'block',
            }}
          >
            {getProviderSpecLabel(form.machineryType)}
          </label>
          <select
            className="maqgo-input"
            value={form[fieldName] || ''}
            onChange={(e) => update(fieldName, e.target.value)}
            style={{ marginBottom: 12 }}
          >
            <option value="">Seleccionar...</option>
            {opts.options.map((v) => (
              <option key={v} value={v}>
                {formatCap(v, unit)}
              </option>
            ))}
          </select>
        </>
      ) : null}

      <label
        style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, marginBottom: 8, marginTop: 8, display: 'block' }}
      >
        Patente <span style={{ color: '#EC6819' }}>*</span>
      </label>
      <input
        className="maqgo-input"
        placeholder="Ej: BBBB-44"
        value={form.licensePlate}
        onChange={(e) => update('licensePlate', formatLicensePlateInput(e.target.value))}
        required
        maxLength={7}
        data-testid="license-plate-input"
      />
      {(!machineFirstOptimize || showMachineFirstFieldErrors) && !form.licensePlate && (
        <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, marginTop: 4, marginBottom: 0 }}>
          La patente es obligatoria para identificar tu maquinaria
        </p>
      )}
      {form.licensePlate && !hasValidLicensePlate && (
        <p style={{ color: '#f44336', fontSize: 12, marginTop: 4, marginBottom: 0 }}>
          Formato requerido: BBBB-44
        </p>
      )}
    </div>
  );
}

/** Paso 2 add-machine: mismas fotos opcionales que `/provider/machine-photos-pricing`. */
function MachineWizardPhotosBlock({ photos, setPhotos }) {
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
        if (import.meta.env.DEV) console.error('Error al procesar la foto:', err);
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

  return (
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
  );
}

function MachineDataScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const toast = useToast();
  const passwordHintInline = getPasswordHint(false);
  const { id } = useParams();
  const activationEdit = Boolean(location.state?.activationEdit);
  const returnTo = String(location.state?.returnTo || '/provider/home');
  const isEditMode = Boolean(id && location.pathname.includes('edit-machine'));
  const isAddMachineEntry = location.pathname.includes('add-machine');
  const editMachine = location.state?.machine ?? (id ? getMachineById(id) : null);
  const [form, setForm] = useState(() => buildMachineForm(isEditMode, editMachine));

  const [mfStep, setMfStep] = useState(1);
  const [priceBaseWizard, setPriceBaseWizard] = useState('');
  const [transportWizard, setTransportWizard] = useState('');
  const [mfPhotos, setMfPhotos] = useState(() => getArray('machinePhotos', []));
  const [showMachineFirstFieldErrors, setShowMachineFirstFieldErrors] = useState(false);
  const machineryTypeSelectRef = useRef(null);
  const priceBaseInputRef = useRef(null);
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [stepHint, setStepHint] = useState('');

  const [inlinePassword, setInlinePassword] = useState('');
  const [inlineLoading, setInlineLoading] = useState(false);
  const [inlineError, setInlineError] = useState('');
  const [inlineReady, setInlineReady] = useState(() => hasProviderRoleInStorage());

  useLayoutEffect(() => {
    const editMode = Boolean(id && location.pathname.includes('edit-machine'));
    const machine = location.state?.machine ?? (id ? getMachineById(id) : null);
    if (editMode || !location.pathname.includes('add-machine')) {
      setForm(buildMachineForm(editMode, machine));
    }
  }, [id, location.pathname, location.key, location.state?.machine]);

  useEffect(() => {
    if (!isAddMachineEntry || isEditMode) return;
    if (mfStep === 3) setStepHint('');
  }, [isAddMachineEntry, isEditMode, mfStep]);

  useEffect(() => {
    if (!isAddMachineEntry || isEditMode) return;
    const machines = getArray('providerMachines', []);
    const hasRegisteredMachine = Array.isArray(machines)
      ? machines.some((m) => Boolean(m?.machineryType && String(m.licensePlate || '').trim()))
      : false;
    if (hasRegisteredMachine) return;
    const providerData = getObject('providerData', {});
    const companyComplete = Boolean(providerData?.businessName && providerData?.rut);
    navigate(companyComplete ? '/provider/machine-data' : '/provider/data', { replace: true });
  }, [isAddMachineEntry, isEditMode, navigate]);

  useLayoutEffect(() => {
    if (!isAddMachineEntry || isEditMode) return;
    if (mfStep === 1) {
      const id = requestAnimationFrame(() => machineryTypeSelectRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    if (mfStep === 2) {
      const t = setTimeout(() => priceBaseInputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isAddMachineEntry, isEditMode, mfStep]);

  /** Misma UX que `/provider/machine-photos-pricing`: montos vacíos; referencia solo como placeholder (fantasma). */
  useEffect(() => {
    if (!isAddMachineEntry || isEditMode) return;
    setPriceBaseWizard('');
    setTransportWizard('');
  }, [form.machineryType, isAddMachineEntry, isEditMode]);

  const handleInlineProviderSubmit = useCallback(async () => {
    setInlineError('');
    const pwdErr = validatePassword(inlinePassword, passwordHintInline);
    const cel9 = getUserAuthState().phone;
    const celErr = cel9
      ? validateCelularChile(cel9)
      : 'No detectamos tu celular en este dispositivo. Recarga la página (actualiza la sesión) o inicia sesión una vez con celular y código SMS.';
    if (pwdErr || celErr) {
      setInlineError(pwdErr || celErr);
      return;
    }
    setInlineLoading(true);
    try {
      const res = await submitBecomeProviderMinimal({
        password: inlinePassword,
        celular: cel9,
      });
      const data = res.data || {};
      if (data.id) {
        localStorage.setItem('userId', data.id);
      }
      if (Array.isArray(data.roles) && data.roles.length) {
        localStorage.setItem('userRoles', JSON.stringify(data.roles));
        if (data.roles.includes('provider')) {
          localStorage.setItem('userRole', 'provider');
        }
      }
      const uid = String(data.id || localStorage.getItem('userId') || '');
      if (uid && data.roles?.includes('provider')) {
        login(uid, 'provider', 'super_master', null);
      }
      setInlineReady(true);
      toast.success('Cuenta proveedor lista. Completa los datos de tu máquina.');
    } catch (e) {
      const detail = e.response?.data?.detail;
      let msg = 'No se pudo crear la cuenta proveedor.';
      if (typeof detail === 'string') msg = detail;
      else if (Array.isArray(detail) && detail[0]?.msg) msg = detail[0].msg;
      else if (e.message) msg = e.message;
      setInlineError(msg);
    } finally {
      setInlineLoading(false);
    }
  }, [inlinePassword, login, passwordHintInline, toast]);

  const ensureProviderThenPublish = useCallback(async () => {
    setPublishError('');
    setInlineError('');
    if (!hasProviderRoleInStorage()) {
      const pwdErr = validatePassword(inlinePassword, passwordHintInline);
      const cel9 = getUserAuthState().phone;
      const celErr = cel9
        ? validateCelularChile(cel9)
        : 'No detectamos tu celular en este dispositivo. Recarga la página (actualiza la sesión) o inicia sesión una vez con celular y código SMS.';
      if (pwdErr || celErr) {
        setPublishError(pwdErr || celErr);
        return false;
      }
      setInlineLoading(true);
      try {
        const res = await submitBecomeProviderMinimal({
          password: inlinePassword,
          celular: cel9,
        });
        const data = res.data || {};
        if (data.id) localStorage.setItem('userId', data.id);
        if (Array.isArray(data.roles) && data.roles.length) {
          localStorage.setItem('userRoles', JSON.stringify(data.roles));
          if (data.roles.includes('provider')) localStorage.setItem('userRole', 'provider');
        }
        const uid = String(data.id || localStorage.getItem('userId') || '');
        if (uid && data.roles?.includes('provider')) {
          login(uid, 'provider', 'super_master', null);
        }
        setInlineReady(true);
      } catch (e) {
        const detail = e.response?.data?.detail;
        let msg = 'No se pudo crear la cuenta proveedor.';
        if (typeof detail === 'string') msg = detail;
        else if (Array.isArray(detail) && detail[0]?.msg) msg = detail[0].msg;
        else if (e.message) msg = e.message;
        setPublishError(msg);
        return false;
      } finally {
        setInlineLoading(false);
      }
    }
    return true;
  }, [inlinePassword, login, passwordHintInline]);

  const handleMachineFirstPublish = useCallback(async () => {
    setPublishError('');
    const ok = await ensureProviderThenPublish();
    if (!ok) return;

    const machines = getArray('providerMachines', []);
    const hasRegisteredMachine = Array.isArray(machines)
      ? machines.some((m) => Boolean(m?.machineryType && String(m.licensePlate || '').trim()))
      : false;
    if (!hasRegisteredMachine) {
      const providerData = getObject('providerData', {});
      const companyComplete = Boolean(providerData?.businessName && providerData?.rut);
      navigate(companyComplete ? '/provider/machine-data' : '/provider/data', { replace: true });
      return;
    }

    const machineryType = form.machineryType;
    if (!machineryType) {
      setPublishError('Falta el tipo de máquina.');
      return;
    }

    const priceBaseNum = parseInt(String(priceBaseWizard).replace(/\D/g, ''), 10) || 0;
    const isPerHour = MACHINERY_PER_HOUR.includes(machineryType);
    const needsTransport = !MACHINERY_NO_TRANSPORT.includes(machineryType);
    const refPrice = REFERENCE_PRICES[machineryType] || 80000;
    const maxPrice = Math.round(refPrice * MAX_PRICE_ABOVE_MARKET_PCT);
    const minPrice = isPerHour ? MIN_PRICE_HOUR : MIN_PRICE_SERVICE;
    if (priceBaseNum < minPrice || priceBaseNum > maxPrice) {
      setPublishError(tariffBaseRangeMessage(isPerHour, minPrice, maxPrice));
      return;
    }

    const maxTransport = Math.round(REFERENCE_TRANSPORT * MAX_PRICE_ABOVE_MARKET_PCT);
    const transportNum = needsTransport
      ? parseInt(String(transportWizard).replace(/\D/g, ''), 10) || 0
      : 0;
    if (needsTransport) {
      if (transportNum < MIN_TRANSPORT || transportNum > maxTransport) {
        setPublishError(transportRangeMessage(MIN_TRANSPORT, maxTransport));
        return;
      }
    }
    const transportCost = needsTransport ? transportNum : 0;
    const plate = formatLicensePlateInput(form.licensePlate);
    if (!LICENSE_PLATE_REGEX.test(plate)) {
      setPublishError('Completa marca, modelo y patente válida (formato BBBB-44).');
      return;
    }

    const capOpts = getMachineryCapacityOptions(machineryType);

    setPublishLoading(true);
    try {
      const brandDisplay = [form.brand, form.model].filter(Boolean).join(' ').trim();
      const next = {
        machineryType,
        brand: brandDisplay || form.brand || 'Nueva máquina',
        model: form.model || '',
        year: form.year || '',
        licensePlate: plate,
        pricePerHour: isPerHour ? priceBaseNum : null,
        pricePerService: isPerHour ? null : priceBaseNum,
        transportCost,
        operators: [],
      };
      if (capOpts?.providerField) {
        const raw = form[capOpts.providerField];
        if (raw !== '' && raw != null) {
          const num = String(raw).includes('.') ? parseFloat(raw) : parseInt(String(raw), 10);
          if (Number.isFinite(num)) next[capOpts.providerField] = num;
        }
      }

      const created = addMachine(next);
      const photosForStore = Array.isArray(mfPhotos) ? mfPhotos : [];
      updateMachine(created.id, { photos: photosForStore });

      toast.success('Maquinaria guardada');
      navigate('/provider/machines', {
        replace: true,
        state: { activationEdit: true, returnTo: '/provider/home', openOperatorForMachineId: created.id },
      });
    } catch (e) {
      setPublishError(e?.message || 'No se pudo guardar la maquinaria. Intenta de nuevo.');
    } finally {
      setPublishLoading(false);
    }
  }, [ensureProviderThenPublish, form, mfPhotos, navigate, priceBaseWizard, transportWizard, toast]);

  const currentYear = new Date().getFullYear();
  const MIN_YEAR = 1950;

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleYearChange = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    update('year', digits);
  };

  const validateYear = () => {
    const y = form.year.trim();
    if (!y) return true;
    const num = parseInt(y, 10);
    if (isNaN(num) || num < MIN_YEAR || num > currentYear) return false;
    return true;
  };

  const yearError = form.year && !validateYear();

  const handleWizardContinue = () => {
    setStepHint('');
    if (mfStep === 1) {
      if (!isMachineSpecificationComplete(form, yearError)) {
        setShowMachineFirstFieldErrors(true);
        setStepHint('Completa tipo, marca, modelo y patente con formato BBBB-44.');
        return;
      }
      setShowMachineFirstFieldErrors(false);
      setMfStep(2);
      return;
    }
    if (mfStep === 2) {
      const machineryType = form.machineryType;
      const priceBaseNum = parseInt(String(priceBaseWizard).replace(/\D/g, ''), 10) || 0;
      const isPerHour = MACHINERY_PER_HOUR.includes(machineryType);
      const refPrice = REFERENCE_PRICES[machineryType] || 80000;
      const maxPrice = Math.round(refPrice * MAX_PRICE_ABOVE_MARKET_PCT);
      const minPrice = isPerHour ? MIN_PRICE_HOUR : MIN_PRICE_SERVICE;
      if (priceBaseNum < minPrice || priceBaseNum > maxPrice) {
        setStepHint(tariffBaseRangeMessage(isPerHour, minPrice, maxPrice));
        return;
      }
      const needsT = !MACHINERY_NO_TRANSPORT.includes(machineryType);
      if (needsT) {
        const tNum = parseInt(String(transportWizard).replace(/\D/g, ''), 10) || 0;
        const maxT = Math.round(REFERENCE_TRANSPORT * MAX_PRICE_ABOVE_MARKET_PCT);
        if (tNum < MIN_TRANSPORT) {
          setStepHint(
            `El traslado neto no puede ser menor a ${MIN_TRANSPORT.toLocaleString('es-CL')} CLP (sin IVA).`
          );
          return;
        }
        if (tNum > maxT) {
          setStepHint(`El traslado neto no puede superar ${maxT.toLocaleString('es-CL')} CLP (sin IVA).`);
          return;
        }
      }
      setMfStep(3);
    }
  };

  const handleWizardBack = () => {
    setStepHint('');
    if (mfStep > 1) {
      if (mfStep === 2) setShowMachineFirstFieldErrors(false);
      setMfStep((s) => s - 1);
      return;
    }
    const isProviderSession = hasProviderRoleInStorage() || inlineReady;
    const hasHistory = typeof window !== 'undefined' && window.history && window.history.length > 1;
    if (isProviderSession) {
      if (hasHistory) navigate(-1);
      else navigate('/provider/machines');
      return;
    }
    navigate('/welcome');
  };

  const handleContinue = () => {
    if (yearError) return;
    if (!isEditMode && !isAddMachineEntry && !hasProviderRoleInStorage() && !inlineReady) {
      toast.error('Primero crea tu cuenta proveedor con correo y contraseña arriba.');
      return;
    }
    localStorage.setItem('machineData', JSON.stringify(form));
    if (isEditMode && (editMachine?.id || id)) {
      const typeName =
        MACHINERY_TYPES.find((m) => m.id === form.machineryType)?.name ||
        editMachine?.type ||
        'Retroexcavadora';
      const brandDisplay = [form.brand, form.model].filter(Boolean).join(' ');
      const updates = {
        machineryType: form.machineryType,
        type: typeName,
        brand: brandDisplay || form.brand,
        model: form.model,
        year: form.year,
        licensePlate: form.licensePlate,
      };
      const capOpts = getMachineryCapacityOptions(form.machineryType);
      if (capOpts && form[capOpts.providerField]) {
        const raw = form[capOpts.providerField];
        const num = raw.includes('.') ? parseFloat(raw) : parseInt(raw, 10);
        if (Number.isFinite(num)) updates[capOpts.providerField] = num;
      }
      updateMachine(editMachine?.id || id, updates);
      navigate('/provider/machines');
    } else {
      if (activationEdit) {
        navigate(returnTo, { replace: true });
        return;
      }
      localStorage.setItem('providerOnboardingStep', '3');
      navigate('/provider/machine-photos-pricing');
    }
  };

  const handleBack = () => {
    if (activationEdit) {
      navigate(returnTo);
      return;
    }
    if (isEditMode) navigate('/provider/machines');
    else if (isAddMachineEntry) navigate('/welcome');
    else navigate('/provider/data');
  };

  const hasValidLicensePlate = LICENSE_PLATE_REGEX.test(form.licensePlate);
  const machineFieldsOk =
    form.machineryType && form.brand && form.model && hasValidLicensePlate && !yearError;
  const canProceedMachine = isEditMode || hasProviderRoleInStorage() || inlineReady;
  const isValid = machineFieldsOk && canProceedMachine;

  const priceBaseNumWizard = parseInt(String(priceBaseWizard).replace(/\D/g, ''), 10) || 0;
  const refForType = REFERENCE_PRICES[form.machineryType] || 80000;
  const isPerHourW = MACHINERY_PER_HOUR.includes(form.machineryType);
  const minForType = isPerHourW ? MIN_PRICE_HOUR : MIN_PRICE_SERVICE;
  const priceAlertW =
    mfStep === 2 && priceBaseNumWizard >= minForType
      ? getPriceAlert(priceBaseNumWizard, refForType)
      : null;
  const transportNumW = parseInt(String(transportWizard).replace(/\D/g, ''), 10) || 0;
  const needsTransportW =
    Boolean(form.machineryType) && !MACHINERY_NO_TRANSPORT.includes(form.machineryType);
  const maxTransportW = Math.round(REFERENCE_TRANSPORT * MAX_PRICE_ABOVE_MARKET_PCT);
  const transportAlertW =
    mfStep === 2 && needsTransportW && transportNumW >= MIN_TRANSPORT
      ? getTransportAlert(transportNumW)
      : null;

  /** Mismo look que `MachinePhotosPricingScreen`: fondo crema y referencia solo en placeholder. */
  const wizardTariffInputStyle = {
    width: '100%',
    padding: '16px 16px 16px 36px',
    background: '#F5EFE6',
    border: 'none',
    borderRadius: 12,
    fontSize: 18,
    fontWeight: 600,
    color: '#1A1A1A',
    boxSizing: 'border-box',
  };
  const priceRefPlaceholder = form.machineryType ? refForType.toLocaleString('es-CL') : '';

  if (isAddMachineEntry && !isEditMode) {
    const typeLabel = MACHINERY_TYPES.find((m) => m.id === form.machineryType)?.name || '—';
    const capacitySummaryLine = getMachineCapacityDisplayText(form);

    return (
      <div className="maqgo-app maqgo-provider-funnel">
        <div
          className="maqgo-screen"
          style={{ paddingBottom: mfStep === 3 ? 136 : 120, overflowY: 'auto' }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <button
              type="button"
              onClick={handleWizardBack}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              aria-label="Volver"
            >
              <BackArrowIcon style={{ color: '#fff' }} />
            </button>
            <div style={{ flex: 1 }}>
              <MaqgoLogo size="small" />
            </div>
            <div style={{ width: 24 }} />
          </div>

          <ProviderOnboardingProgress currentStep={mfStep} steps={MACHINE_FIRST_ONBOARDING_STEPS} />

          <h1
            className="maqgo-h1"
            style={{ textAlign: 'center', marginBottom: mfStep === 2 ? 22 : 8 }}
          >
            {mfStep === 1 && 'Agregar maquinaria'}
            {mfStep === 2 && 'Fotos y tarifas'}
            {mfStep === 3 && 'Revisa y guarda'}
          </h1>
          {mfStep === 2 && (
            <p
              style={{
                color: 'rgba(255,255,255,0.82)',
                fontSize: 14,
                textAlign: 'center',
                marginBottom: 16,
                lineHeight: 1.45,
                padding: '0 4px',
              }}
            >
              <span style={{ display: 'block' }}>Fotos opcionales</span>
              <span style={{ display: 'block' }}>
                Son de uso interno de MAQGO y no serán visibles para clientes.
              </span>
            </p>
          )}
          {mfStep !== 2 && (
            <p style={{ color: 'rgba(255,255,255,0.78)', fontSize: 14, textAlign: 'center', marginBottom: 22 }}>
              {mfStep === 1 && 'Tipo, marca, modelo, capacidad si aplica y patente'}
              {mfStep === 3 && 'Confirma máquina y tarifas.'}
            </p>
          )}

          {mfStep === 1 && (
            <form
              id="maqgo-mf-step1"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                handleWizardContinue();
              }}
            >
              <MachineSpecificationFields
                form={form}
                update={update}
                handleYearChange={handleYearChange}
                yearError={yearError}
                currentYear={currentYear}
                MIN_YEAR={MIN_YEAR}
                machineFirstOptimize
                showMachineFirstFieldErrors={showMachineFirstFieldErrors}
                machineryTypeSelectRef={machineryTypeSelectRef}
              />
            </form>
          )}

          {mfStep === 2 && (
            <form
              id="maqgo-mf-step2"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                handleWizardContinue();
              }}
            >
              <div>
              <MachineWizardPhotosBlock photos={mfPhotos} setPhotos={setMfPhotos} />
              <div id="machine-wizard-tarifas" style={{ scrollMarginTop: 72 }}>
              <label
                style={{
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: 14,
                  marginBottom: 8,
                  display: 'block',
                  fontWeight: 500,
                }}
              >
                {isPerHourW ? 'Precio por hora neto (sin IVA)' : 'Precio por servicio neto (sin IVA)'}
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
                    zIndex: 1,
                  }}
                >
                  $
                </span>
                <input
                  ref={priceBaseInputRef}
                  type="text"
                  inputMode="numeric"
                  value={
                    priceBaseWizard
                      ? (parseInt(String(priceBaseWizard).replace(/\D/g, ''), 10) || 0).toLocaleString(
                          'es-CL'
                        )
                      : ''
                  }
                  onChange={(e) => setPriceBaseWizard(e.target.value.replace(/\D/g, ''))}
                  placeholder={priceRefPlaceholder}
                  style={wizardTariffInputStyle}
                  data-testid="mf-wizard-price-input"
                />
              </div>
              {priceAlertW ? (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    borderRadius: 8,
                    background: `${priceAlertW.color}20`,
                    border: `1px solid ${priceAlertW.color}60`,
                  }}
                >
                  <p
                    style={{
                      color: priceAlertW.color,
                      fontSize: 12,
                      fontWeight: 600,
                      margin: 0,
                      lineHeight: 1.4,
                    }}
                  >
                    {priceAlertW.msg}
                  </p>
                </div>
              ) : null}
              {needsTransportW ? (
                <>
                  <label
                    style={{
                      color: 'rgba(255,255,255,0.8)',
                      fontSize: 14,
                      marginBottom: 8,
                      marginTop: 18,
                      display: 'block',
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
                      value={
                        transportWizard
                          ? (parseInt(String(transportWizard).replace(/\D/g, ''), 10) || 0).toLocaleString(
                              'es-CL'
                            )
                          : ''
                      }
                      onChange={(e) => setTransportWizard(e.target.value.replace(/\D/g, ''))}
                      placeholder={REFERENCE_TRANSPORT.toLocaleString('es-CL')}
                      style={wizardTariffInputStyle}
                      data-testid="add-machine-transport-input"
                    />
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 6, marginLeft: 4 }}>
                    Ref: {REFERENCE_TRANSPORT.toLocaleString('es-CL')} · Máx: {maxTransportW.toLocaleString('es-CL')}
                  </p>
                  {transportAlertW ? (
                    <div
                      style={{
                        marginTop: 8,
                        padding: 10,
                        borderRadius: 8,
                        background: `${transportAlertW.color}20`,
                        border: `1px solid ${transportAlertW.color}60`,
                      }}
                    >
                      <p
                        style={{
                          color: transportAlertW.color,
                          fontSize: 12,
                          fontWeight: 600,
                          margin: 0,
                          lineHeight: 1.4,
                        }}
                      >
                        {transportAlertW.msg}
                      </p>
                    </div>
                  ) : null}
                </>
              ) : (
                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 8, lineHeight: 1.35 }}>
                  Este tipo no lleva traslado en el cálculo MAQGO (precio por servicio/viaje).
                </p>
              )}
              </div>
              </div>
            </form>
          )}

          {mfStep === 3 && (
            <div>
              <div
                className="maqgo-machine-review-card"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: 14,
                  padding: 16,
                  marginBottom: 16,
                  fontSize: 14,
                  color: 'rgba(255,255,255,0.92)',
                  lineHeight: 1.5,
                }}
              >
                <div>
                  <strong>Tipo:</strong> {typeLabel}
                </div>
                <div>
                  <strong>Marca / modelo:</strong>{' '}
                  {[form.brand, form.model].filter(Boolean).join(' ') || '—'}
                </div>
                {form.year ? (
                  <div>
                    <strong>Año:</strong> {form.year}
                  </div>
                ) : null}
                {capacitySummaryLine ? (
                  <div>
                    <strong>{getProviderSpecLabel(form.machineryType)}:</strong> {capacitySummaryLine}
                  </div>
                ) : null}
                <div>
                  <strong>Patente:</strong> {form.licensePlate || '—'}
                </div>
                <div>
                  <strong>Fotos:</strong>{' '}
                  {mfPhotos.length > 0 ? `${mfPhotos.length} cargada(s)` : 'ninguna (opcional)'}
                </div>
                <div>
                  <strong>Precio:</strong>{' '}
                  {priceBaseNumWizard
                    ? `${priceBaseNumWizard.toLocaleString('es-CL')} CLP${isPerHourW ? '/h' : ''}`
                    : '—'}
                </div>
                {needsTransportW ? (
                  <div>
                    <strong>Traslado:</strong>{' '}
                    {transportNumW
                      ? `${transportNumW.toLocaleString('es-CL')} CLP`
                      : '—'}
                  </div>
                ) : null}
              </div>

              {!hasProviderRoleInStorage() ? (
                <div
                  style={{
                    background: 'rgba(236, 104, 25, 0.12)',
                    border: '1px solid rgba(236, 104, 25, 0.45)',
                    borderRadius: 12,
                    padding: '14px 16px',
                    marginBottom: 16,
                  }}
                >
                  <p style={{ color: '#fff', fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>
                    Cuenta proveedor
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, margin: '0 0 12px', lineHeight: 1.4 }}>
                    Crea tu cuenta aquí. Empresa y banco, después en el perfil.
                  </p>
                  <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, display: 'block', marginBottom: 6 }}>
                    Contraseña
                  </label>
                  <PasswordField
                    id="machine-first-inline-pwd"
                    name="new-password"
                    placeholder="Letras y números, 8–12 caracteres"
                    value={inlinePassword}
                    onChange={(e) => setInlinePassword(e.target.value)}
                    error={false}
                    autoComplete="new-password"
                    minLength={PASSWORD_RULES.minLength}
                    maxLength={PASSWORD_RULES.maxLength}
                  />
                </div>
              ) : null}

              {publishError ? (
                <p style={{ color: '#f44336', fontSize: 12, marginBottom: 10 }}>{publishError}</p>
              ) : null}
            </div>
          )}

          {stepHint ? (
            <p style={{ color: '#ffb74d', fontSize: 13, marginTop: 12, textAlign: 'center' }}>{stepHint}</p>
          ) : null}
        </div>

        <div
          className={`maqgo-fixed-bottom-bar${mfStep === 3 ? ' maqgo-fixed-bottom-bar--final' : ''}`}
        >
          {mfStep < 3 ? (
            <button
              type="submit"
              form={mfStep === 1 ? 'maqgo-mf-step1' : 'maqgo-mf-step2'}
              className="maqgo-btn-primary"
            >
              Continuar
            </button>
          ) : (
            <button
              type="button"
              className="maqgo-btn-primary"
              onClick={() => handleMachineFirstPublish()}
              disabled={publishLoading || inlineLoading}
              style={{ opacity: publishLoading || inlineLoading ? 0.7 : 1 }}
            >
              {publishLoading || inlineLoading ? 'Guardando…' : 'Guardar maquinaria'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div className="maqgo-screen" style={{ paddingBottom: 120, overflowY: 'auto' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <button
            onClick={handleBack}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            aria-label="Volver"
          >
            <BackArrowIcon style={{ color: '#fff' }} />
          </button>
          <div style={{ flex: 1 }}>
            <MaqgoLogo size="small" />
          </div>
          <div style={{ width: 24 }}></div>
        </div>

        {!isEditMode && !isAddMachineEntry && <ProviderOnboardingProgress currentStep={2} />}

        {!isEditMode && !isAddMachineEntry && !hasProviderRoleInStorage() && !inlineReady ? (
          <div
            style={{
              background: 'rgba(236, 104, 25, 0.12)',
              border: '1px solid rgba(236, 104, 25, 0.45)',
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 20,
            }}
          >
            <p style={{ color: '#fff', fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>
              Cuenta proveedor (obligatorio para publicar)
            </p>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, margin: '0 0 12px', lineHeight: 1.4 }}>
              Contraseña de acceso. Los datos de empresa y banco los completas después.
            </p>
            <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, display: 'block', marginBottom: 6 }}>
              Contraseña
            </label>
            <PasswordField
              id="machine-inline-provider-pwd"
              name="new-password"
              placeholder="Letras y números, 8–12 caracteres"
              value={inlinePassword}
              onChange={(e) => setInlinePassword(e.target.value)}
              error={false}
              autoComplete="new-password"
              minLength={PASSWORD_RULES.minLength}
              maxLength={PASSWORD_RULES.maxLength}
            />
            {inlineError ? <p style={{ color: '#f44336', fontSize: 12, marginTop: 8 }}>{inlineError}</p> : null}
            <button
              type="button"
              className="maqgo-btn-primary"
              style={{ width: '100%', marginTop: 14 }}
              disabled={inlineLoading}
              onClick={() => handleInlineProviderSubmit()}
            >
              {inlineLoading ? 'Creando cuenta…' : 'Continuar con cuenta proveedor'}
            </button>
          </div>
        ) : null}

        {!isEditMode && hasProviderRoleInStorage() && !isAddMachineEntry ? (
          <p
            style={{
              color: 'rgba(144, 189, 211, 0.95)',
              fontSize: 12,
              textAlign: 'center',
              marginBottom: 12,
            }}
          >
            Completa los datos de tu máquina para publicarla.
          </p>
        ) : null}

        <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 8 }}>
          {isEditMode ? 'Editar Máquina' : 'Datos de la Máquina'}
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center', marginBottom: 25 }}>
          {isEditMode ? 'Modifica los datos y guarda' : 'Tipo, marca, modelo y patente'}
        </p>

        {/* Formulario */}
        <MachineSpecificationFields
          form={form}
          update={update}
          handleYearChange={handleYearChange}
          yearError={yearError}
          currentYear={currentYear}
          MIN_YEAR={MIN_YEAR}
        />
      </div>

      <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, textAlign: 'center', marginBottom: 8 }}>
        Tu progreso se guarda. Puedes continuar después.
      </p>
      <div className="maqgo-fixed-bottom-bar">
        <button
          className="maqgo-btn-primary"
          onClick={handleContinue}
          disabled={!isValid}
          style={{ opacity: isValid ? 1 : 0.5 }}
        >
          {isEditMode ? 'Guardar cambios' : 'Siguiente'}
        </button>
      </div>
    </div>
  );
}

export default MachineDataScreen;
