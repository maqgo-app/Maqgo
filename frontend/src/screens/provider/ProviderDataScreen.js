import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { validateRut, formatRut, searchComunas } from '../../utils/chileanValidation';
import MaqgoLogo from '../../components/MaqgoLogo';
import ProviderOnboardingProgress from '../../components/ProviderOnboardingProgress';
import { MAQGO_BILLING } from '../../utils/commissions';
import { getObject } from '../../utils/safeStorage';

/**
 * P04 - Datos del Proveedor
 * Nombre empresa, RUT, dirección comercial, hora de cierre
 * Con validación de RUT y autocompletado de comunas
 */
function ProviderDataScreen() {
  const navigate = useNavigate();
  const [rutError, setRutError] = useState('');
  const [showComunaSuggestions, setShowComunaSuggestions] = useState(false);
  const [comunaSuggestions, setComunaSuggestions] = useState([]);
  const comunaInputRef = useRef(null);
  
  const [form, setForm] = useState({
    businessName: '',
    rut: '',
    giro: '',
    comuna: '',
    address: '',
    closingTime: '21:00',
    emitsInvoice: true
  });

  useEffect(() => {
    const saved = getObject('providerData', {});
    if (saved.businessName) {
      setTimeout(() => setForm(prev => ({ ...prev, ...saved })), 0);
    }
  }, []);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (comunaInputRef.current && !comunaInputRef.current.contains(event.target)) {
        setShowComunaSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleRutChange = (e) => {
    const formatted = formatRut(e.target.value);
    update('rut', formatted);
    if (rutError) setRutError('');
  };

  const handleRutBlur = () => {
    if (form.rut && !validateRut(form.rut)) {
      setRutError('RUT inválido. Verifica el formato y dígito verificador.');
    } else {
      setRutError('');
    }
  };

  const handleComunaChange = (e) => {
    const value = e.target.value;
    update('comuna', value);
    
    if (value.length >= 2) {
      const suggestions = searchComunas(value, 6);
      setComunaSuggestions(suggestions);
      setShowComunaSuggestions(suggestions.length > 0);
    } else {
      setShowComunaSuggestions(false);
    }
  };

  const handleComunaSelect = (comuna) => {
    update('comuna', comuna);
    setShowComunaSuggestions(false);
  };

  const handleContinue = () => {
    // Validate RUT before continuing
    if (form.rut && !validateRut(form.rut)) {
      setRutError('RUT inválido. Verifica el formato y dígito verificador.');
      return;
    }
    
    // Combinar con datos del registro inicial
    const registerData = getObject('registerData', {});
    localStorage.setItem('providerData', JSON.stringify({ 
      ...form, 
      // Datos del registro inicial
      phone: registerData.celular,
      email: registerData.email 
    }));
    localStorage.setItem('providerOnboardingStep', '2');
    navigate('/provider/machine-data');
  };

  const handleBack = () => {
    const cameFromWelcome = localStorage.getItem('providerCameFromWelcome');
    navigate(cameFromWelcome ? '/' : '/select-role');
  };

  const isValid = form.businessName && form.rut && validateRut(form.rut) && form.giro && form.comuna && form.address;

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ paddingBottom: 120, overflowY: 'auto' }}>
        {/* Header con botón volver y logo */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <button 
            onClick={handleBack}
            style={{ 
              background: 'none', 
              border: 'none', 
              padding: 8, 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
            data-testid="back-button"
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

        <ProviderOnboardingProgress currentStep={1} />

        <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 8 }}>
          Datos del Proveedor
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center', marginBottom: 25 }}>
          Nombre o razón social, RUT y dirección.
        </p>

        {/* Formulario */}
        <div style={{ flex: 1 }}>
          <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, marginBottom: 8, display: 'block' }}>
            Nombre propietario o empresa <span style={{ color: '#EC6819' }}>*</span>
          </label>
          <input
            className="maqgo-input"
            placeholder="Nombre propietario o empresa"
            value={form.businessName}
            onChange={e => update('businessName', e.target.value)}
            data-testid="provider-business-name"
          />
          
          {/* RUT con validación */}
          <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, marginBottom: 8, marginTop: 12, display: 'block' }}>
            RUT (persona o empresa) <span style={{ color: '#EC6819' }}>*</span>
          </label>
          <input
            className="maqgo-input"
            placeholder="RUT (ej: 12.345.678-5)"
            value={form.rut}
            onChange={handleRutChange}
            onBlur={handleRutBlur}
            maxLength={12}
            style={rutError ? { borderColor: '#f44336' } : {}}
            data-testid="provider-rut"
          />
          {rutError && (
            <p style={{ color: '#f44336', fontSize: 12, marginTop: 4, marginBottom: 0 }}>
              {rutError}
            </p>
          )}
          
          {/* Comuna con autocompletado */}
          <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, marginBottom: 8, marginTop: 12, display: 'block' }}>
            Comuna <span style={{ color: '#EC6819' }}>*</span>
          </label>
          <div style={{ position: 'relative' }} ref={comunaInputRef}>
            <input
              className="maqgo-input"
              placeholder="Ej: Providencia, Las Condes..."
              value={form.comuna}
              onChange={handleComunaChange}
              onFocus={() => {
                if (form.comuna.length >= 2) {
                  const suggestions = searchComunas(form.comuna, 6);
                  setComunaSuggestions(suggestions);
                  setShowComunaSuggestions(suggestions.length > 0);
                }
              }}
              autoComplete="off"
              data-testid="provider-comuna"
            />
            
            {/* Suggestions dropdown */}
            {showComunaSuggestions && comunaSuggestions.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: '#333',
                border: '1px solid #555',
                borderRadius: 8,
                marginTop: 4,
                maxHeight: 180,
                overflowY: 'auto',
                zIndex: 100
              }}>
                {comunaSuggestions.map((comuna, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleComunaSelect(comuna)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: idx < comunaSuggestions.length - 1 ? '1px solid #444' : 'none',
                      color: '#fff',
                      fontSize: 14,
                      textAlign: 'left',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => e.target.style.background = '#444'}
                    onMouseLeave={(e) => e.target.style.background = 'transparent'}
                    data-testid={`comuna-option-${idx}`}
                  >
                    {comuna}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, marginBottom: 8, marginTop: 12, display: 'block' }}>
            Giro comercial <span style={{ color: '#EC6819' }}>*</span>
          </label>
          <input
            className="maqgo-input"
            placeholder="Ej: Arriendo de maquinaria pesada"
            value={form.giro}
            onChange={e => update('giro', e.target.value)}
            data-testid="provider-giro"
          />

          <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, marginBottom: 8, marginTop: 12, display: 'block' }}>
            Dirección comercial <span style={{ color: '#EC6819' }}>*</span>
          </label>
          <input
            className="maqgo-input"
            placeholder="Av. Principal 1234"
            value={form.address}
            onChange={e => update('address', e.target.value)}
            data-testid="provider-address"
          />
          {form.comuna && (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4, marginBottom: 0 }}>
              {form.address ? `${form.address}, ${form.comuna}` : form.comuna}
            </p>
          )}

          {/* Emite factura */}
          <div style={{
            background: '#2A2A2A',
            borderRadius: 12,
            padding: 14,
            marginTop: 20,
            marginBottom: 16
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ color: '#fff', fontSize: 14, fontWeight: 600, margin: 0 }}>
                  ¿Emites factura electrónica?
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => update('emitsInvoice', false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 20,
                    border: 'none',
                    background: !form.emitsInvoice ? '#EC6819' : '#444',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => update('emitsInvoice', true)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 20,
                    border: 'none',
                    background: form.emitsInvoice ? '#EC6819' : '#444',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Sí
                </button>
              </div>
            </div>
          </div>

          {/* Hora de cierre */}
          <label style={{ 
            color: 'rgba(255,255,255,0.8)', 
            fontSize: 14, 
            marginTop: 4,
            marginBottom: 10,
            display: 'block'
          }}>
            ¿Hasta qué hora trabajas?
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {['18:30', '19:00', '20:00', '21:00'].map(time => (
              <button
                key={time}
                type="button"
                onClick={() => update('closingTime', time)}
                style={{
                  flex: '1 1 45%',
                  padding: '14px 10px',
                  borderRadius: 12,
                  border: form.closingTime === time ? '2px solid #EC6819' : '2px solid #444',
                  background: form.closingTime === time ? 'rgba(236, 104, 25, 0.2)' : '#363636',
                  color: form.closingTime === time ? '#EC6819' : '#fff',
                  fontSize: 16,
                  fontWeight: form.closingTime === time ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                data-testid={`closing-time-${time.replace(':', '')}`}
              >
                {time}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, textAlign: 'center', marginBottom: 8 }}>
        Tu progreso se guarda. Puedes continuar después.
      </p>
      {/* Botón fijo - siempre visible */}
      <div className="maqgo-fixed-bottom-bar">
        <button 
          className="maqgo-btn-primary"
          onClick={handleContinue}
          disabled={!isValid}
          style={{ opacity: isValid ? 1 : 0.5 }}
          data-testid="provider-continue-btn"
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

export default ProviderDataScreen;
