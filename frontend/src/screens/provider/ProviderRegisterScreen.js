import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import PasswordField from '../../components/PasswordField';
import { validateEmail, validateCelularChile } from '../../utils/chileanValidation';
import { useToast } from '../../components/Toast';
import { getPasswordHint, validatePassword, PASSWORD_RULES } from '../../utils/passwordValidation';

import BACKEND_URL from '../../utils/api';

/**
 * Pantalla P1 - Registro Proveedor
 */
function ProviderRegisterScreen() {
  const DRAFT_KEY = 'providerRegisterDraft';
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({
    nombre: '', apellido: '', email: '', celular: '', password: ''
  });
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({ email: '', celular: '', password: '' });
  const passwordHint = getPasswordHint(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft && typeof draft === 'object') {
        setTimeout(() => {
          setForm(prev => ({ ...prev, ...draft.form }));
          setAccepted(Boolean(draft.accepted));
        }, 0);
      }
    } catch {
      // Ignorar drafts corruptos sin romper el flujo
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, accepted }));
    } catch {
      // Sin bloqueo por storage
    }
  }, [form, accepted]);

  const update = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleSubmit = async () => {
    if (!accepted) return;
    const emailErr = validateEmail(form.email);
    const celularErr = validateCelularChile(form.celular);
    const passwordErr = validatePassword(form.password, passwordHint);
    if (emailErr || celularErr || passwordErr) {
      setErrors({ email: emailErr, celular: celularErr, password: passwordErr });
      return;
    }
    setErrors({ email: '', celular: '', password: '' });
    setLoading(true);
    
    try {
      const res = await axios.post(`${BACKEND_URL}/api/auth/register`, {
        ...form,
        role: 'provider'
      });
      if (res.data?.id) {
        localStorage.setItem('userId', res.data.id);
      }
    } catch (e) {
      const msg = e.response?.data?.detail;
      if (Array.isArray(msg)) {
        const pwdErr = msg.find(m => m.loc && m.loc[m.loc.length - 1] === 'password');
        if (pwdErr) setErrors(prev => ({ ...prev, password: pwdErr.msg || passwordHint }));
      } else if (typeof msg === 'string' && msg.toLowerCase().includes('password')) {
        setErrors(prev => ({ ...prev, password: msg }));
      } else if (msg) {
        toast.error(msg);
      }
      setLoading(false);
      return;
    }
    
    localStorage.setItem('registerData', JSON.stringify({...form, role: 'provider'}));
    toast.success('Revisa tu celular para el código de verificación');
    navigate('/provider/select-channel');
    setLoading(false);
  };

  const isValid = form.nombre && form.apellido && form.email && form.celular && !validatePassword(form.password, passwordHint) && accepted;

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen">
        {/* Logo y propuesta de valor */}
        <div style={{ marginBottom: 24 }}>
          <MaqgoLogo size="medium" style={{ marginBottom: 40 }} />
          <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 600, marginBottom: 6, textAlign: 'center' }}>
            Ofrecer mi maquinaria
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center', margin: 0 }}>
            Recibe solicitudes de reserva. Tú eliges cuándo aceptar.
          </p>
        </div>

        {/* Formulario */}
        <div style={{ flex: 1 }}>
          <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block' }}>
            Nombre <span style={{ color: '#EC6819' }}>*</span>
          </label>
          <input
            className="maqgo-input"
            placeholder="Ej: Juan"
            value={form.nombre}
            onChange={e => update('nombre', e.target.value)}
            style={{ marginBottom: 12 }}
            name="given-name"
            autoComplete="given-name"
          />
          <label style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block' }}>
            Apellido <span style={{ color: '#EC6819' }}>*</span>
          </label>
          <input
            className="maqgo-input"
            placeholder="Ej: Pérez"
            value={form.apellido}
            onChange={e => update('apellido', e.target.value)}
            style={{ marginBottom: 12 }}
            name="family-name"
            autoComplete="family-name"
          />
          <input
            className="maqgo-input"
            placeholder="Correo electrónico"
            type="email"
            value={form.email}
            onChange={e => update('email', e.target.value)}
            name="email"
            autoComplete="email"
          />
          {errors.email ? <p style={{ color: '#f44336', fontSize: 12, marginTop: -8, marginBottom: 8 }}>{errors.email}</p> : null}
          
          <div className="maqgo-phone-row">
            <span className="maqgo-phone-prefix">+56</span>
            <input
              className="maqgo-phone-input"
              placeholder="9 1234 5678"
              type="tel"
              value={form.celular}
              onChange={e => update('celular', e.target.value.replace(/\D/g, '').slice(0, 9))}
              name="tel-national"
              autoComplete="tel-national"
            />
          </div>
          {errors.celular ? <p style={{ color: '#f44336', fontSize: 12, marginTop: -8, marginBottom: 8 }}>{errors.celular}</p> : null}

          <label
            htmlFor="provider-register-password"
            style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 6, display: 'block' }}
          >
            Contraseña <span style={{ color: '#EC6819' }}>*</span>
          </label>
          <PasswordField
            id="provider-register-password"
            name="new-password"
            placeholder={passwordHint}
            value={form.password}
            onChange={e => update('password', e.target.value)}
            style={{ marginBottom: errors.password ? 4 : 6 }}
            error={Boolean(errors.password)}
            autoComplete="new-password"
            minLength={PASSWORD_RULES.minLength}
            maxLength={PASSWORD_RULES.maxLength}
          />
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 0, marginBottom: errors.password ? 8 : 12 }}>
            {passwordHint}
          </p>
          {errors.password ? <p style={{ color: '#f44336', fontSize: 12, marginTop: -8, marginBottom: 8 }}>{errors.password}</p> : null}

          {/* Checkbox */}
          <div className="maqgo-checkbox-row">
            <div 
              className={`maqgo-checkbox ${accepted ? 'checked' : ''}`}
              onClick={() => setAccepted(!accepted)}
            >
              {accepted && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6L4.5 8.5L10 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span className="maqgo-checkbox-label">
              Acepto los <span style={{textDecoration: 'underline'}}>Términos y condiciones</span><br/>
              y la <span style={{textDecoration: 'underline'}}>Política de privacidad</span>
            </span>
          </div>
        </div>

        {/* Botón */}
        <button 
          className="maqgo-btn-primary"
          onClick={handleSubmit}
          disabled={!isValid || loading}
          style={{ opacity: isValid ? 1 : 0.5 }}
          aria-label={loading ? 'Registrando proveedor' : 'Continuar con el registro'}
        >
          {loading ? 'Registrando...' : 'Continuar'}
        </button>
      </div>
    </div>
  );
}

export default ProviderRegisterScreen;
