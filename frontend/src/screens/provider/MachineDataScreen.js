import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import ProviderOnboardingProgress from '../../components/ProviderOnboardingProgress';
import { updateMachine, getMachineById } from '../../utils/providerMachines';
import { MACHINERY_CAPACITY_OPTIONS, getMachineryCapacityOptions, getProviderSpecLabel } from '../../utils/machineryNames';
import { getObject } from '../../utils/safeStorage';

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
  { id: 'minicargador', name: 'Minicargador' }
];

/**
 * P05 - Datos de la Máquina
 * Tipo, modelo, año, patente
 */
// Mapeo nombre display -> id (para modo edición desde MyMachines)
const TYPE_NAME_TO_ID = Object.fromEntries(
  MACHINERY_TYPES.map(m => [m.name.toLowerCase(), m.id])
);

function MachineDataScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const isEditMode = Boolean(id && location.pathname.includes('edit-machine'));
  const editMachine = location.state?.machine ?? (id ? getMachineById(id) : null);

  const [form, setForm] = useState({
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
    rollerTon: ''
  });

  useEffect(() => {
    if (isEditMode && editMachine) {
      // Pre-llenar desde máquina editada
      const matched = MACHINERY_TYPES.find(m => 
        m.name === editMachine.type || m.id === editMachine.type?.toLowerCase?.()
      );
      const machineryType = matched?.id || 
        TYPE_NAME_TO_ID[editMachine.type?.toLowerCase?.()] || '';
      const brandModel = editMachine.brand || '';
      const [brand = '', model = ''] = brandModel.includes(' ') 
        ? brandModel.split(/\s+(.+)/).slice(0, 2) 
        : [brandModel, ''];
      setTimeout(() => setForm({
        machineryType,
        brand: brand.trim(),
        model: model.trim(),
        year: editMachine.year || '',
        licensePlate: editMachine.licensePlate || '',
        capacityM3: editMachine.capacityM3 != null ? String(editMachine.capacityM3) : '',
        capacityLiters: editMachine.capacityLiters != null ? String(editMachine.capacityLiters) : '',
        capacityTonM: editMachine.capacityTonM != null ? String(editMachine.capacityTonM) : '',
        bucketM3: editMachine.bucketM3 != null ? String(editMachine.bucketM3) : '',
        weightTon: editMachine.weightTon != null ? String(editMachine.weightTon) : '',
        powerHp: editMachine.powerHp != null ? String(editMachine.powerHp) : '',
        bladeWidthM: editMachine.bladeWidthM != null ? String(editMachine.bladeWidthM) : '',
        craneTon: editMachine.craneTon != null ? String(editMachine.craneTon) : '',
        rollerTon: editMachine.rollerTon != null ? String(editMachine.rollerTon) : ''
      }), 0);
    } else {
      const saved = getObject('machineData', {});
      if (saved.machineryType) setTimeout(() => setForm(saved), 0);
    }
  }, [isEditMode, editMachine]);

  const currentYear = new Date().getFullYear();
  const MIN_YEAR = 1950;

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleYearChange = (value) => {
    // Solo dígitos, máx 4
    const digits = value.replace(/\D/g, '').slice(0, 4);
    update('year', digits);
  };

  const validateYear = () => {
    const y = form.year.trim();
    if (!y) return true; // Opcional: vacío es válido
    const num = parseInt(y, 10);
    if (isNaN(num) || num < MIN_YEAR || num > currentYear) return false;
    return true;
  };

  const yearError = form.year && !validateYear();

  const handleContinue = () => {
    if (yearError) return;
    localStorage.setItem('machineData', JSON.stringify(form));
    if (isEditMode && (editMachine?.id || id)) {
      const typeName = MACHINERY_TYPES.find(m => m.id === form.machineryType)?.name || editMachine?.type || 'Retroexcavadora';
      const brandDisplay = [form.brand, form.model].filter(Boolean).join(' ');
      const updates = {
        machineryType: form.machineryType,
        type: typeName,
        brand: brandDisplay || form.brand,
        model: form.model,
        year: form.year,
        licensePlate: form.licensePlate
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
      localStorage.setItem('providerOnboardingStep', '3');
      navigate('/provider/machine-photos');
    }
  };

  const handleBack = () => navigate(isEditMode ? '/provider/machines' : '/provider/data');

  const isValid = form.machineryType && form.brand && form.model && form.licensePlate && !yearError;

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ paddingBottom: 120, overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          marginBottom: 20
        }}>
          <button 
            onClick={handleBack}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            aria-label="Volver"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <MaqgoLogo size="small" />
          </div>
          <div style={{ width: 24 }}></div>
        </div>

        {!isEditMode && <ProviderOnboardingProgress currentStep={2} />}

        <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 8 }}>
          {isEditMode ? 'Editar Máquina' : 'Datos de la Máquina'}
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center', marginBottom: 25 }}>
          {isEditMode ? 'Modifica los datos y guarda' : 'Tipo, marca, modelo y patente'}
        </p>

        {/* Formulario */}
        <div style={{ flex: 1 }}>
          {/* Selector de tipo */}
          <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, marginBottom: 8, display: 'block' }}>
            Tipo de maquinaria <span style={{ color: '#EC6819' }}>*</span>
          </label>
          <select
            className="maqgo-input"
            value={form.machineryType}
            onChange={e => update('machineryType', e.target.value)}
            style={{ marginBottom: 12 }}
          >
            <option value="">Seleccionar tipo...</option>
            {MACHINERY_TYPES.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

          <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, marginBottom: 8, display: 'block' }}>
            Marca <span style={{ color: '#EC6819' }}>*</span>
          </label>
          <input
            className="maqgo-input"
            placeholder="Ej: Caterpillar, Komatsu"
            value={form.brand}
            onChange={e => update('brand', e.target.value)}
            style={{ marginBottom: 12 }}
          />
          
          <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, marginBottom: 8, display: 'block' }}>
            Modelo <span style={{ color: '#EC6819' }}>*</span>
          </label>
          <input
            className="maqgo-input"
            placeholder="Ej: 320D, PC200"
            value={form.model}
            onChange={e => update('model', e.target.value)}
            style={{ marginBottom: 12 }}
          />
          
          <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, marginBottom: 8, display: 'block' }}>
            Año (opcional)
          </label>
          <input
            className="maqgo-input"
            type="text"
            inputMode="numeric"
            placeholder={`Ej: 2020 (máx. ${currentYear})`}
            value={form.year}
            onChange={e => handleYearChange(e.target.value)}
            maxLength={4}
            style={{ marginBottom: 4, borderColor: yearError ? '#f44336' : undefined }}
            aria-invalid={yearError}
          />
          {yearError && (
            <p style={{ color: '#f44336', fontSize: 12, marginTop: 0, marginBottom: 12 }}>
              Ingresa un año válido entre {MIN_YEAR} y {currentYear}
            </p>
          )}
          
          {(() => {
            const opts = getMachineryCapacityOptions(form.machineryType);
            if (!opts) return null;
            const fieldName = opts.providerField;
            const unit = opts.unit || '';
            const formatOption = (v) => {
              if (unit === 'litros') return v >= 1000 ? `${(v / 1000).toFixed(0)}.000 L` : `${v} L`;
              if (unit === 'm³ balde') return `${String(v).replace('.', ',')} m³`;
              if (unit === 'm³') return `${v} m³`;
              if (unit === 'ton·m') return `${v} ton·m`;
              if (unit === 'ton') return `${v} ton`;
              if (unit === 'HP') return `${v} HP`;
              if (unit === 'm hoja') return `${v} m`;
              return `${v} ${unit}`;
            };
            return (
              <>
                <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, marginBottom: 8, marginTop: 8, display: 'block' }}>
                  {getProviderSpecLabel(form.machineryType)}
                </label>
                <select
                  className="maqgo-input"
                  value={form[fieldName] || ''}
                  onChange={e => update(fieldName, e.target.value)}
                  style={{ marginBottom: 12 }}
                >
                  <option value="">Seleccionar...</option>
                  {opts.options.map((v) => (
                    <option key={v} value={v}>{formatOption(v)}</option>
                  ))}
                </select>
              </>
            );
          })()}

          <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, marginBottom: 8, marginTop: 8, display: 'block' }}>
            Patente <span style={{ color: '#EC6819' }}>*</span>
          </label>
          <input
            className="maqgo-input"
            placeholder="Ej: BGKL-45"
            value={form.licensePlate}
            onChange={e => update('licensePlate', e.target.value.toUpperCase())}
            required
            data-testid="license-plate-input"
          />
          {!form.licensePlate && (
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, marginTop: 4, marginBottom: 0 }}>
              La patente es obligatoria para identificar tu maquinaria
            </p>
          )}
        </div>
      </div>

      <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, textAlign: 'center', marginBottom: 8 }}>
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
