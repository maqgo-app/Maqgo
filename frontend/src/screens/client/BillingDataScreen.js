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
 * Solo cuando el cliente eligió "Sí" a factura con RUT empresa.
 * Se piden: RUT, Razón social, Giro y Dirección tributaria.
 */
function BillingDataScreen() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const backRoute = getBookingBackRoute(pathname);
  const [form, setForm] = useState({
    rut: '',
    razonSocial: '',
    giro: '',
    direccion: ''
  });
  const [rutError, setRutError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const savedBilling = getObject('billingData', {});
    if (savedBilling.rut || savedBilling.razonSocial || savedBilling.giro || savedBilling.direccion) {
      setForm(prev => ({
        ...prev,
        rut: savedBilling.rut || prev.rut,
        razonSocial: savedBilling.razonSocial || prev.razonSocial,
        giro: savedBilling.giro || prev.giro,
        direccion: savedBilling.direccion || prev.direccion
      }));
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
    const billingData = {
      billingType: 'empresa',
      razonSocial: form.razonSocial.trim(),
      rut: form.rut,
      giro: form.giro?.trim() || '',
      direccion: form.direccion?.trim() || ''
    };
    localStorage.setItem('billingData', JSON.stringify(billingData));
    const registerData = getObject('registerData', {});
    localStorage.setItem('registerData', JSON.stringify({ ...registerData, ...billingData }));
    navigate('/client/card');
  };

  const isValid = form.razonSocial?.trim() && form.rut && validateRut(form.rut) && form.giro?.trim() && form.direccion?.trim();

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
          Datos de tu empresa para emitir la factura
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

        {/* Formulario: RUT empresa + Razón social */}
        <div style={{ flex: 1 }}>
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

          <label htmlFor="billing-giro" style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block', marginTop: 16 }}>
            Giro <span style={{ color: 'var(--maqgo-orange)' }}>*</span>
          </label>
          <input
            id="billing-giro"
            className="maqgo-input"
            placeholder="Ej: Arriendo de maquinaria"
            value={form.giro}
            onChange={e => update('giro', e.target.value)}
            style={{ marginBottom: 12 }}
            data-testid="billing-giro"
          />

          <label htmlFor="billing-direccion" style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block' }}>
            Dirección tributaria <span style={{ color: 'var(--maqgo-orange)' }}>*</span>
          </label>
          <input
            id="billing-direccion"
            className="maqgo-input"
            placeholder="Calle, número, comuna"
            value={form.direccion}
            onChange={e => update('direccion', e.target.value)}
            style={{ marginBottom: 12 }}
            data-testid="billing-direccion"
          />
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
