import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ProviderOnboardingProgress from '../../components/ProviderOnboardingProgress';
import axios from 'axios';
import { getAndClearProviderReturnUrl } from '../../utils/registrationReturn';
import MaqgoLogo from '../../components/MaqgoLogo';

import BACKEND_URL from '../../utils/api';
import { MACHINERY_NAMES, getMachineryCapacityOptions, getProviderSpecLabelShort } from '../../utils/machineryNames';

/**
 * P08 - Revisión y Confirmación
 * Resumen de todos los datos antes de finalizar onboarding
 */
function ReviewScreen() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [providerData, setProviderData] = useState({});
  const [machineData, setMachineData] = useState({});
  const [operators, setOperators] = useState([]);
  const [photos, setPhotos] = useState([]);

  useEffect(() => {
    const safeParse = (key, fallback) => {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (_) {
        return fallback;
      }
    };
    setProviderData(safeParse('providerData', {}));
    setMachineData(safeParse('machineData', {}));
    const ops = safeParse('operatorsData', []);
    const imgs = safeParse('machinePhotos', []);
    setOperators(Array.isArray(ops) ? ops : []);
    setPhotos(Array.isArray(imgs) ? imgs : []);
  }, []);

  const handleConfirm = async () => {
    setLoading(true);
    
    try {
      const userId = localStorage.getItem('userId');
      if (!userId) {
        console.warn('ReviewScreen: userId no encontrado, continuando en modo demo');
        localStorage.setItem('providerOnboardingCompleted', 'true');
        localStorage.removeItem('providerOnboardingStep');
        navigate('/provider/home');
        setLoading(false);
        return;
      }
      
      // Guardar datos del proveedor en backend
      let primaryPhoto = null;
      if (Array.isArray(photos) && photos.length > 0) {
        const first = photos[0];
        primaryPhoto = typeof first === 'string' ? first : first.url;
      }
      const machinePayload = {
        ...machineData,
        primaryPhoto
      };

      // No enviar fotos base64 de operadores al backend (evita payload enorme y timeouts)
      const operatorsPayload = Array.isArray(operators)
        ? operators.map(op => ({ ...op, photo: undefined }))
        : [];
      const payload = {
        providerData,
        machineData: machinePayload,
        operators: operatorsPayload,
        onboarding_completed: true
      };
      if (machineData?.machineryType) payload.machineryType = machineData.machineryType;

      await axios.patch(`${BACKEND_URL}/api/users/${userId}`, payload, { timeout: 8000 });
      
      // Marcar onboarding como completado y limpiar paso
      localStorage.setItem('providerOnboardingCompleted', 'true');
      localStorage.removeItem('providerOnboardingStep');
      
      // Check if there's a return URL from before registration
      const returnUrl = getAndClearProviderReturnUrl();
      if (returnUrl && returnUrl.startsWith('/provider/')) {
        navigate(returnUrl);
      } else {
        navigate('/provider/home');
      }
    } catch (error) {
      // Continuar de todos modos para demo
      localStorage.setItem('providerOnboardingCompleted', 'true');
      localStorage.removeItem('providerOnboardingStep');
      
      const returnUrl = getAndClearProviderReturnUrl();
      if (returnUrl && returnUrl.startsWith('/provider/')) {
        navigate(returnUrl);
      } else {
        navigate('/provider/home');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => navigate('/provider/operator-data');

  // Especificación clave de la máquina (m³, litros, ton·m, etc.) para mostrar bajo patente
  const capacityConfig = getMachineryCapacityOptions(machineData.machineryType);
  let machineSpecLabel = null;
  let machineSpecValue = null;
  if (capacityConfig && capacityConfig.providerField) {
    const fieldName = capacityConfig.providerField;
    const raw = machineData[fieldName];
    if (raw !== undefined && raw !== null && raw !== '') {
      const unit = capacityConfig.unit || capacityConfig.unitDisplay || '';
      const vNum = Number(raw);
      const v = Number.isNaN(vNum) ? raw : vNum;
      if (unit === 'litros') {
        if (typeof v === 'number') {
          machineSpecValue = v >= 1000 ? `${(v / 1000).toFixed(0)}.000 L` : `${v} L`;
        } else {
          machineSpecValue = `${v} L`;
        }
      } else if (unit === 'm³ balde' || unit === 'm³') {
        machineSpecValue = `${String(v).replace('.', ',')} m³`;
      } else if (unit === 'ton·m') {
        machineSpecValue = `${v} ton·m`;
      } else if (unit === 'ton') {
        machineSpecValue = `${v} ton`;
      } else if (unit === 'HP') {
        machineSpecValue = `${v} HP`;
      } else if (unit === 'm hoja' || unit === 'm') {
        machineSpecValue = `${v} m`;
      } else {
        machineSpecValue = unit ? `${v} ${unit}` : String(v);
      }
      machineSpecLabel = getProviderSpecLabelShort(machineData.machineryType);
    }
  }

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ paddingBottom: 140, overflowY: 'auto' }}>
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

        <ProviderOnboardingProgress currentStep={6} />

        <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 6 }}>
          Revisa tus datos
        </h1>
        <p style={{ color: '#EC6819', fontSize: 13, fontWeight: 600, textAlign: 'center', marginBottom: 8 }}>
          ¡Casi listo!
        </p>
        <p style={{
          color: 'rgba(255,255,255,0.9)',
          fontSize: 14,
          textAlign: 'center',
          marginBottom: 25
        }}>
          Confirma que todo esté correcto antes de continuar
        </p>

        {/* Sección Proveedor */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Datos del Proveedor</h3>
          <div style={styles.row}>
            <span style={styles.label}>Empresa:</span>
            <span style={styles.value}>{providerData.businessName || '-'}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>RUT:</span>
            <span style={styles.value}>{providerData.rut || '-'}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Celular:</span>
            <span style={styles.value}>{providerData.phone ? `+56 ${providerData.phone}` : '-'}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Hora cierre:</span>
            <span style={styles.value}>{providerData.closingTime || '21:00'}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Factura electrónica afecta a IVA:</span>
            <span style={styles.value}>{providerData.emitsInvoice !== false ? 'Sí' : 'No'}</span>
          </div>
        </div>

        {/* Sección Máquina */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Datos de la Máquina</h3>
          <div style={styles.row}>
            <span style={styles.label}>Tipo:</span>
            <span style={styles.value}>{MACHINERY_NAMES[machineData.machineryType] || machineData.machineryType || '-'}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Marca:</span>
            <span style={styles.value}>{machineData.brand || '-'}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Modelo:</span>
            <span style={styles.value}>{machineData.model || '-'}</span>
          </div>
          {machineData.year && (
            <div style={styles.row}>
              <span style={styles.label}>Año:</span>
              <span style={styles.value}>{machineData.year}</span>
            </div>
          )}
          {machineSpecLabel && machineSpecValue && (
            <div style={styles.row}>
              <span style={styles.label}>{machineSpecLabel}:</span>
              <span style={styles.value}>{machineSpecValue}</span>
            </div>
          )}
          <div style={styles.row}>
            <span style={styles.label}>Patente:</span>
            <span style={{ ...styles.value, color: '#EC6819', fontWeight: 600 }}>
              {machineData.licensePlate || 'Sin patente'}
            </span>
          </div>
        </div>

        {/* Sección Fotos */}
        {photos.length > 0 && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Fotos ({photos.length})</h3>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
              {photos.map((photo, i) => {
                const src = typeof photo === 'string' ? photo : (photo?.url || '');
                if (!src) return null;
                return (
                  <img 
                    key={i}
                    src={src} 
                    alt={`Foto ${i+1}`}
                    style={{ width: 60, height: 45, borderRadius: 8, objectFit: 'cover' }}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Sección Operadores */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>
            Operador{operators.length > 1 ? 'es' : ''} ({operators.length})
          </h3>
          {operators.map((op, i) => (
            <div key={i} style={{ 
              marginBottom: i < operators.length - 1 ? 12 : 0,
              paddingBottom: i < operators.length - 1 ? 12 : 0,
              borderBottom: i < operators.length - 1 ? '1px solid #444' : 'none'
            }}>
              <div style={styles.row}>
                <span style={styles.label}>Nombre:</span>
                <span style={styles.value}>
                  {[op.nombre, op.apellido].filter(Boolean).join(' ').trim() || '-'} {op.isOwner && '(Propietario)'}
                </span>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>RUT:</span>
                <span style={styles.value}>{op.rut || '-'}</span>
              </div>
              {op.licenseType && (
                <div style={styles.row}>
                  <span style={styles.label}>Licencia:</span>
                  <span style={styles.value}>{op.licenseType}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Aviso sobre datos bancarios */}
        <div style={{
          background: 'rgba(144, 189, 211, 0.1)',
          border: '1px solid rgba(144, 189, 211, 0.3)',
          borderRadius: 12,
          padding: 14,
          marginBottom: 16
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
              <circle cx="12" cy="12" r="10" stroke="#90BDD3" strokeWidth="2"/>
              <path d="M12 8v4M12 16h.01" stroke="#90BDD3" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <div>
              <div style={{ color: '#90BDD3', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Datos bancarios
              </div>
              <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, lineHeight: 1.4 }}>
                Después de confirmar, podrás agregar tus datos bancarios en la sección <strong style={{ color: '#fff' }}>Perfil</strong>.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Botón fijo - FUERA del scroll para que siempre sea visible */}
      <div className="maqgo-fixed-bottom-bar">
        <button 
          className="maqgo-btn-primary"
          onClick={handleConfirm}
          disabled={loading}
          aria-busy={loading}
          aria-label={loading ? 'Guardando datos' : 'Confirmar y continuar'}
          style={{ width: '100%' }}
        >
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'maqgo-spin 0.8s linear infinite' }} />
              Guardando...
            </span>
          ) : (
            'Confirmar y Continuar'
          )}
        </button>
      </div>
    </div>
  );
}

const styles = {
  section: {
    background: '#363636',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16
  },
  sectionTitle: {
    color: '#EC6819',
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  label: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14
  },
  value: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 500
  }
};

export default ReviewScreen;
