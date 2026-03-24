import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { validateRut, formatRut } from '../../utils/chileanValidation';
import { getObject } from '../../utils/safeStorage';
import ComunaAutocomplete from '../../components/ComunaAutocomplete';
import { AddressAutocomplete, getGoogleMapsApiKey } from '../../components/AddressAutocomplete';

/**
 * Sub-pantalla: Datos de la Empresa
 * Con validación de RUT y autocompletado de comuna/dirección
 */
function EmpresaScreen() {
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const [rutError, setRutError] = useState('');
  const [scriptRetryKey, setScriptRetryKey] = useState(0);
  const [placesReady, setPlacesReady] = useState(false);
  const [placesPhase, setPlacesPhase] = useState('idle');
  const [placesReason, setPlacesReason] = useState('');
  const hasMapsApiKey = !!getGoogleMapsApiKey();
  
  const [data, setData] = useState({
    businessName: '',
    rut: '',
    email: '',
    phone: '',
    comuna: '',
    address: '',
    addressLat: null,
    addressLng: null,
    addressSource: 'manual',
    giro: ''
  });

  useEffect(() => {
    const saved = getObject('providerData', {});
    const hasSaved =
      saved &&
      typeof saved === 'object' &&
      (saved.businessName ||
        saved.rut ||
        saved.giro ||
        saved.comuna ||
        saved.address ||
        saved.email ||
        saved.phone);
    if (hasSaved) {
      setData((prev) => ({
        ...prev,
        ...saved,
        addressLat: Number.isFinite(saved.addressLat) ? saved.addressLat : null,
        addressLng: Number.isFinite(saved.addressLng) ? saved.addressLng : null,
        addressSource: saved.addressSource || 'manual',
      }));
    }
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
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 120px', overflowY: 'auto' }}>
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
          <div>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 6, display: 'block' }}>
              Comuna
            </label>
            <ComunaAutocomplete
              value={data.comuna}
              onChange={(value) => setData((p) => ({ ...p, comuna: value }))}
              placeholder="Ej: Providencia, Las Condes..."
              className="maqgo-input"
              style={{ fontSize: 15 }}
            />
          </div>

          {/* Dirección comercial */}
          <div>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 6, display: 'block' }}>
              Dirección comercial
            </label>
            <AddressAutocomplete
              value={data.address}
              onChange={(value) => setData((p) => ({ ...p, address: value }))}
              onPlacesReadyChange={setPlacesReady}
              onPlacesStatusChange={({ phase, reason }) => {
                setPlacesPhase(phase || 'idle');
                setPlacesReason(reason || '');
              }}
              scriptRetryKey={scriptRetryKey}
              onSelect={({ address, comuna, lat, lng }) => {
                setData((p) => ({
                  ...p,
                  address: address || '',
                  comuna: comuna || p.comuna,
                  addressLat: Number.isFinite(lat) ? lat : null,
                  addressLng: Number.isFinite(lng) ? lng : null,
                  addressSource: Number.isFinite(lat) && Number.isFinite(lng) ? 'google_places' : 'manual',
                }));
              }}
              placeholder="Av. Principal 123"
              className="maqgo-input"
              style={{ fontSize: 15 }}
              testId="address-input"
            />
            {hasMapsApiKey && placesPhase === 'failed' && (
              <div style={{ marginTop: 8 }}>
                <p style={{ color: '#ffb4b4', fontSize: 11, margin: 0 }}>
                  No se pudo cargar el autocompletado de mapas. Puedes escribir la dirección manualmente.
                </p>
                <button
                  type="button"
                  onClick={() => setScriptRetryKey((k) => k + 1)}
                  style={{
                    marginTop: 6,
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.25)',
                    background: 'transparent',
                    color: '#fff',
                    fontSize: 11,
                    cursor: 'pointer'
                  }}
                >
                  Reintentar autocompletado
                </button>
                {placesReason && (
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, margin: '6px 0 0' }}>
                    Detalle: {placesReason}
                  </p>
                )}
              </div>
            )}
            {hasMapsApiKey && placesReady && (
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 6, marginBottom: 0 }}>
                Selecciona una opción de la lista para fijar la dirección exacta del negocio.
              </p>
            )}
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
