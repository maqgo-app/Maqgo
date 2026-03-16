import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MaqgoLogo from '../components/MaqgoLogo';
import BACKEND_URL, { fetchWithAuth } from '../utils/api';
import { checkAbandonedBooking } from '../utils/abandonmentTracker';

/**
 * WelcomeScreen - Esencia de MAQGO
 * Primera impresión. Debe ser impecable.
 */
function WelcomeScreen() {
  const navigate = useNavigate();
  const [adminPending, setAdminPending] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const [abandonedBooking, setAbandonedBooking] = useState(null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mq.matches);
    const handler = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    fetchWithAuth(`${BACKEND_URL}/api/admin/stats`, { redirectOn401: false })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setAdminPending(data.pending_total || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.title = 'MAQGO - Maquinaria pesada donde la necesitas';
  }, []);

  useEffect(() => {
    const progress = checkAbandonedBooking();
    if (progress) setAbandonedBooking(progress);
  }, []);

  const hasSession = !!localStorage.getItem('userId');

  const IconExcavator = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19h16" />
      <path d="M8 19V10l4-5 4 5v9" />
      <path d="M8 10h8" />
      <path d="M16 10l3 4" />
      <path d="M19 14l-2 3" />
    </svg>
  );
  const IconBuilding = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
  const IconUser = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-3 3-6 8-6s8 3 8 6" />
    </svg>
  );

  const handleAccount = () => {
    navigate('/login');
  };

  const g = 8;
  const pad = isDesktop ? 40 : 20;

  const logoSize = isDesktop ? 200 : 145;

  return (
    <div className={`maqgo-app ${isDesktop ? 'welcome-desktop' : ''}`}>
      <div
        className="maqgo-screen welcome-screen"
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          maxHeight: '100dvh',
          boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #121318 0%, #0F0F12 40%, #0D0D10 100%)',
          padding: `max(16px, env(safe-area-inset-top)) ${pad}px max(16px, env(safe-area-inset-bottom))`,
          overflow: 'hidden'
        }}
      >
        {/* Hero compacto */}
        <header style={{
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          paddingBottom: 24,
          width: '100%'
        }}>
          <MaqgoLogo customSize={logoSize} style={{ marginBottom: 28 }} />
          <div style={{
            display: 'inline-block',
            background: 'linear-gradient(135deg, rgba(236, 104, 25, 0.25) 0%, rgba(236, 104, 25, 0.15) 100%)',
            border: '1.5px solid rgba(236, 104, 25, 0.6)',
            borderRadius: 24,
            padding: isDesktop ? '8px 18px' : '7px 16px',
            marginBottom: 26,
            boxShadow: '0 2px 12px rgba(236, 104, 25, 0.2)'
          }}>
            <span style={{
              color: '#EC6819',
              fontSize: isDesktop ? 12 : 11,
              fontWeight: 700,
              letterSpacing: 0.8
            }}>
              ARRIENDO POR HORAS, DÍAS O SEMANAS
            </span>
          </div>
          <h1 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: isDesktop ? 26 : 22,
            fontWeight: 600,
            color: '#FAFAFA',
            margin: '0 0 20px',
            lineHeight: 1.3,
            letterSpacing: '-0.02em',
            maxWidth: '100%',
            overflowWrap: 'break-word',
            padding: '0 4px'
          }}>
            Maquinaria pesada{' '}
            <span style={{ color: '#EC6819' }}>donde la necesitas</span>
            {' con '}
            <span style={{ color: '#fff' }}>operador incluído</span>
          </h1>
          <p style={{
            fontSize: isDesktop ? 15 : 14,
            color: '#B0B0B8',
            margin: 0,
            lineHeight: 1.55,
            maxWidth: isDesktop ? '36ch' : '28ch'
          }}>
            Arriendo inmediato o programado.
          </p>
        </header>

        {/* Banner: Reserva en progreso */}
        {abandonedBooking && (
          <div
            style={{
              flexShrink: 0,
              marginBottom: 16,
              padding: 14,
              background: 'linear-gradient(135deg, rgba(236, 104, 25, 0.2) 0%, rgba(236, 104, 25, 0.1) 100%)',
              border: '1px solid rgba(236, 104, 25, 0.5)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12
            }}
            role="alert"
            aria-label="Tienes un arriendo sin terminar"
          >
            <div>
              <p style={{ color: '#fff', fontSize: 14, fontWeight: 600, margin: '0 0 4px', fontFamily: "'Inter', sans-serif" }}>
                Arriendo sin terminar
              </p>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, margin: 0, fontFamily: "'Inter', sans-serif" }}>
                ¿Deseas continuar donde quedaste?
              </p>
            </div>
            <button
              onClick={() => {
                const step = abandonedBooking?.step || localStorage.getItem('clientBookingStep');
                const STEP_ROUTES = {
                  machinery: '/client/machinery',
                  hours: '/client/hours-selection',
                  urgency: '/client/urgency',
                  calendar: '/client/calendar',
                  location: '/client/service-location',
                  providers: '/client/providers',
                  confirm: '/client/confirm'
                };
                const route = STEP_ROUTES[step] || '/client/home';
                navigate(route);
                setAbandonedBooking(null);
              }}
              style={{
                padding: '10px 18px',
                background: '#EC6819',
                border: 'none',
                borderRadius: 10,
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                flexShrink: 0,
                fontFamily: "'Inter', sans-serif"
              }}
              aria-label="Continuar arriendo"
            >
              Continuar
            </button>
          </div>
        )}

        {/* Nota de confianza */}
        <p style={{
          flexShrink: 0,
          color: 'rgba(255,255,255,0.5)',
          fontSize: 11,
          textAlign: 'center',
          marginBottom: 4,
          fontFamily: "'Inter', sans-serif"
        }}>
          Tu progreso se guarda en cada paso
        </p>

        {/* CTAs */}
        <main style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 12,
          minHeight: 0
        }}>
          <button
            onClick={() => navigate('/client/home')}
            className="welcome-cta-primary"
            data-testid="start-client-btn"
            aria-label="Arrendar maquinaria"
          >
            <div className="welcome-cta-icon" style={{ background: 'rgba(255,255,255,0.22)' }}>
              <IconExcavator />
            </div>
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <div style={{ marginBottom: 1, fontSize: 15, fontWeight: 600 }}>Arrendar maquinaria</div>
              <div style={{ fontSize: 12, opacity: 0.95 }}>Inmediato o programado · Sin registro para empezar</div>
            </div>
          </button>

          <button
            onClick={() => {
              // Guardar intención de proveedor para preseleccionar rol tras registro/SMS
              localStorage.setItem('desiredRole', 'provider');
              navigate('/register');
            }}
            className="welcome-cta-secondary"
            data-testid="start-provider-btn"
            aria-label="Ofrecer mi maquinaria"
          >
            <div className="welcome-cta-icon" style={{ background: 'rgba(144, 189, 211, 0.18)', color: '#90BDD3' }}>
              <IconBuilding />
            </div>
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <div style={{ marginBottom: 1, fontSize: 15, fontWeight: 600 }}>Ofrecer mi maquinaria</div>
              <div style={{ fontSize: 12, color: '#B8B8B8' }}>Regístrate y recibe solicitudes de clientes</div>
            </div>
          </button>

          <button
            onClick={() => navigate('/operator/join')}
            className="welcome-cta-secondary"
            data-testid="operator-join-btn"
            aria-label="Soy operador"
          >
            <div className="welcome-cta-icon" style={{ background: 'rgba(255,255,255,0.08)', color: '#C8C8C8' }}>
              <IconUser />
            </div>
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <div style={{ marginBottom: 1, fontSize: 15, fontWeight: 600 }}>Soy operador</div>
              <div style={{ fontSize: 12, color: '#B8B8B8' }}>Unirme con código de equipo</div>
            </div>
          </button>
        </main>

        {/* Footer */}
        <footer
          style={{
            flexShrink: 0,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px 20px',
            paddingTop: 24,
            paddingBottom: 12,
            marginTop: 'auto',
            borderTop: '1px solid rgba(255,255,255,0.06)'
          }}
        >
          <span
            onClick={handleAccount}
            style={{ color: '#EC6819', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            data-testid="login-btn"
          >
            Iniciar sesión
          </span>
          <span style={{ color: '#404040', fontSize: 9 }}>·</span>
          <span
            onClick={() => navigate('/register')}
            style={{ color: '#A0A0A0', fontSize: 12, cursor: 'pointer' }}
          >
            ¿No tienes cuenta? Regístrate
          </span>
          <span style={{ color: '#404040', fontSize: 9 }}>·</span>
          <span onClick={() => navigate('/faq')} style={{ color: '#7a7a7a', fontSize: 12, cursor: 'pointer' }}>FAQ</span>
          <span onClick={() => navigate('/terms')} style={{ color: '#7a7a7a', fontSize: 12, cursor: 'pointer' }}>Términos y Condiciones</span>
          <span onClick={() => navigate('/privacy')} style={{ color: '#7a7a7a', fontSize: 12, cursor: 'pointer' }}>Política de Privacidad</span>
          <span style={{ color: '#404040', fontSize: 10 }}>·</span>
          <span
            onClick={() => navigate('/admin')}
            style={{ color: adminPending > 0 ? '#EC6819' : '#7a7a7a', fontSize: 12, cursor: 'pointer' }}
          >
            Admin{adminPending > 0 ? ` (${adminPending})` : ''}
          </span>
        </footer>
      </div>

      <style>{`
        .welcome-cta-primary {
          width: 100%;
          padding: 14px 16px;
          background: linear-gradient(135deg, #EC6819 0%, #D45A10 100%);
          border: none;
          border-radius: 12px;
          color: #fff;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          text-align: left;
          display: flex;
          align-items: center;
          gap: 14px;
          box-shadow: 0 4px 16px rgba(236, 104, 25, 0.3);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .welcome-cta-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(236, 104, 25, 0.4);
        }
        .welcome-cta-primary:active {
          transform: translateY(0);
        }
        .welcome-cta-secondary {
          width: 100%;
          padding: 14px 16px;
          background: rgba(26, 26, 31, 0.8);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          color: #FAFAFA;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          text-align: left;
          display: flex;
          align-items: center;
          gap: 14px;
          transition: all 0.2s;
        }
        .welcome-cta-secondary:hover {
          background: rgba(34, 34, 40, 0.9);
          border-color: rgba(255,255,255,0.12);
        }
        .welcome-cta-icon {
          width: 40px;
          height: 40px;
          min-width: 40px;
          min-height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}

export default WelcomeScreen;
