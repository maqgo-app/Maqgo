import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MaqgoLogo from '../components/MaqgoLogo';
import BACKEND_URL, { fetchWithAuth } from '../utils/api';
import { checkAbandonedBooking } from '../utils/abandonmentTracker';
import { BREAKPOINT_MOBILE, BREAKPOINT_NARROW } from '../constants/breakpoints';
import { Z_INDEX } from '../constants/zIndex';

/**
 * WelcomeScreen - Esencia de MAQGO
 * Primera impresión. Debe ser impecable.
 */
function WelcomeScreen() {
  const navigate = useNavigate();
  const [adminPending, setAdminPending] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isNarrowMobile, setIsNarrowMobile] = useState(false);
  const [isShortViewport, setIsShortViewport] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(() => typeof window !== 'undefined' ? window.innerHeight : 700);
  const [abandonedBooking, setAbandonedBooking] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const check = () => {
      const h = window.innerHeight;
      setIsShortViewport(h < 680);
      setViewportHeight(h);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${BREAKPOINT_MOBILE}px)`);
    setIsDesktop(mq.matches);
    const handler = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${BREAKPOINT_NARROW}px)`);
    setIsNarrowMobile(mq.matches);
    const handler = () => setIsNarrowMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('userRole');
    if (!token || role !== 'admin') return;
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

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const hasSession = !!localStorage.getItem('userId');

  const iconSize = 24;
  const IconExcavator = () => (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, display: 'block' }} aria-hidden="true">
      <path d="M4 19h16" />
      <path d="M8 19V10l4-5 4 5v9" />
      <path d="M8 10h8" />
      <path d="M16 10l3 4" />
      <path d="M19 14l-2 3" />
    </svg>
  );
  const IconBuilding = () => (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, display: 'block' }} aria-hidden="true">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
  const IconUser = () => (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, display: 'block' }} aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-3 3-6 8-6s8 3 8 6" />
    </svg>
  );

  const handleAccount = () => {
    navigate('/login');
  };

  const pad = isDesktop ? 40 : (isNarrowMobile ? 16 : 20);
  // Logo escala progresivamente según altura del viewport (p2→p6): más grande en pantallas altas
  const logoSize = isDesktop
    ? 160
    : viewportHeight < 500
      ? 90
      : viewportHeight < 560
        ? 105
        : viewportHeight < 620
          ? 118
          : viewportHeight < 680
            ? 130
            : 142;

  return (
    <div className={`maqgo-app ${isDesktop ? 'welcome-desktop' : ''} ${isShortViewport ? 'welcome-short' : ''}`}>
      <div
        className="maqgo-screen welcome-screen"
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          maxWidth: '100%',
          height: isDesktop ? '100vh' : '100dvh',
          minHeight: isDesktop ? undefined : '100dvh',
          maxHeight: isDesktop ? undefined : '100dvh',
          boxSizing: 'border-box',
          background: '#18181C',
          padding: isDesktop
            ? `max(56px, env(safe-area-inset-top)) ${pad}px max(16px, env(safe-area-inset-bottom))`
            : `max(${isShortViewport ? 6 : 12}px, env(safe-area-inset-top, 12px)) ${pad}px max(${isShortViewport ? 6 : 10}px, env(safe-area-inset-bottom, 10px))`,
          overflow: 'hidden',
          opacity: mounted ? 1 : 0,
          transition: 'opacity 0.3s ease-out'
        }}
      >
        {/* Hero - compacto en viewports cortos */}
        <header style={{
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          paddingBottom: isShortViewport ? 4 : (isNarrowMobile ? 10 : (isDesktop ? 32 : 14)),
          width: '100%'
        }}>
          <MaqgoLogo customSize={logoSize} transparent style={{ marginBottom: isShortViewport ? 4 : (isNarrowMobile ? 10 : (isDesktop ? 36 : 16)) }} />
          <div style={{
            display: 'inline-block',
            flexShrink: 0,
            background: 'linear-gradient(135deg, rgba(236, 104, 25, 0.25) 0%, rgba(236, 104, 25, 0.15) 100%)',
            border: '1.5px solid rgba(236, 104, 25, 0.6)',
            borderRadius: 24,
            padding: isShortViewport ? '4px 10px' : (isDesktop ? '8px 18px' : (isNarrowMobile ? '6px 12px' : '7px 16px')),
            marginBottom: isShortViewport ? 4 : (isNarrowMobile ? 10 : 14),
            boxShadow: '0 2px 12px rgba(236, 104, 25, 0.2)'
          }}>
            <span style={{
              color: '#EC6819',
              fontSize: isShortViewport ? 9 : (isDesktop ? 12 : (isNarrowMobile ? 10 : 11)),
              fontWeight: 700,
              letterSpacing: 0.8
            }}>
              ARRIENDO POR HORAS, DÍAS O SEMANAS
            </span>
          </div>
          <h1 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: isShortViewport ? 16 : (isDesktop ? 26 : (isNarrowMobile ? 18 : 22)),
            fontWeight: 600,
            color: '#FAFAFA',
            margin: '0 0 ' + (isShortViewport ? 3 : (isNarrowMobile ? 6 : 10)) + 'px',
            lineHeight: 1.3,
            letterSpacing: '-0.02em',
            maxWidth: '100%',
            overflowWrap: 'break-word',
            padding: '0 4px'
          }}>
            Maquinaria pesada{' '}
            <span style={{ color: '#EC6819' }}>donde la necesitas</span>
            {' con '}
            <span style={{ color: '#fff' }}>operador incluido</span>
          </h1>
          <p style={{
            fontSize: isShortViewport ? 12 : (isDesktop ? 15 : (isNarrowMobile ? 13 : 14)),
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
              marginBottom: isShortViewport ? 4 : 10,
              padding: isShortViewport ? 10 : 14,
              background: 'linear-gradient(135deg, rgba(236, 104, 25, 0.2) 0%, rgba(236, 104, 25, 0.1) 100%)',
              border: '1px solid rgba(236, 104, 25, 0.5)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              zIndex: Z_INDEX.sticky
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

        {/* CTAs - flex:1 para ocupar espacio y centrar en desktop; en móvil también flex para distribuir */}
        <main style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: isDesktop ? 'center' : (isShortViewport ? 'center' : 'flex-start'),
          gap: isShortViewport ? 3 : (isNarrowMobile ? 5 : 8),
          overflow: 'hidden'
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

        {/* Footer - compacto en viewports cortos */}
        <footer
          style={{
            flexShrink: 0,
            display: 'flex',
            flexDirection: isDesktop ? 'row' : 'column',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: isShortViewport ? 4 : (isDesktop ? (isNarrowMobile ? '8px 12px' : '12px 20px') : 8),
            paddingTop: isShortViewport ? 8 : (isNarrowMobile ? 16 : 24),
            paddingBottom: isShortViewport ? 8 : 12,
            marginTop: 'auto',
            borderTop: '1px solid rgba(255,255,255,0.06)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: isNarrowMobile ? '6px 10px' : '8px 14px', fontSize: isNarrowMobile ? 12 : 13 }}>
            <button
              type="button"
              onClick={handleAccount}
              className="welcome-footer-btn welcome-footer-btn-primary"
              data-testid="login-btn"
              aria-label="Iniciar sesión"
            >
              Iniciar sesión
            </button>
            <span style={{ color: '#404040', fontSize: 9 }}>·</span>
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="welcome-footer-btn"
              aria-label="Registrarse"
            >
              ¿No tienes cuenta? Regístrate
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: isNarrowMobile ? '6px 10px' : '8px 14px', fontSize: isNarrowMobile ? 11 : 12 }}>
            <button type="button" onClick={() => navigate('/faq')} className="welcome-footer-btn" aria-label="Preguntas frecuentes">FAQ</button>
            <span style={{ color: '#404040', fontSize: 9 }}>·</span>
            <button type="button" onClick={() => navigate('/terms')} className="welcome-footer-btn" aria-label="Términos y condiciones">Términos y Condiciones</button>
            <span style={{ color: '#404040', fontSize: 9 }}>·</span>
            <button type="button" onClick={() => navigate('/privacy')} className="welcome-footer-btn" aria-label="Política de privacidad">Política de Privacidad</button>
            <span style={{ color: '#404040', fontSize: 9 }}>·</span>
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="welcome-footer-btn"
              style={{ color: adminPending > 0 ? '#EC6819' : undefined }}
              aria-label={adminPending > 0 ? `Admin con ${adminPending} pendientes` : 'Panel de administración'}
            >
              Admin{adminPending > 0 ? ` (${adminPending})` : ''}
            </button>
          </div>
        </footer>
      </div>

      <style>{`
        .maqgo-screen.welcome-screen {
          min-height: 100vh;
          min-height: 100dvh;
          min-height: -webkit-fill-available;
        }
        @media (max-width: 767px) {
          .maqgo-screen.welcome-screen {
            -webkit-tap-highlight-color: transparent;
          }
          .welcome-cta-primary,
          .welcome-cta-secondary {
            padding: 12px 14px;
          }
          .welcome-cta-icon {
            width: 36px;
            height: 36px;
            min-width: 36px;
            min-height: 36px;
            flex: 0 0 36px;
          }
          .welcome-cta-icon svg {
            width: 20px;
            height: 20px;
          }
        }
        .welcome-short .welcome-cta-primary,
        .welcome-short .welcome-cta-secondary {
          padding: 8px 12px;
        }
        .welcome-short .welcome-cta-icon {
          width: 32px;
          height: 32px;
          min-width: 32px;
          min-height: 32px;
          flex: 0 0 32px;
        }
        .welcome-short .welcome-cta-icon svg {
          width: 18px;
          height: 18px;
        }
        .welcome-short .welcome-cta-primary > div:last-child > div:first-child,
        .welcome-short .welcome-cta-secondary > div:last-child > div:first-child {
          font-size: 13px;
        }
        .welcome-short .welcome-cta-primary > div:last-child > div:last-child,
        .welcome-short .welcome-cta-secondary > div:last-child > div:last-child {
          font-size: 10px;
        }
        .welcome-cta-primary {
          width: 100%;
          padding: 14px 16px;
          flex-shrink: 0;
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
          flex-shrink: 0;
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
          flex: 0 0 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .welcome-cta-icon svg {
          width: 24px;
          height: 24px;
          flex-shrink: 0;
        }
        .welcome-footer-btn {
          background: none;
          border: none;
          padding: 0;
          font-family: inherit;
          font-size: inherit;
          color: #7a7a7a;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        .welcome-footer-btn:hover {
          color: #A0A0A0;
        }
        .welcome-footer-btn-primary {
          color: #EC6819;
          font-weight: 600;
        }
        .welcome-footer-btn-primary:hover {
          color: #f08040;
        }
      `}</style>
    </div>
  );
}

export default WelcomeScreen;
