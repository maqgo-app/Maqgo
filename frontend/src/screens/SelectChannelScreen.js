import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MaqgoLogo from '../components/MaqgoLogo';
import { useToast } from '../components/Toast';
import BACKEND_URL, { fetchWithTimeout } from '../utils/api';
import { getObject } from '../utils/safeStorage';

/**
 * Pantalla de verificación - WhatsApp por defecto, SMS como backup
 */
function SelectChannelScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const registerData = getObject('registerData', {});
  const phone = registerData.celular ? `+56${registerData.celular.replace(/\D/g, '')}` : '';
  const displayPhone = registerData.celular ? `+56 9 ${registerData.celular.slice(-8, -4)} ${registerData.celular.slice(-4)}` : '';

  const handleSendCode = async (channel) => {
    if (!phone) {
      setError('No se encontró el número de celular');
      return;
    }

    setLoading(true);
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
        // Posibles errores de proxy sin cuerpo JSON.
      }
      const errorMsg = data?.detail || data?.error || `Error al enviar el código SMS (${response.status})`;

      if (response.ok && data?.success) {
        localStorage.setItem('verificationChannel', channel);
        toast.success('Código enviado a tu celular');
        navigate('/verify-sms');
      } else {
        setError(errorMsg);
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

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen">
        {/* Logo */}
        <MaqgoLogo size="medium" style={{ marginBottom: 32 }} />

        {/* Contenido */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          
          {/* Icono SMS */}
          <div style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            background: '#3B82F6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24
          }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>

          <h2 style={{
            color: '#fff',
            fontSize: 22,
            fontWeight: 600,
            lineHeight: 1.3,
            marginBottom: 12,
            textAlign: 'center',
            fontFamily: "'Space Grotesk', sans-serif"
          }}>
            Te enviaremos un código por SMS
          </h2>
          
          <p style={{
            color: '#EC6819',
            fontSize: 18,
            fontWeight: 600,
            marginBottom: 32,
            fontFamily: "'Space Grotesk', sans-serif"
          }}>
            {displayPhone}
          </p>

          {/* Botón principal SMS */}
          <button
            onClick={() => handleSendCode('sms')}
            disabled={loading}
            style={{
              width: '100%',
              padding: '16px 24px',
              background: '#EC6819',
              border: 'none',
              borderRadius: 12,
              color: '#fff',
              fontSize: 16,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              fontFamily: "'Space Grotesk', sans-serif",
              transition: 'transform 0.1s, opacity 0.2s'
            }}
            data-testid="send-sms-btn"
          >
            {loading ? (
              'Enviando código por SMS...'
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                Enviar código SMS
              </>
            )}
          </button>

          {/* Error */}
          {error && (
            <div style={{ width: '100%', marginTop: 16 }}>
              <p style={{
                color: '#EF4444',
                fontSize: 14,
                textAlign: 'center',
                marginBottom: 12,
                padding: '12px',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: 8,
                width: '100%'
              }}>
                {error}
              </p>
              <button
                onClick={() => { setError(''); }}
                style={{
                  width: '100%',
                  padding: 12,
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: 10,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                aria-label="Reintentar envío de código"
              >
                Reintentar
              </button>
            </div>
          )}
        </div>

        {/* Volver */}
        <button type="button" className="maqgo-btn-secondary" onClick={() => navigate(-1)} style={{ marginTop: 16 }} aria-label="Volver">
          ← Volver
        </button>
      </div>
    </div>
  );
}

export default SelectChannelScreen;
