import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { validateRut, formatRut, searchComunas, ALL_COMUNAS } from '../../utils/chileanValidation';
import { getObject } from '../../utils/safeStorage';

/**
 * Sub-pantalla: Datos de la Empresa
 * Con validación de RUT y autocompletado de comuna/dirección
 */
function EmpresaScreen() {
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const [rutError, setRutError] = useState('');
  const [showComunaSuggestions, setShowComunaSuggestions] = useState(false);
  const [comunaSuggestions, setComunaSuggestions] = useState([]);
  const comunaInputRef = useRef(null);
  
  const [data, setData] = useState({
    businessName: '',
    rut: '',
    email: '',
    phone: '',
    comuna: '',
    address: '',
    giro: ''
  });

  useEffect(() => {
    const saved = getObject('providerData', {});
    if (saved.businessName) setData(saved);
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

  const handleRutChange = (e) => {
    const value = e.target.value;
    const formatted = formatRut(value);
    setData(p => ({ ...p, rut: formatted }));
    
    // Clear error while typing
    if (rutError) setRutError('');
  };

  const handleRutBlur = () => {
    if (data.rut && !validateRut(data.rut)) {
      setRutError('RUT inválido. Verifica el formato y dígito verificador.');
    } else {
      setRutError('');
    }
  };

  const handleComunaChange = (e) => {
    const value = e.target.value;
    setData(p => ({ ...p, comuna: value }));
    
    if (value.length >= 2) {
      const suggestions = searchComunas(value, 8);
      setComunaSuggestions(suggestions);
      setShowComunaSuggestions(suggestions.length > 0);
    } else {
      setShowComunaSuggestions(false);
    }
  };

  const handleComunaSelect = (comuna) => {
    setData(p => ({ ...p, comuna }));
    setShowComunaSuggestions(false);
  };

  const handleSave = () => {
    // Validate RUT before saving
    if (data.rut && !validateRut(data.rut)) {
      setRutError('RUT inválido. Verifica el formato y dígito verificador.');
      return;
    }
    
    localStorage.setItem('providerData', JSON.stringify(data));
    setSaved(true);
    setTimeout(() => navigate('/provider/profile'), 1000);
  };

  const isValid = data.businessName && data.rut && validateRut(data.rut);

  const inputStyle = {
    width: '100%',
    padding: 14,
    background: '#2A2A2A',
    border: '1px solid #444',
    borderRadius: 10,
    color: '#fff',
    fontSize: 15
  };

  const inputErrorStyle = {
    ...inputStyle,
    border: '1px solid #f44336'
  };

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ padding: 24, paddingBottom: 120, overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
          <button 
            onClick={() => navigate('/provider/profile')}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: 8,
              marginRight: 12
            }}
            data-testid="back-button"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          <h1 style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>
            Datos de la empresa
          </h1>
        </div>

        {saved && (
          <div style={{
            background: 'rgba(76, 175, 80, 0.2)',
            padding: 12,
            borderRadius: 10,
            marginBottom: 20,
            textAlign: 'center'
          }}>
            <span style={{ color: '#4CAF50', fontSize: 14 }}>✓ Guardado</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Razón Social */}
          <div>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 6, display: 'block' }}>
              Razón social *
            </label>
            <input
              type="text"
              value={data.businessName}
              onChange={(e) => setData(p => ({ ...p, businessName: e.target.value }))}
              placeholder="Transportes ABC Ltda"
              style={inputStyle}
              data-testid="business-name-input"
            />
          </div>

          {/* RUT con validación */}
          <div>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 6, display: 'block' }}>
              RUT *
            </label>
            <input
              type="text"
              value={data.rut}
              onChange={handleRutChange}
              onBlur={handleRutBlur}
              placeholder="76.123.456-7"
              maxLength={12}
              style={rutError ? inputErrorStyle : inputStyle}
              data-testid="rut-input"
            />
            {rutError && (
              <p style={{ color: '#f44336', fontSize: 12, marginTop: 4, marginBottom: 0 }}>
                {rutError}
              </p>
            )}
          </div>

          {/* Giro */}
          <div>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 6, display: 'block' }}>
              Giro
            </label>
            <input
              type="text"
              value={data.giro}
              onChange={(e) => setData(p => ({ ...p, giro: e.target.value }))}
              placeholder="Arriendo de maquinaria"
              style={inputStyle}
              data-testid="giro-input"
            />
          </div>

          {/* Email */}
          <div>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 6, display: 'block' }}>
              Email de contacto
            </label>
            <input
              type="email"
              value={data.email}
              onChange={(e) => setData(p => ({ ...p, email: e.target.value }))}
              placeholder="contacto@empresa.cl"
              style={inputStyle}
              data-testid="email-input"
            />
          </div>

          {/* Teléfono */}
          <div>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 6, display: 'block' }}>
              Teléfono
            </label>
            <input
              type="tel"
              value={data.phone}
              onChange={(e) => setData(p => ({ ...p, phone: e.target.value }))}
              placeholder="+56 9 1234 5678"
              style={inputStyle}
              data-testid="phone-input"
            />
          </div>

          {/* Comuna con autocompletado */}
          <div style={{ position: 'relative' }} ref={comunaInputRef}>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 6, display: 'block' }}>
              Comuna
            </label>
            <input
              type="text"
              value={data.comuna}
              onChange={handleComunaChange}
              onFocus={() => {
                if (data.comuna.length >= 2) {
                  const suggestions = searchComunas(data.comuna, 8);
                  setComunaSuggestions(suggestions);
                  setShowComunaSuggestions(suggestions.length > 0);
                }
              }}
              placeholder="Ej: Providencia, Las Condes..."
              style={inputStyle}
              autoComplete="off"
              data-testid="comuna-input"
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
                maxHeight: 200,
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
                    data-testid={`comuna-suggestion-${idx}`}
                  >
                    {comuna}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Dirección comercial */}
          <div>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 6, display: 'block' }}>
              Dirección comercial
            </label>
            <input
              type="text"
              value={data.address}
              onChange={(e) => setData(p => ({ ...p, address: e.target.value }))}
              placeholder="Av. Principal 123"
              style={inputStyle}
              data-testid="address-input"
            />
            {data.comuna && (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4, marginBottom: 0 }}>
                {data.address ? `${data.address}, ${data.comuna}` : data.comuna}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Botón fijo - siempre visible */}
      <div className="maqgo-fixed-bottom-bar">
        <button
          className="maqgo-btn-primary"
          onClick={handleSave}
          disabled={!isValid}
          style={{ opacity: isValid ? 1 : 0.5 }}
          data-testid="save-button"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}

export default EmpresaScreen;
