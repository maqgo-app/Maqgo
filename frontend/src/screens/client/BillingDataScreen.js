import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getBookingBackRoute } from '../../utils/bookingFlow';
import { validateRut, sanitizeRutInput, formatRut } from '../../utils/chileanValidation';
import { getObject } from '../../utils/safeStorage';
import { saveBookingProgress } from '../../utils/abandonmentTracker';
import BookingProgress from '../../components/BookingProgress';
import { MaqgoButton } from '../../components/base';

/**
 * Pantalla de Datos de Facturación (Cliente)
 * Se muestra antes de registrar tarjeta para obtener datos de facturación
 */
function BillingDataScreen() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const backRoute = getBookingBackRoute(pathname);
  const [billingType, setBillingType] = useState('persona');
  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    rut: '',
    razonSocial: '',
    giro: '',
    direccion: ''
  });
  const [rutError, setRutError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Cargar datos del registro (nombre y apellido siempre separados)
    const registerData = getObject('registerData', {});
    if (registerData.nombre || registerData.apellido) {
      setForm(prev => ({
        ...prev,
        nombre: registerData.nombre || prev.nombre,
        apellido: registerData.apellido || prev.apellido
      }));
    }

    // Cargar datos de facturación guardados
    const savedBilling = getObject('billingData', {});
    if (savedBilling.billingType) {
      setBillingType(savedBilling.billingType);
      setForm(prev => ({ ...prev, ...savedBilling }));
    }
  }, []);

  useEffect(() => {
    const machinery = localStorage.getItem('selectedMachinery') || '';
    const location = localStorage.getItem('serviceLocation') || '';
    saveBookingProgress('payment', { machinery, location });
  }, []);

  const update = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (field === 'rut' && rutError) setRutError('');
  };

  const handleContinue = () => {
    if (!validateRut(form.rut)) {
      setRutError('Ingresa un RUT chileno válido (8 o 9 caracteres, ej: 12.345.678-9)');
      return;
    }
    setRutError('');
    setIsSubmitting(true);
    const billingData = billingType === 'empresa'
      ? { billingType, razonSocial: form.razonSocial, rut: form.rut, giro: form.giro, direccion: form.direccion || '' }
      : { billingType, nombre: form.nombre, apellido: form.apellido || '', rut: form.rut };
    localStorage.setItem('billingData', JSON.stringify(billingData));
    const registerData = getObject('registerData', {});
    localStorage.setItem('registerData', JSON.stringify({ ...registerData, ...billingData }));
    navigate('/client/card');
  };

  const isValid = billingType === 'persona'
    ? form.nombre && form.apellido && form.rut && validateRut(form.rut)
    : form.razonSocial && form.rut && form.giro && form.direccion?.trim() && validateRut(form.rut);

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 20px 120px', overflowY: 'auto' }}>
        <BookingProgress />
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          marginBottom: 8
        }}>
          <button 
            onClick={() => navigate(backRoute || '/client/home')}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            aria-label="Volver"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div style={{ flex: 1 }} />
          <div style={{ width: 24 }} />
        </div>
        <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 4 }}>
          Datos de Facturación
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
          Necesarios para emitir tu factura
        </p>

        {/* Trust signal */}
        <div style={{
          background: 'rgba(76, 175, 80, 0.12)',
          border: '1px solid rgba(76, 175, 80, 0.3)',
          borderRadius: 10,
          padding: 12,
          marginBottom: 20,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>🔒</span>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, margin: 0, fontWeight: 600, fontFamily: "'Inter', sans-serif" }}>
              Pago seguro con Transbank
            </p>
            <p
              style={{
                color: 'rgba(255,255,255,0.8)',
                fontSize: 12,
                margin: '4px 0 0',
                lineHeight: 1.4,
                fontFamily: "'Inter', sans-serif"
              }}
            >
              Pagas a través de Transbank; tus datos se envían cifrados y no se guardan en MAQGO.
            </p>
          </div>
        </div>

        {/* Selector de tipo */}
        <p style={{ 
          color: 'rgba(255,255,255,0.95)', 
          fontSize: 14, 
          marginBottom: 12,
          fontFamily: "'Inter', sans-serif"
        }}>
          ¿Cómo quieres que facturemos?
        </p>
        
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <button
            onClick={() => setBillingType('persona')}
            style={{
              flex: 1,
              padding: '14px',
              background: billingType === 'persona' ? 'var(--maqgo-orange)' : '#2A2A2A',
              border: 'none',
              borderRadius: 10,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer'
            }}
            data-testid="billing-persona"
          >
            👤 Persona
          </button>
          <button
            onClick={() => setBillingType('empresa')}
            style={{
              flex: 1,
              padding: '14px',
              background: billingType === 'empresa' ? 'var(--maqgo-orange)' : '#2A2A2A',
              border: 'none',
              borderRadius: 10,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer'
            }}
            data-testid="billing-empresa"
          >
            🏢 Empresa
          </button>
        </div>

        {/* Formulario */}
        <div style={{ flex: 1 }}>
          {billingType === 'persona' ? (
            <>
              <label htmlFor="billing-nombre" style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block' }}>
                Nombre <span style={{ color: 'var(--maqgo-orange)' }}>*</span>
              </label>
              <input
                id="billing-nombre"
                className="maqgo-input"
                placeholder="Tu nombre"
                value={form.nombre}
                onChange={e => update('nombre', e.target.value)}
                style={{ marginBottom: 12 }}
                data-testid="billing-nombre"
              />
              <label htmlFor="billing-apellido" style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block' }}>
                Apellido <span style={{ color: 'var(--maqgo-orange)' }}>*</span>
              </label>
              <input
                id="billing-apellido"
                className="maqgo-input"
                placeholder="Tu apellido"
                value={form.apellido}
                onChange={e => update('apellido', e.target.value)}
                style={{ marginBottom: 12 }}
                data-testid="billing-apellido"
              />
              <label htmlFor="billing-rut" style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block' }}>
                RUT <span style={{ color: 'var(--maqgo-orange)' }}>*</span>
              </label>
              <input
                id="billing-rut"
                className="maqgo-input"
                placeholder="12.345.678-9"
                value={formatRut(form.rut)}
                onChange={e => update('rut', sanitizeRutInput(e.target.value))}
                maxLength={12}
                style={{ marginBottom: rutError ? 4 : 12, borderColor: rutError ? 'var(--maqgo-orange)' : undefined }}
                data-testid="billing-rut"
                aria-describedby={rutError ? 'billing-rut-error' : undefined}
              />
              {rutError && <p id="billing-rut-error" style={{ color: 'var(--maqgo-orange)', fontSize: 12, margin: '0 0 12px' }}>{rutError}</p>}
            </>
          ) : (
            <>
              <label htmlFor="billing-razon-social" style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block' }}>
                Razón Social <span style={{ color: 'var(--maqgo-orange)' }}>*</span>
              </label>
              <input
                id="billing-razon-social"
                className="maqgo-input"
                placeholder="Nombre de la empresa"
                value={form.razonSocial}
                onChange={e => update('razonSocial', e.target.value)}
                style={{ marginBottom: 12 }}
                data-testid="billing-razon-social"
              />
              
              <label htmlFor="billing-rut-empresa" style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block' }}>
                RUT Empresa <span style={{ color: 'var(--maqgo-orange)' }}>*</span>
              </label>
              <input
                id="billing-rut-empresa"
                className="maqgo-input"
                placeholder="76.123.456-7"
                value={formatRut(form.rut)}
                onChange={e => update('rut', sanitizeRutInput(e.target.value))}
                maxLength={12}
                style={{ marginBottom: rutError ? 4 : 12, borderColor: rutError ? 'var(--maqgo-orange)' : undefined }}
                data-testid="billing-rut-empresa"
                aria-describedby={rutError ? 'billing-rut-error' : undefined}
              />
              {rutError && <p id="billing-rut-error" style={{ color: 'var(--maqgo-orange)', fontSize: 12, margin: '0 0 12px' }}>{rutError}</p>}
              
              <label htmlFor="billing-giro" style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block' }}>
                Giro <span style={{ color: 'var(--maqgo-orange)' }}>*</span>
              </label>
              <input
                id="billing-giro"
                className="maqgo-input"
                placeholder="Giro comercial"
                value={form.giro}
                onChange={e => update('giro', e.target.value)}
                style={{ marginBottom: 12 }}
                data-testid="billing-giro"
              />
              
              <label htmlFor="billing-direccion" style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block' }}>
                Dirección comercial <span style={{ color: 'var(--maqgo-orange)' }}>*</span>
              </label>
              <input
                id="billing-direccion"
                className="maqgo-input"
                placeholder="Dirección comercial"
                value={form.direccion}
                onChange={e => update('direccion', e.target.value)}
                style={{ marginBottom: 12 }}
                data-testid="billing-direccion"
              />
            </>
          )}
        </div>

        {/* Info */}
        <p style={{ 
          color: 'rgba(255,255,255,0.7)', 
          fontSize: 12, 
          textAlign: 'center',
          marginBottom: 24,
          lineHeight: 1.4
        }}>
          MAQGO usará estos datos para emitir tu factura por la reserva.
          <br />
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>El cargo a tu tarjeta será cuando un operador acepte tu solicitud.</span>
        </p>
      </div>

      {/* Botón fijo - siempre visible */}
      <div className="maqgo-fixed-bottom-bar">
        <MaqgoButton
          onClick={handleContinue}
          disabled={!isValid}
          loading={isSubmitting}
          style={{ width: '100%' }}
          data-testid="billing-continue"
        >
          Siguiente
        </MaqgoButton>
      </div>
    </div>
  );
}

export default BillingDataScreen;
