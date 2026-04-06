import React, { useState, useEffect } from 'react';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { useNavigate } from 'react-router-dom';
import { validateRut, formatRut } from '../../utils/chileanValidation';
import MaqgoLogo from '../../components/MaqgoLogo';
import ProviderOnboardingProgress from '../../components/ProviderOnboardingProgress';
import ComunaAutocomplete from '../../components/ComunaAutocomplete';
import { AddressAutocomplete, getGoogleMapsApiKey } from '../../components/AddressAutocomplete';
import { getObject } from '../../utils/safeStorage';

/**
 * P04 - Datos del Proveedor
 * Nombre empresa, RUT, dirección comercial, hora de cierre
 * Con validación de RUT y autocompletado de comunas
 */
function ProviderDataScreen() {
  const navigate = useNavigate();
  const [rutError, setRutError] = useState('');
  const [didSubmit, setDidSubmit] = useState(false);
  const [scriptRetryKey, setScriptRetryKey] = useState(0);
  const [placesReady, setPlacesReady] = useState(false);
  const [placesPhase, setPlacesPhase] = useState('idle');
  const [placesReason, setPlacesReason] = useState('');
  const hasMapsApiKey = !!getGoogleMapsApiKey();
  
  const [form, setForm] = useState({
    businessName: '',
    rut: '',
    giro: '',
    comuna: '',
    address: '',
    addressLat: null,
    addressLng: null,
    addressSource: 'manual',
    closingTime: '21:00',
    emitsInvoice: true
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
        saved.closingTime != null);
    if (hasSaved) {
      setForm((prev) => ({
        ...prev,
        ...saved,
        addressLat: Number.isFinite(saved.addressLat) ? saved.addressLat : null,
        addressLng: Number.isFinite(saved.addressLng) ? saved.addressLng : null,
        addressSource: saved.addressSource || 'manual',
      }));
    }
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

  const handleContinue = () => {
    setDidSubmit(true);
    // Validate RUT before continuing
    if (form.rut && !validateRut(form.rut)) {
      setRutError('RUT inválido. Verifica el formato y dígito verificador.');
      return;
    }
    
    // Evitar que un onboarding previo "contamine" el alta de una nueva máquina
    // (ej: tipo anterior sin traslado + precio guardado). Fuente: localStorage.
    localStorage.removeItem('machineData');
    localStorage.removeItem('machinePricing');
    localStorage.removeItem('machinePhotos');

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
  const missingFields = [];
  if (!form.businessName) missingFields.push('Nombre propietario o empresa');
  if (!form.rut || !validateRut(form.rut)) missingFields.push('RUT válido');
  if (!form.comuna) missingFields.push('Comuna');
  if (!form.giro) missingFields.push('Giro comercial');
  if (!form.address) missingFields.push('Dirección comercial');

  return (
    <div className="maqgo-app maqgo-provider-funnel">
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
            <BackArrowIcon style={{ color: '#fff' }} />
          </button>
          <div style={{ flex: 1 }}>
            <MaqgoLogo size="small" />
          </div>
          
        </div>

        <ProviderOnboardingProgress currentStep={1} />

        <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 8 }}>
          Datos del Proveedor
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.88)', fontSize: 14, textAlign: 'center', marginBottom: 10, lineHeight: 1.45 }}>
          Unos minutos para validar tu empresa y seguir al paso de la maquinaria. Así los clientes confían en que eres un proveedor formal.
        </p>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, textAlign: 'center', marginBottom: 22, lineHeight: 1.4 }}>
          La dirección comercial es de tu negocio; la obra la verá el operador con la app cuando tomes trabajos.
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
            onBlur={() => setDidSubmit(true)}
            style={{
              borderColor: didSubmit && !form.businessName ? '#f44336' : undefined
            }}
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
          <ComunaAutocomplete
            value={form.comuna}
            onChange={(value) => update('comuna', value)}
            placeholder="Ej: Providencia, Las Condes..."
            className="maqgo-input"
            style={{ fontSize: 15 }}
          />
          
          <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, marginBottom: 8, marginTop: 12, display: 'block' }}>
            Giro comercial <span style={{ color: '#EC6819' }}>*</span>
          </label>
          <input
            className="maqgo-input"
            placeholder="Ej: Arriendo de maquinaria pesada"
            value={form.giro}
            onChange={e => update('giro', e.target.value)}
            onBlur={() => setDidSubmit(true)}
            style={{
              borderColor: didSubmit && !form.giro ? '#f44336' : undefined
            }}
            data-testid="provider-giro"
          />

          <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, marginBottom: 8, marginTop: 12, display: 'block' }}>
            Dirección comercial <span style={{ color: '#EC6819' }}>*</span>
          </label>
          <AddressAutocomplete
            value={form.address}
            onChange={(value) => update('address', value)}
            onPlacesReadyChange={setPlacesReady}
            onPlacesStatusChange={({ phase, reason }) => {
              setPlacesPhase(phase || 'idle');
              setPlacesReason(reason || '');
            }}
            scriptRetryKey={scriptRetryKey}
            onSelect={({ address, comuna, lat, lng }) => {
              update('address', address || '');
              if (comuna) update('comuna', comuna);
              update('addressLat', Number.isFinite(lat) ? lat : null);
              update('addressLng', Number.isFinite(lng) ? lng : null);
              update('addressSource', Number.isFinite(lat) && Number.isFinite(lng) ? 'google_places' : 'manual');
            }}
            placeholder="Av. Principal 1234"
            className="maqgo-input"
            style={{ fontSize: 15 }}
            testId="provider-address"
          />
          {didSubmit && missingFields.length > 0 && (
            <p style={{ color: '#f44336', fontSize: 12, marginTop: 8, marginBottom: 0 }}>
              Falta completar: {missingFields.join(', ')}.
            </p>
          )}
          {hasMapsApiKey && placesPhase === 'failed' && (
            <div style={{ marginTop: 8 }}>
              <p style={{ color: '#ffb4b4', fontSize: 13, margin: 0 }}>
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
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                Reintentar autocompletado
              </button>
              {placesReason && (
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: '6px 0 0' }}>
                  Detalle: {placesReason}
                </p>
              )}
            </div>
          )}
          {hasMapsApiKey && placesReady && (
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 6, marginBottom: 0 }}>
              Selecciona una opción de la lista para fijar la dirección exacta del negocio.
            </p>
          )}
          {form.comuna && (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 4, marginBottom: 0 }}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: '#fff', fontSize: 14, fontWeight: 600, margin: 0 }}>
                  ¿Emites factura electrónica?
                </p>
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, margin: '8px 0 0', lineHeight: 1.4 }}>
                  Muchas empresas filtran por esto al elegir proveedor. Puedes cambiarlo después en tu perfil.
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
            marginBottom: 6,
            display: 'block'
          }}>
            ¿Hasta qué hora trabajas?
          </label>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: '0 0 10px', lineHeight: 1.35 }}>
            Ayuda a mostrar disponibilidad creíble; no es un horario rígido de obra.
          </p>
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

      <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, textAlign: 'center', marginBottom: 8 }}>
        Tu progreso se guarda en este dispositivo. Puedes salir y volver cuando quieras.
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
          Siguiente: tu máquina
        </button>
      </div>
    </div>
  );
}

export default ProviderDataScreen;
