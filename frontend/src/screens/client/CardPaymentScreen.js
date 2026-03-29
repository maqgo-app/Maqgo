import React, { useState, useEffect, useRef } from 'react';
import { getObject } from '../../utils/safeStorage';
import { validateEmail } from '../../utils/chileanValidation';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { getBookingBackRoute } from '../../utils/bookingFlow';
import { saveBookingProgress } from '../../utils/abandonmentTracker';
import BookingProgress from '../../components/BookingProgress';

import BACKEND_URL from '../../utils/api';
import { getOrCreateBookingId, idempotencyKey } from '../../utils/bookingPaymentKeys';
import { getHttpErrorMessage } from '../../utils/httpErrors';
import {
  persistClientEmailToStorage,
  ensureBackendSessionForClientBooking,
} from '../../utils/clientSessionForPayment';
import { getBookingAddressShortP6, getBookingLocationLineOrEmpty } from '../../utils/mapPlaceToAddress';
import { PAYMENT_COPY } from '../../constants/bookingPaymentCopy';
import { useCheckoutState } from '../../context/CheckoutContext';
import { touchCheckoutStateForExhaustiveUi } from '../../domain/checkout/checkoutStateMachine';

const ONECLICK_ERROR_MESSAGES = {
  token_faltante: 'Transbank no redirigió correctamente. Intenta de nuevo.',
  sin_tbk_user: 'No se pudo completar el registro de la tarjeta.',
  transbank_error: 'Error al conectar con Transbank. Revisa tu conexión e intenta de nuevo.',
  timeout: 'Transbank tardó demasiado en responder. Intenta de nuevo; si usas ngrok, verifica que el túnel esté activo.',
};

/**
 * STABLE FLOW - DO NOT MODIFY WITHOUT PRODUCT APPROVAL
 *
 * Pantalla C12 - Registro de tarjeta con Transbank Oneclick
 * El cobro se realiza SOLO después de que el proveedor acepta
 */
