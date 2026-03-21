import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MaqgoLogo from '../components/MaqgoLogo';
import BACKEND_URL, { fetchWithAuth } from '../utils/api';
import { useWelcomeLayout } from '../hooks/useWelcomeLayout';
import { shouldShowResumeBooking, clearBookingProgress } from '../utils/abandonmentTracker';

const ICON_SIZE = 24;

function IconExcavator() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, display: 'block' }} aria-hidden="true">
      <path d="M4 19h16" />
      <path d="M8 19V10l4-5 4 5v9" />
      <path d="M8 10h8" />
      <path d="M16 10l3 4" />
      <path d="M19 14l-2 3" />
    </svg>
  );
}

function IconBuilding() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, display: 'block' }} aria-hidden="true">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, display: 'block' }} aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-3 3-6 8-6s8 3 8 6" />
    </svg>
  );
}

/**
 * WelcomeScreen - Esencia de MAQGO
 * Primera impresión. Debe ser impecable.
 */
function WelcomeScreen() {
  const navigate = useNavigate();
  const [adminPending, setAdminPending] = useState(0);
  const { isDesktop, isNarrowMobile, isShortViewport, viewportHeight, viewportWidth } = useWelcomeLayout();
  // Fade-in suave tras primer paint (evita flash de layout).
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('userRole');
    if (!token || role !== 'admin') return undefined;
    const ac = new AbortController();
    fetchWithAuth(`${BACKEND_URL}/api/admin/stats`, {
      redirectOn401: false,
      signal: ac.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setAdminPending(data.pending_total || 0))
      .catch(() => {});
    return () => ac.abort();
  }, []);

  useEffect(() => {
    document.title = 'MAQGO - Maquinaria pesada donde la necesitas';
  }, []);

  useEffect(() => {
    // Respetar regla de negocio: solo mantener progreso si realmente es reanudable.
    const decision = shouldShowResumeBooking();
    if (!decision.show) {
      clearBookingProgress();
      localStorage.removeItem('pendingRoute');
      localStorage.removeItem('showResumeModal');
    }
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const hasSession = !!localStorage.getItem('userId');

  const handleAccount = () => {
    navigate('/login');
  };

  const pad = isDesktop ? 40 : (isNarrowMobile ? 16 : 20);
  // Logo escala progresivamente según altura del viewport (p2→p6): más grande en pantallas altas
  const logoSize = isDesktop
    ? 180
    : viewportHeight < 500
      ? 90
      : viewportHeight < 560
        ? 105
        : viewportHeight < 620
          ? 118
          : viewportHeight < 680
            ? 130
            : 142;
  const widthProgress = Math.max(0, Math.min(1, (viewportWidth - 320) / 110));
  const widthScale = isDesktop ? 1 : (0.9 + (widthProgress * 0.16)); // 320->0.9, 430->1.06
  const heightScale = isDesktop ? 1 : (viewportHeight < 620 ? 0.94 : (viewportHeight > 760 ? 1.04 : 1));
  const fineScale = isDesktop ? 1 : (widthScale * heightScale);
  const scalePx = (base, min, max) => {
    const scaled = Math.round(base * fineScale);
    return Math.max(min, Math.min(max, scaled));
  };
  const heroLogoBottom = isDesktop ? 36 : (isShortViewport ? 16 : (isNarrowMobile ? 20 : 24));

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
          background: 'var(--maqgo-bg)',
          padding: isDesktop
            ? `max(72px, env(safe-area-inset-top)) ${pad}px max(16px, env(safe-area-inset-bottom))`
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
          paddingBottom: isShortViewport ? 12 : (isNarrowMobile ? 20 : (isDesktop ? 40 : 28)),
          width: '100%'
        }}>
          <MaqgoLogo customSize={logoSize} style={{ marginBottom: isShortViewport ? Math.min(heroLogoBottom, 14) : heroLogoBottom }} />
          {/* Caluga premium: valor en una frase, sin repetir el titular */}
          <div
            role="note"
            aria-label="Propuesta de valor"
            style={{
              marginBottom: isShortViewport ? 10 : (isNarrowMobile ? 12 : 14),
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              maxWidth: 'min(100%, 26rem)',
              padding: isShortViewport ? '7px 14px' : '9px 20px',
              borderRadius: 9999,
              background: 'linear-gradient(135deg, #F0843A 0%, #EC6819 45%, #B8430E 100%)',
              boxShadow:
                '0 8px 28px rgba(236, 104, 25, 0.38), inset 0 1px 0 rgba(255,255,255,0.28)',
              border: '1px solid rgba(255,255,255,0.14)',
            }}
          >
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: isDesktop ? 12.5 : scalePx(isShortViewport ? 10.5 : 11, 10, 12.5),
                fontWeight: 600,
                letterSpacing: '0.03em',
                lineHeight: 1.35,
                color: '#FFFBF7',
                textAlign: 'center',
                textShadow: '0 1px 2px rgba(0,0,0,0.18)',
              }}
            >
              Elige en pocos pasos con disponibilidad en tiempo real
            </span>
          </div>
          <div style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: isShortViewport ? 8 : (isNarrowMobile ? 10 : 12),
          }}>
          <h1 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: isDesktop ? 26 : scalePx(isShortViewport ? 17 : 20, 16, 23),
            fontWeight: 600,
            color: '#FAFAFA',
            margin: 0,
            lineHeight: 1.24,
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
            fontSize: isDesktop ? 15 : scalePx(isShortViewport ? 12 : 13, 12, 15),
            color: '#B0B0B8',
            margin: 0,
            lineHeight: 1.5,
            maxWidth: isDesktop ? '36ch' : '28ch'
          }}>
            Elige en pocos pasos y continúa con disponibilidad real.
          </p>
          </div>
        </header>

        {/* CTAs - flex:1 para ocupar espacio y centrar en desktop; en móvil también flex para distribuir */}
        {/* Sin banner "Continuar": más espacio entre header y botones para buena UX de navegación */}
        <main style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: isDesktop ? 'center' : (isShortViewport ? 'center' : 'flex-start'),
          gap: isShortViewport ? 8 : (isNarrowMobile ? 12 : 16),
          overflow: 'visible',
          marginTop: isDesktop ? 48 : (isShortViewport ? 28 : (isNarrowMobile ? 36 : 44))
        }}>
          <button
            onClick={() => {
              const target = '/client/home';
              if (!hasSession) {
                navigate('/login', { state: { redirect: target } });
                return;
              }
              navigate(target);
            }}
            className="welcome-cta-primary"
            data-testid="start-client-btn"
            aria-label="Arrendar maquinaria"
          >
            <div className="welcome-cta-icon" style={{ background: 'rgba(255,255,255,0.22)' }}>
              <IconExcavator />
            </div>
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <div style={{ marginBottom: 1, fontSize: 15, fontWeight: 600, lineHeight: 1.2, whiteSpace: 'normal' }}>Arrendar maquinaria</div>
              <div style={{ fontSize: 12, opacity: 0.95 }}>Para hoy o en la fecha que indiques</div>
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
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.86)' }}>Regístrate y recibe solicitudes de clientes</div>
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
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.86)' }}>Unirme con código de equipo</div>
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
            paddingTop: isShortViewport ? 6 : (isNarrowMobile ? 12 : 18),
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
        .welcome-cta-primary:focus-visible,
        .welcome-cta-secondary:focus-visible,
        .welcome-footer-btn:focus-visible {
          outline: 2px solid rgba(236, 104, 25, 0.95);
          outline-offset: 2px;
          border-radius: 10px;
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
