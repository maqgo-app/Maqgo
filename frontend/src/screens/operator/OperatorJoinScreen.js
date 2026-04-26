import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import { playAcceptedSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';

import BACKEND_URL from '../../utils/api';

const MAX_AVATAR_PX = 720;
const JPEG_QUALITY = 0.82;

function compressAvatar(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const scale = Math.min(1, MAX_AVATAR_PX / Math.max(w, h));
      const cw = Math.round(w * scale);
      const ch = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, cw, ch);
      try {
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Error al cargar la imagen'));
    img.src = dataUrl;
  });
}

/**
 * Pantalla: Gerente Invitado (Onboarding con código de invitación)
 *
 * Flujo:
 * 1. Código de invitación → POST /api/operators/masters/join
 * 2. Confirmación de activación
 * 3. Continuar al flujo OTP (login como proveedor)
 */
function OperatorJoinScreen() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [code, setCode] = useState('');
  const [step, setStep] = useState('code'); // 'code' | 'activated' | 'photo' | 'success'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [photoPreview, setPhotoPreview] = useState(null);

  // Activar código de gerente invitado → POST /api/operators/masters/join
  const handleJoinWithCode = async () => {
    if (loading) return;
    if (code.length < 4) {
      setError('Ingresa el código completo');
      setStatusMessage('');
      return;
    }
    
    setLoading(true);
    setError('');
    setStatusMessage('Verificando código...');

    try {
      const response = await axios.post(`${BACKEND_URL}/api/operators/masters/join`, {
        code: code.toUpperCase()
      });

      if (response.data.success || response.status === 200) {
        setOwnerName(response.data.owner_name || response.data.company_name || '');
        setStep('activated');
        setStatusMessage('');
      }
    } catch (err) {
      console.error('Error activating invite code:', err);
      let msg = 'No pudimos validar el código. Verifica y vuelve a intentar.';
      if (err.response?.data?.detail) {
        const d = String(Array.isArray(err.response.data.detail) ? (err.response.data.detail[0]?.msg || '') : err.response.data.detail || '').toLowerCase();
        const hasInvalid = d.includes('inválido') || d.includes('invalido');
        const hasUsed = d.includes('ya utilizado') || d.includes('usado');
        if (hasInvalid && hasUsed) {
          msg = 'Código inválido o ya utilizado. Solicita un nuevo código de invitación.';
        } else if (hasInvalid) {
          msg = 'Código inválido. Revisa el código y vuelve a intentar.';
        } else if (hasUsed) {
          msg = 'Este código ya fue usado. Solicita uno nuevo a quien te invitó.';
        } else if (d.includes('expirado')) {
          msg = 'Este código venció. Solicita un nuevo código de invitación.';
        } else {
          msg = 'No pudimos activar el código. Verifica e intenta nuevamente.';
        }
      } else if (err.code === 'ECONNREFUSED' || err.message?.includes('Network Error')) {
        msg = 'No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.';
      }
      setError(msg);
      setStatusMessage('');
    }
    
    setLoading(false);
  };

  // Continuar al flujo OTP como proveedor tras activar código
  const handleContinueToOtp = () => {
    try {
      localStorage.setItem('desiredRole', 'provider');
    } catch {
      /* ignore */
    }
    navigate('/login', { state: { entry: 'provider' } });
  };

  const handlePhotoFile = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setError('');
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const compressed = await compressAvatar(ev.target.result);
        setPhotoPreview(compressed);
      } catch {
        setPhotoPreview(ev.target.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const goToWelcomeSuccess = () => {
    unlockAudio();
    playAcceptedSound();
    vibrate('accepted');
    setStep('success');
  };

  const finishPhotoStep = () => {
    try {
      if (photoPreview) {
        localStorage.setItem('operatorPhoto', photoPreview);
      } else {
        localStorage.removeItem('operatorPhoto');
      }
    } catch {
      /* ignore */
    }
    goToWelcomeSuccess();
  };

  const goToHome = () => {
    navigate('/operator/home');
  };

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div className="maqgo-screen" style={{ justifyContent: 'flex-start', padding: 'var(--maqgo-screen-padding-top) 24px 24px' }}>
        <MaqgoLogo size="small" style={{ marginBottom: 30 }} />

        {step === 'code' && (
          <>
            <h1 style={{ 
              color: '#fff', 
              fontSize: 24, 
              fontWeight: 700, 
              textAlign: 'center',
              margin: '0 0 10px',
              fontFamily: "'Space Grotesk', sans-serif"
            }}>
              Me invitaron como gerente
            </h1>
            <p style={{ 
              color: 'rgba(255,255,255,0.9)', 
              fontSize: 14, 
              textAlign: 'center',
              margin: '0 0 30px',
              lineHeight: 1.5
            }}>
              Ingresa el código de invitación que recibiste. Lo activaremos y luego te enviaremos un SMS para entrar.
            </p>

            {/* Input de código */}
            <div style={{ marginBottom: 20 }}>
              <input
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase().slice(0, 6));
                  if (error) setError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && code.length >= 4 && !loading) {
                    handleJoinWithCode();
                  }
                }}
                placeholder="CÓDIGO"
                maxLength={6}
                style={{
                  width: '100%',
                  padding: '18px 20px',
                  fontSize: 24,
                  fontWeight: 700,
                  fontFamily: "'JetBrains Mono', monospace",
                  textAlign: 'center',
                  letterSpacing: 8,
                  background: '#2A2A2A',
                  border: error ? '2px solid #ff6b6b' : '2px solid #444',
                  borderRadius: 12,
                  color: '#fff',
                  outline: 'none'
                }}
                data-testid="invite-code-input"
              />
            </div>

            {!!statusMessage && !error && (
              <p style={{ color: '#90BDD3', fontSize: 13, textAlign: 'center', marginBottom: 15 }}>
                {statusMessage}
              </p>
            )}

            {error && (
              <p style={{ color: '#ff6b6b', fontSize: 13, textAlign: 'center', marginBottom: 15 }}>
                {error}
              </p>
            )}

            <button
              className="maqgo-btn-primary"
              onClick={handleJoinWithCode}
              disabled={loading || code.length < 4}
              style={{ opacity: code.length < 4 ? 0.5 : 1 }}
              data-testid="validate-code-btn"
            >
              {loading ? 'Activando...' : 'Activar código y continuar'}
            </button>

            <div style={{ marginTop: 30, textAlign: 'center' }}>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>
                ¿No tienes código? Pídelo a quien te invitó como gerente
              </p>
            </div>
          </>
        )}

        {step === 'activated' && (
          <div style={{ textAlign: 'center', paddingTop: 20 }}>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #EC6819 0%, #D45A10 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px',
              }}
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                <path d="M9 12L11 14L15 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <h1 style={{
              color: '#fff',
              fontSize: 24,
              fontWeight: 700,
              margin: '0 0 12px',
              fontFamily: "'Space Grotesk', sans-serif",
            }}>
              ¡Código activado!
            </h1>

            {ownerName ? (
              <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, margin: '0 0 8px', lineHeight: 1.5 }}>
                Quedaste vinculado a <strong style={{ color: '#EC6819' }}>{ownerName}</strong> como gerente.
              </p>
            ) : (
              <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, margin: '0 0 8px', lineHeight: 1.5 }}>
                Tu código de gerente fue activado correctamente.
              </p>
            )}

            <p style={{
              color: 'rgba(255,255,255,0.65)',
              fontSize: 13,
              margin: '0 0 32px',
              lineHeight: 1.5,
              padding: '12px 16px',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
              Ahora te enviaremos un SMS para verificar tu identidad y entrar a la plataforma.
            </p>

            <button
              className="maqgo-btn-primary"
              onClick={handleContinueToOtp}
              data-testid="continue-to-otp-btn"
            >
              Continuar al SMS
            </button>
          </div>
        )}

        {step === 'photo' && (
          <>
            <h1
              style={{
                color: '#fff',
                fontSize: 24,
                fontWeight: 700,
                textAlign: 'center',
                margin: '0 0 10px',
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              Tu foto de perfil
            </h1>
            <p
              style={{
                color: 'rgba(255,255,255,0.9)',
                fontSize: 14,
                textAlign: 'center',
                margin: '0 0 24px',
                lineHeight: 1.5,
              }}
            >
              Opcional. Los clientes te identifican mejor cuando aceptas un trabajo.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={handlePhotoFile}
              style={{ display: 'none' }}
              aria-label="Elegir foto de perfil"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: 120,
                height: 120,
                borderRadius: '50%',
                margin: '0 auto 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px dashed rgba(255,255,255,0.35)',
                background: photoPreview ? 'transparent' : 'rgba(255,255,255,0.06)',
                cursor: 'pointer',
                overflow: 'hidden',
                padding: 0,
              }}
            >
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', padding: 8 }}>
                  Toca para
                  <br />
                  subir foto
                </span>
              )}
            </button>

            <button type="button" className="maqgo-btn-primary" onClick={finishPhotoStep} data-testid="operator-photo-continue">
              {photoPreview ? 'Continuar' : 'Continuar sin foto'}
            </button>
          </>
        )}

        {step === 'success' && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            {photoPreview ? (
              <div
                style={{
                  position: 'relative',
                  width: 100,
                  height: 100,
                  margin: '0 auto 25px',
                  animation: 'scaleIn 0.5s ease',
                }}
              >
                <img
                  src={photoPreview}
                  alt=""
                  style={{
                    width: 100,
                    height: 100,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '3px solid rgba(144, 189, 211, 0.75)',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    right: -2,
                    bottom: -2,
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #90BDD3 0%, #0097A7 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid #1a1a1a',
                  }}
                  aria-hidden
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M9 12L11 14L15 10"
                      stroke="#fff"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
            ) : (
              <div
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #90BDD3 0%, #0097A7 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 25px',
                  animation: 'scaleIn 0.5s ease',
                }}
              >
                <svg width="50" height="50" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M9 12L11 14L15 10"
                    stroke="#fff"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
            <style>{`
              @keyframes scaleIn {
                0% { transform: scale(0); opacity: 0; }
                50% { transform: scale(1.1); }
                100% { transform: scale(1); opacity: 1; }
              }
            `}</style>

            <h1 style={{ 
              color: '#fff', 
              fontSize: 26, 
              fontWeight: 700, 
              margin: '0 0 10px',
              fontFamily: "'Space Grotesk', sans-serif"
            }}>
              ¡Bienvenido!
            </h1>
            
            <p style={{ 
              color: 'rgba(255,255,255,0.95)', 
              fontSize: 15, 
              margin: '0 0 8px',
              lineHeight: 1.5
            }}>
              Ya estás vinculado a
            </p>
            
            <p style={{ 
              color: '#EC6819', 
              fontSize: 20, 
              fontWeight: 700,
              margin: '0 0 12px'
            }}>
              {ownerName}
            </p>

            <p style={{ 
              color: 'rgba(255,255,255,0.95)', 
              fontSize: 13, 
              margin: '0 0 25px'
            }}>
              y listo para recibir servicios
            </p>

            <div style={{
              background: '#2A2A2A',
              borderRadius: 12,
              padding: 16,
              marginBottom: 25,
              textAlign: 'left'
            }}>
              <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, margin: '0 0 10px', textTransform: 'uppercase' }}>
                Próximos pasos
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ 
                  width: 24, height: 24, borderRadius: '50%', 
                  background: '#90BDD3', color: '#fff', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700
                }}>1</div>
                <span style={{ color: '#fff', fontSize: 14 }}>Activa tu disponibilidad</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ 
                  width: 24, height: 24, borderRadius: '50%', 
                  background: '#363636', color: 'rgba(255,255,255,0.95)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700
                }}>2</div>
                <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>Espera solicitudes de trabajo</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ 
                  width: 24, height: 24, borderRadius: '50%', 
                  background: '#363636', color: 'rgba(255,255,255,0.95)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700
                }}>3</div>
                <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>Acepta y comienza a trabajar</span>
              </div>
            </div>

            <button
              className="maqgo-btn-primary"
              onClick={goToHome}
              data-testid="go-to-home-btn"
            >
              ¡Empezar!
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default OperatorJoinScreen;
