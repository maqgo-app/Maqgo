import React, { useState, useEffect } from 'react';
import { getObject } from '../../utils/safeStorage';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { getBookingBackRoute } from '../../utils/bookingFlow';
import { saveBookingProgress } from '../../utils/abandonmentTracker';
import { CardRegistrationError, LegalChargeNotice } from '../../components/ErrorStates';
import BookingProgress from '../../components/BookingProgress';

import BACKEND_URL from '../../utils/api';

const ONECLICK_ERROR_MESSAGES = {
  token_faltante: 'Transbank no redirigió correctamente. Intenta de nuevo.',
  sin_tbk_user: 'No se pudo completar el registro de la tarjeta.',
  transbank_error: 'Error al conectar con Transbank. Revisa tu conexión e intenta de nuevo.',
  timeout: 'Transbank tardó demasiado en responder. Intenta de nuevo; si usas ngrok, verifica que el túnel esté activo.',
};

/**
 * Pantalla C12 - Registro de tarjeta con Transbank Oneclick
 * El cobro se realiza SOLO después de que el proveedor acepta
 */
function CardPaymentScreen() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const backRoute = getBookingBackRoute(pathname);
  const [loading, setLoading] = useState(false);
  const [billingData, setBillingData] = useState({});
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null); // null, 'card_error'
  const [emailError, setEmailError] = useState(''); // Error de validación de email
  const [needsInvoice, setNeedsInvoice] = useState(false);

  // Mostrar error si Transbank redirigió con oneclick_error
  const [oneclickErrorCode, setOneclickErrorCode] = useState(null);
  useEffect(() => {
    const code = searchParams.get('oneclick_error');
    if (code) {
      setOneclickErrorCode(code);
      setError('card_error');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const data = getObject('registerData', {});
    const billing = getObject('billingData', {});
    const invoiceNeeded = localStorage.getItem('needsInvoice') === 'true';
    const savedEmail = localStorage.getItem('clientEmail');
    // Priorizar billingData cuando existe y tiene billingType (evita mostrar datos de persona cuando se eligió empresa)
    const merged = billing?.billingType ? { ...billing } : { ...data, ...billing };
    setBillingData(merged);
    setEmail(data.email || savedEmail || '');
    setNeedsInvoice(invoiceNeeded);
  }, []);

  useEffect(() => {
    const machinery = localStorage.getItem('selectedMachinery') || '';
    const location = localStorage.getItem('serviceLocation') || '';
    saveBookingProgress('payment', { machinery, location });
  }, []);

  const validateEmail = (emailValue) => {
    if (!emailValue) {
      return 'El correo es requerido';
    }
    if (!emailValue.includes('@') || !emailValue.includes('.')) {
      return 'Por favor ingresa un correo válido';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailValue)) {
      return 'Formato de correo inválido';
    }
    return '';
  };

  const handleEmailChange = (e) => {
    const value = e.target.value;
    setEmail(value);
    if (emailError) {
      setEmailError(validateEmail(value));
    }
  };

  const handleSubmit = async () => {
    const validationError = validateEmail(email);
    if (validationError) {
      setEmailError(validationError);
      return;
    }
    
    setLoading(true);
    setError(null);
    setEmailError('');
    
    // Guardar email para OneClick y flujo posterior
    localStorage.setItem('clientEmail', email);
    
    try {
      const returnUrl = `${BACKEND_URL}/api/payments/oneclick/confirm-return`;
      const username = email.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60) || `user_${Date.now()}`;
      
      const { data } = await axios.post(`${BACKEND_URL}/api/payments/oneclick/start`, {
        username,
        email,
        return_url: returnUrl
      }, { timeout: 10000 });
      
      // Modo demo: salta Transbank y va directo a completar (para dev en localhost)
      if (data?.demo_mode && data?.tbk_user) {
        window.location.href = `${window.location.origin}/oneclick/complete?tbk_user=${encodeURIComponent(data.tbk_user)}`;
        return;
      }
      
      const urlWebpay = data?.url_webpay;
      const token = data?.token;

      // Redirigir a Webpay vía POST con TBK_TOKEN (requisito de Oneclick)
      if (urlWebpay && token) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = urlWebpay;

        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'TBK_TOKEN';
        input.value = token;

        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();
        return;
      }

      throw new Error('No se recibió url_webpay o token de Transbank');
    } catch (err) {
      console.error('Error OneClick:', err);
      setError('card_error');
      setLoading(false);
    }
  };

  const isEmpresa = billingData.billingType === 'empresa';

  // Estado: Error al registrar tarjeta
  if (error === 'card_error') {
    const errorMsg = oneclickErrorCode ? ONECLICK_ERROR_MESSAGES[oneclickErrorCode] : null;
    const handleDemoContinue = () => {
      const demoTbk = `demo-${Date.now()}`;
      window.location.href = `${window.location.origin}/oneclick/complete?tbk_user=${encodeURIComponent(demoTbk)}`;
    };
    return (
      <div className="maqgo-app">
        <div className="maqgo-screen">
          <CardRegistrationError
            onRetry={() => { setError(null); setOneclickErrorCode(null); }}
            message={errorMsg}
          />
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <button
              onClick={handleDemoContinue}
              style={{
                padding: '12px 24px',
                background: 'transparent',
                border: '1px solid rgba(144, 189, 211, 0.5)',
                borderRadius: 12,
                color: '#90BDD3',
                fontSize: 13,
                cursor: 'pointer',
                width: '100%',
                maxWidth: 280
              }}
            >
              Continuar en modo demo (sin tarjeta real)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ padding: '20px' }}>
        <BookingProgress />
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          marginBottom: 16
        }}>
          <button 
            onClick={() => navigate(backRoute || -1)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            aria-label="Volver"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <span style={{ 
              color: '#fff', 
              fontSize: 18, 
              fontWeight: 600,
              fontFamily: "'Space Grotesk', sans-serif"
            }}>
              Registro de tarjeta (sin cobro)
            </span>
          </div>
          <div style={{ width: 24 }}></div>
        </div>

        {/* Texto explicativo */}
        <div style={{
          background: 'rgba(76, 175, 80, 0.1)',
          borderRadius: 10,
          padding: 12,
          marginBottom: 20
        }}>
          <p style={{
            color: 'rgba(255,255,255,0.95)',
            fontSize: 12,
            margin: 0,
            textAlign: 'center',
            lineHeight: 1.5
          }}>
            Usamos Transbank Oneclick para guardar tu tarjeta de forma segura.
            <br />
            <strong style={{ color: '#4CAF50' }}>Solo se realizará el cobro si un operador acepta tu solicitud.</strong>
          </p>
        </div>

        {/* Datos de facturación (solo si el usuario lo solicitó) */}
        {needsInvoice && (
        <div style={{
          background: '#2A2A2A',
          borderRadius: 12,
          padding: 16,
          marginBottom: 20
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8, 
            marginBottom: 12 
          }}>
            <span style={{ fontSize: 18 }}>{isEmpresa ? '🏢' : '👤'}</span>
            <span style={{ 
              color: '#fff', 
              fontSize: 14, 
              fontWeight: 600,
              fontFamily: "'Space Grotesk', sans-serif"
            }}>
              Datos de facturación
            </span>
          </div>
          
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 1.8 }}>
            {isEmpresa ? (
              <>
                <p><strong>Razón Social:</strong> {billingData.razonSocial}</p>
                <p><strong>RUT:</strong> {billingData.rut}</p>
                <p><strong>Giro:</strong> {billingData.giro}</p>
                <p><strong>Dirección:</strong> {billingData.direccion}</p>
              </>
            ) : (
              <>
                <p><strong>Nombre:</strong> {billingData.nombre} {billingData.apellido}</p>
                <p><strong>RUT:</strong> {billingData.rut}</p>
              </>
            )}
          </div>

          <button
            onClick={() => navigate('/client/billing')}
            style={{
              background: 'none',
              border: 'none',
              color: '#90BDD3',
              fontSize: 13,
              cursor: 'pointer',
              marginTop: 10,
              padding: 0
            }}
          >
            Modificar datos →
          </button>
        </div>
        )}

        {/* Nota Transbank */}
        <div style={{
          background: 'rgba(144, 189, 211, 0.1)',
          border: '1px solid rgba(144, 189, 211, 0.3)',
          borderRadius: 12,
          padding: 16,
          marginBottom: 24
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="5" width="20" height="14" rx="2" stroke="#90BDD3" strokeWidth="2"/>
              <path d="M2 10H22" stroke="#90BDD3" strokeWidth="2"/>
            </svg>
            <div>
              <p style={{ 
                color: '#fff', 
                fontSize: 14, 
                fontWeight: 600,
                margin: '0 0 4px',
                fontFamily: "'Space Grotesk', sans-serif"
              }}>
                Pago seguro con tarjeta
              </p>
              <p style={{ 
                color: 'rgba(255,255,255,0.9)', 
                fontSize: 12, 
                margin: 0 
              }}>
                Serás redirigido a Transbank Oneclick
              </p>
            </div>
          </div>
        </div>

        {/* Campo Email para confirmación */}
        <div style={{
          background: '#2A2A2A',
          borderRadius: 12,
          padding: 16,
          marginBottom: 20
        }}>
          <label style={{ 
            color: 'rgba(255,255,255,0.8)', 
            fontSize: 14, 
            display: 'block',
            marginBottom: 10,
            fontWeight: 500
          }}>
            📧 Correo para tu comprobante <span style={{ color: '#EC6819' }}>*</span>
          </label>
          <input
            className="maqgo-input"
            type="email"
            placeholder="correo@ejemplo.com"
            value={email}
            onChange={handleEmailChange}
            onBlur={() => setEmailError(validateEmail(email))}
            style={{ 
              marginBottom: 0,
              borderColor: emailError ? '#EF4444' : undefined,
              borderWidth: emailError ? '2px' : undefined
            }}
          />
          {emailError ? (
            <p style={{ 
              color: '#EF4444', 
              fontSize: 12, 
              margin: '8px 0 0',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
              <span>⚠️</span>
              {emailError}
            </p>
          ) : (
            <p style={{ 
              color: 'rgba(255,255,255,0.9)', 
              fontSize: 11, 
              margin: '8px 0 0' 
            }}>
              Usamos este correo para tu cuenta y para avisarte sobre tus reservas.
            </p>
          )}
        </div>

        {/* Espacio flexible */}
        <div style={{ flex: 1 }}></div>

        {/* Botón Registrar tarjeta */}
        <button 
          className="maqgo-btn-primary"
          onClick={handleSubmit}
          disabled={loading || !email || !!emailError}
          style={{ 
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            opacity: (!email || emailError) ? 0.5 : 1,
            cursor: (!email || emailError) ? 'not-allowed' : 'pointer'
          }}
          data-testid="pay-btn"
          aria-label={loading ? 'Registrando tarjeta' : 'Registrar tarjeta y enviar solicitud'}
        >
          {loading ? (
            'Registrando tarjeta...'
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="#fff" strokeWidth="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4" stroke="#fff" strokeWidth="2"/>
              </svg>
              Registrar tarjeta y enviar solicitud
            </>
          )}
        </button>

        {/* Texto legal */}
        <LegalChargeNotice />
      </div>
    </div>
  );
}

export default CardPaymentScreen;