function CardPaymentScreen() {
  const navigate = useNavigate();
  /** Solo navegación (volver); el estado transaccional vive en CheckoutContext + respuestas del backend. */
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const backRoute = getBookingBackRoute(pathname);
  const [loading, setLoading] = useState(false);
  const [billingData, setBillingData] = useState({});
  const [email, setEmail] = useState('');
  /** null | 'card_error' (TBK / inscripción) | 'session_error' (POST /api/users u otra API previa a TBK) */
  const [error, setError] = useState(null);
  /** Mensaje legible del backend o red (sin stack); no usar para códigos TBK en query. */
  const [apiErrorDetail, setApiErrorDetail] = useState(null);
  const [emailError, setEmailError] = useState(''); // Error de validación de email
  const [needsInvoice, setNeedsInvoice] = useState(false);

  // Mostrar error si Transbank redirigió con oneclick_error
  const [oneclickErrorCode, setOneclickErrorCode] = useState(null);
  const runtimeEnv = String(import.meta.env.VITE_MAQGO_ENV || '').trim().toLowerCase();
  const isProdBuild = import.meta.env.VITE_IS_PRODUCTION === 'true';
  const allowDemoByEnv = runtimeEnv === 'development' || runtimeEnv === 'integration';
  const allowDemoByFlag = import.meta.env.VITE_ENABLE_DEMO_MODE === 'true';
  // Seguridad de flujo: en producción jamás exponer bypass demo.
  const oneclickDemoEnabled = !isProdBuild && allowDemoByEnv && allowDemoByFlag;

  const enrollmentFailureDispatched = useRef(false);
  /** Evita doble submit / doble POST a /start mientras la petición está en curso. */
  const submitInFlightRef = useRef(false);
  const { state: checkoutState, dispatch: dispatchCheckout } = useCheckoutState();

  useEffect(() => {
    touchCheckoutStateForExhaustiveUi(checkoutState);
  }, [checkoutState]);

  useEffect(() => {
    const code = searchParams.get('oneclick_error');
    if (code) {
      if (!enrollmentFailureDispatched.current) {
        enrollmentFailureDispatched.current = true;
        dispatchCheckout({ type: 'PAYMENT_AUTH_FAILED' });
      }
      setOneclickErrorCode(code);
      setApiErrorDetail(null);
      setError('card_error');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, dispatchCheckout]);

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
    getOrCreateBookingId();
    const machinery = localStorage.getItem('selectedMachinery') || '';
    const location = getBookingLocationLineOrEmpty();
    saveBookingProgress('payment', { machinery, location });
  }, []);

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
    if (submitInFlightRef.current || loading) {
      return;
    }
    submitInFlightRef.current = true;

    setLoading(true);
    setError(null);
    setApiErrorDetail(null);
    setEmailError('');

    persistClientEmailToStorage(email);

    try {
      await ensureBackendSessionForClientBooking(email);
    } catch (sessionErr) {
      console.error('Error sesión cliente (antes de OneClick):', sessionErr);
      if (!enrollmentFailureDispatched.current) {
        enrollmentFailureDispatched.current = true;
        dispatchCheckout({ type: 'PAYMENT_AUTH_FAILED' });
      }
      setError('session_error');
      setApiErrorDetail(
        getHttpErrorMessage(sessionErr, {
          fallback: 'No pudimos validar tu cuenta. Revisa tu conexión e intenta de nuevo.',
        })
      );
      submitInFlightRef.current = false;
      setLoading(false);
      return;
    }

    try {
      const returnUrl = `${BACKEND_URL}/api/payments/oneclick/confirm-return`;
      const username = email.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60) || `user_${Date.now()}`;
      
      const bookingId = getOrCreateBookingId();
      const { data } = await axios.post(
        `${BACKEND_URL}/api/payments/oneclick/start`,
        {
          username,
          email,
          return_url: returnUrl,
          booking_id: bookingId,
        },
        {
          timeout: 10000,
          headers: { 'Idempotency-Key': idempotencyKey('oneclick-start') },
        }
      );
      
      // Modo demo: salta Transbank y va directo a completar (para dev en localhost)
      if (data?.demo_mode && data?.tbk_user) {
        window.location.href = `${window.location.origin}/oneclick/complete?tbk_user=${encodeURIComponent(data.tbk_user)}`;
        return;
      }
      if (import.meta.env.DEV && data?.demo_mode && !data?.tbk_user) {
        console.warn(
          '[Maqgo][dev] Intento de avance OneClick con demo_mode pero sin tbk_user; revisar respuesta del backend.'
        );
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
      if (!enrollmentFailureDispatched.current) {
        enrollmentFailureDispatched.current = true;
        dispatchCheckout({ type: 'PAYMENT_AUTH_FAILED' });
      }
      setError('card_error');
      setApiErrorDetail(
        getHttpErrorMessage(err, {
          fallback: 'No se pudo iniciar el registro de tarjeta. Intenta de nuevo.',
        })
      );
      submitInFlightRef.current = false;
      setLoading(false);
    }
  };

  const isEmpresa = billingData.billingType === 'empresa';
  const serviceAddressLineP6 = getBookingAddressShortP6();

  // Estado: Error de sesión/API (antes de TBK) o error al registrar tarjeta / retorno TBK
  if (error === 'session_error' || error === 'card_error') {
    const isSession = error === 'session_error';
    const tbkMsg = oneclickErrorCode ? ONECLICK_ERROR_MESSAGES[oneclickErrorCode] : null;
    const detailLine = isSession ? apiErrorDetail : tbkMsg || apiErrorDetail;
    return (
      <div className="maqgo-app maqgo-client-funnel" data-checkout-state={checkoutState}>
        <div className="maqgo-screen">
          <div style={{
            background: '#2A2A2A',
            borderRadius: 14,
            border: '1px solid rgba(239,68,68,0.35)',
            padding: 20,
            marginTop: 24
          }}>
            <h2 style={{ color: '#fff', fontSize: 20, margin: '0 0 10px', textAlign: 'center' }}>
              {isSession ? 'No pudimos validar tu sesión' : 'No se pudo registrar tu tarjeta'}
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.88)', fontSize: 14, margin: '0 0 16px', textAlign: 'center', lineHeight: 1.5 }}>
              {isSession
                ? 'Tu cuenta debe estar activa antes de ir a Transbank. Revisa tu conexión o vuelve a iniciar sesión.'
                : PAYMENT_COPY.P6_VERIFY.cardErrorNoCharge}
            </p>
            {detailLine && (
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, margin: '0 0 14px', textAlign: 'center' }}>
                {detailLine}
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setApiErrorDetail(null);
                setOneclickErrorCode(null);
                enrollmentFailureDispatched.current = false;
              }}
              className="maqgo-btn-primary"
              style={{ width: '100%' }}
            >
              Intentar nuevamente
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="maqgo-app maqgo-client-funnel" data-checkout-state={checkoutState}>
      <div className="maqgo-screen maqgo-screen--scroll" style={{ padding: 'var(--maqgo-screen-padding-top) 20px 20px' }}>
        <BookingProgress />
        {serviceAddressLineP6 ? (
          <p
            style={{
              color: 'rgba(255,255,255,0.85)',
              fontSize: 13,
              textAlign: 'center',
              margin: '0 0 16px',
              lineHeight: 1.45
            }}
          >
            Servicio en: {serviceAddressLineP6}
          </p>
        ) : null}
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          marginBottom: 16
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
          <div style={{ flex: 1, textAlign: 'center' }}>
            <span style={{ 
              color: '#fff', 
              fontSize: 18, 
              fontWeight: 600,
              fontFamily: "'Space Grotesk', sans-serif"
            }}>
              {PAYMENT_COPY.P6_VERIFY.screenTitle}
            </span>
          </div>
          <div style={{ width: 24 }}></div>
        </div>

        {/* Mensaje principal (un solo bloque) */}
        <div style={{
          background: 'rgba(76, 175, 80, 0.1)',
          borderRadius: 10,
          padding: 14,
          marginBottom: 14
        }}>
          <p style={{
            color: 'rgba(255,255,255,0.95)',
            fontSize: 13,
            margin: 0,
            textAlign: 'center',
            lineHeight: 1.55,
            whiteSpace: 'pre-line'
          }}>
            {PAYMENT_COPY.P6_VERIFY.title}
            {'\n\n'}
            {PAYMENT_COPY.P6_VERIFY.subtitle}
          </p>
        </div>

        <p style={{
          color: 'rgba(255,255,255,0.88)',
          fontSize: 13,
          margin: '0 0 20px',
          textAlign: 'center',
          lineHeight: 1.45
        }}>
          {PAYMENT_COPY.P6_VERIFY.transbankRedirect}
        </p>

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
                <p><strong>Dirección tributaria:</strong> {billingData.direccion}</p>
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

        {/* Campo Email para confirmación */}
        <div style={{
          background: '#2A2A2A',
          borderRadius: 12,
          padding: 16,
          marginBottom: 20
        }}>
          <label htmlFor="card-email" style={{ 
            color: 'rgba(255,255,255,0.8)', 
            fontSize: 14, 
            display: 'block',
            marginBottom: 10,
            fontWeight: 500
          }}>
            Correo para confirmación <span style={{ color: '#EC6819' }}>*</span>
          </label>
          <input
            id="card-email"
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
              Te avisaremos cuando un proveedor acepte tu solicitud.
            </p>
          )}
        </div>

        {/* Espacio flexible */}
        <div style={{ flex: 1 }}></div>

        {/* Botón Continuar con Transbank */}
        <button 
          className="maqgo-btn-primary"
          onClick={handleSubmit}
          disabled={loading || !email || !!emailError}
          style={{ 
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            opacity: loading || !email || emailError ? 0.5 : 1,
            cursor: loading || !email || emailError ? 'not-allowed' : 'pointer'
          }}
          data-testid="pay-btn"
          aria-label={loading ? PAYMENT_COPY.P6_VERIFY.ctaContinueLoading : PAYMENT_COPY.P6_VERIFY.ctaContinue}
        >
          {loading ? (
            PAYMENT_COPY.P6_VERIFY.ctaContinueLoading
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="#fff" strokeWidth="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4" stroke="#fff" strokeWidth="2"/>
              </svg>
              {PAYMENT_COPY.P6_VERIFY.ctaContinue}
            </>
          )}
        </button>

        {/* Continuar sin tarjeta: solo desarrollo explícito bajo flag interno (jamás producción). */}
        {oneclickDemoEnabled && (
          <button
            type="button"
            onClick={() => {
              const demoEmail = (email || '').trim();
              const emailValidationErr = demoEmail ? validateEmail(demoEmail) : '';
              if (emailValidationErr) {
                setEmailError(emailValidationErr);
                return;
              }
              const toStore = demoEmail || 'demo@maqgo.cl';
              persistClientEmailToStorage(toStore);
              localStorage.setItem('oneclickDemoMode', 'true');
              const demoTbk = `demo-${Date.now()}`;
              window.location.href = `${window.location.origin}/oneclick/complete?tbk_user=${encodeURIComponent(demoTbk)}`;
            }}
            style={{
              marginTop: 16,
              padding: '14px 24px',
              background: 'transparent',
              border: '2px solid rgba(144, 189, 211, 0.6)',
              borderRadius: 12,
              color: '#90BDD3',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
          >
            Continuar sin tarjeta (solo desarrollo)
          </button>
        )}
      </div>
    </div>
  );
}

export default CardPaymentScreen;
