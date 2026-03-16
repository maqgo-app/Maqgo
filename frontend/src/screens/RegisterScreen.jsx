import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TermsModal } from '../components/MaqgoComponents';
import MaqgoLogo from '../components/MaqgoLogo';
import { validateEmail, validateCelularChile } from '../utils/chileanValidation';
import BACKEND_URL from '../utils/api';

/**
 * C03 - Registro Cliente SIMPLIFICADO
 * Solo datos básicos: nombre, celular, email
 * Datos de facturación se piden al momento del pago
 */
function RegisterScreen() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    nombre: '',      // Usado como "Nombre completo"
    apellido: '',    // Se deja para compatibilidad interna (vacío)
    email: '',
    celular: ''
  });
  const [accepted, setAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [errors, setErrors] = useState({ email: '', celular: '' });

  const update = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleSubmit = async () => {
    if (!accepted) return;
    const emailErr = validateEmail(form.email);
    const celularErr = validateCelularChile(form.celular);
    if (emailErr || celularErr) {
      setErrors({ email: emailErr, celular: celularErr });
      return;
    }
    setErrors({ email: '', celular: '' });
    localStorage.setItem('registerData', JSON.stringify(form));

    // Enviar código SMS directamente (sin pantalla intermedia)
    const phone = form.celular ? `+56${form.celular.replace(/\D/g, '')}` : '';
    if (!phone) {
      setErrors(prev => ({ ...prev, celular: 'Número de celular inválido' }));
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/communications/sms/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: phone,
          channel: 'sms'
        })
      });
      const data = await response.json();
      if (data.success) {
        localStorage.setItem('verificationChannel', 'sms');
        navigate('/verify-sms');
      } else {
        setErrors(prev => ({ ...prev, celular: data.detail || data.error || 'Error al enviar el código SMS' }));
      }
    } catch (err) {
      setErrors(prev => ({
        ...prev,
        celular: err.message?.includes('Failed to fetch')
          ? 'No se pudo conectar al servidor. ¿Está el backend en marcha?'
          : 'Error de conexión. Intenta nuevamente.'
      }));
    }
  };

  const isValid = form.nombre && form.email && form.celular && accepted;

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen">
        {/* Logo */}
        <MaqgoLogo size="small" style={{ marginBottom: 30 }} />

        {/* Título */}
        <h2 style={{
          color: '#fff',
          fontSize: 22,
          fontWeight: 600,
          marginBottom: 20,
          fontFamily: "'Space Grotesk', sans-serif"
        }}>
          Crea tu cuenta
        </h2>

        {/* Formulario */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block' }}>
            Nombre completo <span style={{ color: '#EC6819' }}>*</span>
          </label>
          <input
            className="maqgo-input"
            placeholder="Ej: Juan Pérez"
            value={form.nombre}
            onChange={e => update('nombre', e.target.value)}
            style={{ marginBottom: 12 }}
            data-testid="register-nombre"
            aria-label="Nombre completo"
          />
          
          <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block' }}>
            Correo electrónico <span style={{ color: '#EC6819' }}>*</span>
          </label>
          <input
            className="maqgo-input"
            placeholder="correo@ejemplo.com"
            type="email"
            value={form.email}
            onChange={e => update('email', e.target.value)}
            style={{ marginBottom: 4 }}
            data-testid="register-email"
            aria-label="Correo electrónico"
          />
          {errors.email ? <p style={{ color: '#f44336', fontSize: 12, marginBottom: 8 }}>{errors.email}</p> : null}
          
          <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block' }}>
            Celular <span style={{ color: '#EC6819' }}>*</span>
          </label>
          <div className="maqgo-input" style={{ 
            display: 'flex', 
            alignItems: 'center',
            padding: 0,
            overflow: 'hidden',
            marginBottom: 16
          }}>
            <span style={{ 
              padding: '14px 12px',
              background: '#0f0f0f',
              color: '#888',
              borderRight: '1px solid rgba(255,255,255,0.1)'
            }}>
              +56
            </span>
            <input
              type="tel"
              placeholder="9 1234 5678"
              value={form.celular}
              onChange={e => update('celular', e.target.value.replace(/\D/g, '').slice(0, 9))}
              aria-label="Celular"
              style={{
                flex: 1,
                padding: '14px 12px',
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: 15,
                outline: 'none'
              }}
              data-testid="register-celular"
            />
          </div>
          {errors.celular ? <p style={{ color: '#f44336', fontSize: 12, marginBottom: 12 }}>{errors.celular}</p> : null}

          {/* Checkbox T&C */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'flex-start', 
            gap: 10,
            marginBottom: 16
          }}>
            <button
              type="button"
              onClick={() => setAccepted(!accepted)}
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                border: accepted ? 'none' : '2px solid #666',
                background: accepted ? '#EC6819' : 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: 2
              }}
              data-testid="terms-checkbox"
            >
              {accepted && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13L9 17L19 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
            <p style={{ 
              color: 'rgba(255,255,255,0.9)', 
              fontSize: 13, 
              margin: 0,
              lineHeight: 1.4,
              fontFamily: "'Inter', sans-serif"
            }}>
              Acepto los{' '}
              <span 
                onClick={() => setShowTerms(true)}
                style={{ color: '#90BDD3', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Términos y Condiciones
              </span>
            </p>
          </div>
        </div>

        {/* Botón */}
        <button 
          className="maqgo-btn-primary"
          onClick={handleSubmit}
          disabled={!isValid}
          style={{ opacity: isValid ? 1 : 0.5 }}
          data-testid="register-submit"
          aria-label="Continuar con el registro"
        >
          Continuar
        </button>

        {/* Link a login */}
        <p style={{ 
          color: 'rgba(255,255,255,0.95)', 
          fontSize: 13, 
          textAlign: 'center',
          marginTop: 16
        }}>
          ¿Ya tienes cuenta?{' '}
          <span 
            onClick={() => navigate('/login')}
            style={{ color: '#90BDD3', cursor: 'pointer' }}
          >
            Inicia sesión
          </span>
        </p>

        {/* Modal T&C */}
        {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
      </div>
    </div>
  );
}

export default RegisterScreen;
