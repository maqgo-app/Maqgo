import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import { playAcceptedSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';

import BACKEND_URL from '../../utils/api';

/**
 * Pantalla: Onboarding de Operador
 * 
 * Flujo simple:
 * 1. Operador recibe código del dueño (por SMS/WhatsApp)
 * 2. Abre app → Ingresa código → Queda vinculado
 * 3. Listo para trabajar
 */
function OperatorJoinScreen() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [step, setStep] = useState('code'); // 'code' | 'success'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [photo] = useState(null); // Foto opcional, no usada en MVP

  // Validar código y unirse directamente (flujo simple: solo código)
  const handleJoinWithCode = async () => {
    if (code.length < 4) {
      setError('Ingresa el código completo');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      const response = await axios.post(`${BACKEND_URL}/api/operators/join`, {
        code: code.toUpperCase()
      });

      if (response.data.success) {
        // Guardar datos del operador
        localStorage.setItem('userId', response.data.operator_id);
        localStorage.setItem('userRole', 'provider');
        localStorage.setItem('providerRole', 'operator');
        localStorage.setItem('ownerId', response.data.owner_id);
        if (response.data.token) localStorage.setItem('token', response.data.token);
        localStorage.setItem('operatorName', 'Operador');
        if (photo) localStorage.setItem('operatorPhoto', photo);
        
        setOwnerName(response.data.owner_name);
        setStep('success');
        
        // Sonido de éxito
        unlockAudio();
        playAcceptedSound();
        vibrate('accepted');
      }
    } catch (err) {
      console.error('Error joining:', err);
      let msg = 'Código inválido o expirado';
      if (err.response?.data?.detail) {
        const d = err.response.data.detail;
        msg = Array.isArray(d) ? (d[0]?.msg || msg) : d;
      } else if (err.code === 'ECONNREFUSED' || err.message?.includes('Network Error')) {
        msg = 'No se pudo conectar al servidor. Verifica que el backend esté corriendo.';
      }
      setError(msg);
    }
    
    setLoading(false);
  };

  // Ir al home del operador
  const goToHome = () => {
    navigate('/operator/home');
  };

  return (
    <div className="maqgo-app">
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
              Únete como Operador
            </h1>
            <p style={{ 
              color: 'rgba(255,255,255,0.9)', 
              fontSize: 14, 
              textAlign: 'center',
              margin: '0 0 30px',
              lineHeight: 1.5
            }}>
              Ingresa el código que te compartió tu empresa
            </p>

            {/* Input de código */}
            <div style={{ marginBottom: 20 }}>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
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
              {loading ? 'Verificando...' : 'Continuar'}
            </button>

            <div style={{ marginTop: 30, textAlign: 'center' }}>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>
                ¿No tienes código? Pídelo al dueño de la empresa
              </p>
            </div>
          </>
        )}

        {step === 'success' && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            {/* Checkmark animado - CELESTE en vez de verde */}
            <div style={{
              width: 100,
              height: 100,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #90BDD3 0%, #0097A7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 25px',
              animation: 'scaleIn 0.5s ease'
            }}>
              <svg width="50" height="50" viewBox="0 0 24 24" fill="none">
                <path d="M9 12L11 14L15 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
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
