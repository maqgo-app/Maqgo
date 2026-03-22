import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';

import BACKEND_URL, { fetchWithTimeout } from '../../utils/api';
import { getObject } from '../../utils/safeStorage';

/**
 * P2 - Verificación SMS Proveedor con mejores prácticas UX
 * - Timer de expiración
 * - Cooldown de reenvío
 * - Web OTP API (auto-lectura SMS en Chrome)
 * - Copy-paste auto-complete
 */
function ProviderVerifySMSScreen() {
  const navigate = useNavigate();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [expiry, setExpiry] = useState(300); // 5 minutos
  const inputRefs = useRef([]);

  const registerData = getObject('registerData', {});
  const channel = localStorage.getItem('verificationChannel') || 'sms';
  const digits = registerData.celular ? String(registerData.celular).replace(/\D/g, '').slice(-9) : '';
  const phone = digits.length >= 9 ? `+56${digits}` : '';

  // Timer de expiración
  useEffect(() => {
    if (expiry <= 0) return;
    const timer = setInterval(() => {
      setExpiry(prev => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [expiry]);

  // Timer de cooldown para reenvío
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown(prev => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Web OTP API - Auto-lectura de SMS en Chrome móvil
  useEffect(() => {
    if ('OTPCredential' in window) {
      const ac = new AbortController();
      navigator.credentials.get({
        otp: { transport: ['sms'] },
        signal: ac.signal
      }).then(otp => {
        if (otp && otp.code) {
          const digits = otp.code.replace(/\D/g, '').slice(0, 6).split('');
          if (digits.length === 6) {
            setCode(digits);
            inputRefs.current[5]?.focus();
          }
        }
      }).catch(err => {
        console.log('Web OTP not available:', err);
      });
      return () => ac.abort();
    }
  }, []);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index, value) => {
    if (value.length === 6 && /^\d{6}$/.test(value)) {
      const digits = value.split('');
      setCode(digits);
      inputRefs.current[5]?.focus();
      return;
    }
    
    if (value.length > 1) return;
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pastedData.length === 6) {
      setCode(pastedData.split(''));
      inputRefs.current[5]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const fullCode = code.join('');
    if (fullCode.length !== 6) return;
    if (!phone) {
      setError('No se encontró el número de celular. Vuelve al registro.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetchWithTimeout(`${BACKEND_URL}/api/communications/sms/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phone_number: phone,
          code: fullCode
        })
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        // Evitar error adicional si backend no retorna JSON.
      }

      if (response.ok && data?.valid) {
        localStorage.setItem('phoneVerified', 'true');
        if (data.token) {
          localStorage.setItem('token', data.token);
          if (data.userId) localStorage.setItem('userId', data.userId);
        }
        navigate('/provider/verified');
      } else {
        setError(data?.detail || data?.error || `Código inválido o expirado (${response.status})`);
        setCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    } catch (err) {
      console.error('Error:', err);
      const isNetworkError = err?.name === 'TypeError' || err?.message?.includes('Failed to fetch');
      const msg = isNetworkError
        ? 'No se pudo conectar al servidor. Intenta nuevamente.'
        : err?.name === 'AbortError'
          ? 'El servidor tardó demasiado en responder. Intenta nuevamente.'
          : 'Error de conexión. Intenta nuevamente.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    
    setResending(true);
    setError('');

    try {
      const response = await fetchWithTimeout(`${BACKEND_URL}/api/communications/sms/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phone_number: phone,
          channel: channel
        })
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        // Evitar falsos errores por parseo de respuesta.
      }

      if (response.ok && data?.success) {
        setExpiry(300);
        setCooldown(30);
        setCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      } else {
        setError(data?.detail || data?.error || `Error al reenviar el código (${response.status})`);
      }
    } catch (err) {
      const isNetworkError = err?.name === 'TypeError' || err?.message?.includes('Failed to fetch');
      const msg = isNetworkError
        ? 'No se pudo conectar al servidor. Intenta nuevamente.'
        : err?.name === 'AbortError'
          ? 'El servidor tardó demasiado en responder. Intenta nuevamente.'
          : 'Error de conexión. Intenta nuevamente.';
      setError(msg);
    } finally {
      setResending(false);
    }
  };

  const isComplete = code.every(d => d !== '');
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen">
        {/* Logo */}
        <div style={{ marginBottom: 24 }}>
          <MaqgoLogo size="small" />
        </div>

        {/* Contenido */}
        <div style={{ flex: 1 }}>
          <h2 style={{
            color: '#fff',
            fontSize: 22,
            fontWeight: 600,
            lineHeight: 1.3,
            marginBottom: 10,
            fontFamily: "'Space Grotesk', sans-serif"
          }}>
            💬 Ingresa el código
          </h2>
          
          <p style={{
            color: 'rgba(255,255,255,0.55)',
            fontSize: 14,
            lineHeight: 1.5,
            marginBottom: 6,
            fontFamily: "'Inter', sans-serif"
          }}>
            Ingresa el código de 6 dígitos que enviamos a tu celular.
          </p>

          {/* Timer de expiración */}
          <p style={{
            color: expiry < 60 ? '#EF4444' : '#EC6819',
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 24,
            fontFamily: "'Space Grotesk', sans-serif"
          }}>
            {expiry > 0 ? `Código expira en ${formatTime(expiry)}` : '⚠️ Código expirado'}
          </p>
          
          {/* Inputs de código */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
            {code.map((digit, i) => (
              <input
                key={i}
                ref={el => inputRefs.current[i] = el}
                style={{
                  width: 45,
                  height: 55,
                  background: 'transparent',
                  border: `2px solid ${digit ? '#EC6819' : 'rgba(255,255,255,0.3)'}`,
                  borderRadius: 10,
                  textAlign: 'center',
                  fontSize: 24,
                  fontWeight: 600,
                  color: '#fff',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={digit}
                onChange={e => handleChange(i, e.target.value.replace(/[^0-9]/g, ''))}
                onKeyDown={e => handleKeyDown(i, e)}
                onPaste={handlePaste}
                onFocus={e => e.target.style.borderColor = '#EC6819'}
                onBlur={e => e.target.style.borderColor = digit ? '#EC6819' : 'rgba(255,255,255,0.3)'}
                data-testid={`provider-otp-input-${i}`}
              />
            ))}
          </div>

          {/* Error */}
          {error && (
            <p style={{
              color: '#EF4444',
              fontSize: 14,
              textAlign: 'center',
              marginBottom: 16,
              padding: '10px',
              background: 'rgba(239, 68, 68, 0.1)',
              borderRadius: 8
            }}>
              {error}
            </p>
          )}

          {/* Reenviar con cooldown */}
          <p style={{
            color: 'rgba(255,255,255,0.55)',
            fontSize: 14,
            lineHeight: 1.5,
            textAlign: 'center',
            fontFamily: "'Inter', sans-serif"
          }}>
            ¿No recibiste el código?{' '}
            {cooldown > 0 ? (
              <span style={{ color: 'rgba(255,255,255,0.9)' }}>
                Reenviar en {cooldown}s
              </span>
            ) : (
              <span 
                onClick={!resending ? handleResend : undefined}
                style={{ 
                  color: '#90BDD3', 
                  cursor: resending ? 'not-allowed' : 'pointer',
                  textDecoration: 'underline'
                }}
              >
                {resending ? 'Reenviando...' : 'Reenviar código'}
              </span>
            )}
          </p>
        </div>

        {/* Botón */}
        <button 
          className="maqgo-btn-primary"
          onClick={handleVerify}
          disabled={!isComplete || loading || expiry <= 0}
          aria-busy={loading}
          aria-label={loading ? 'Verificando código' : 'Verificar y continuar'}
          style={{ opacity: isComplete && !loading && expiry > 0 ? 1 : 0.5 }}
          data-testid="provider-verify-btn"
        >
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'maqgo-spin 0.8s linear infinite' }} />
              Verificando...
            </span>
          ) : (
            'Verificar y continuar'
          )}
        </button>
      </div>
    </div>
  );
}

export default ProviderVerifySMSScreen;
