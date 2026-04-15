import React, { useEffect, useLayoutEffect, useState } from 'react';
import { useNavigate, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import MaqgoLogo from '../components/MaqgoLogo';
import BACKEND_URL, { fetchWithAuth } from '../utils/api';
import { useWelcomeLayout } from '../hooks/useWelcomeLayout';
import { shouldShowResumeBooking } from '../utils/abandonmentTracker';
import {
  getWelcomeAppHomePath,
  getWelcomeOperatorDestination,
  isAdminRoleStored,
} from '../utils/welcomeHome';
import { traceRedirectToLogin } from '../utils/traceLoginRedirect';

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
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [, setAdminPending] = useState(0);
  const { isDesktop, isNarrowMobile, isShortViewport, viewportHeight, viewportWidth } = useWelcomeLayout();
  // welcome-reveal en DOM desde el 1er frame (opacity 0 en CSS); welcome-mounted tras layout dispara animación (evita flash visible→oculto).
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !isAdminRoleStored()) return undefined;
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
    localStorage.removeItem('pendingRoute');
    localStorage.removeItem('showResumeModal');
    // Reglas de abandono (p. ej. >24h o shape inválido) vía checkAbandonedBooking dentro de shouldShowResumeBooking.
    // No borrar todo el progreso cuando decision.show es false: eso eliminaba reservas en curso recientes (<5 min).
    shouldShowResumeBooking();
  }, []);

  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  /** Vista fija sin scroll de página (iOS/Android suelen seguir moviendo el body si solo ocultamos overflow en el panel). */
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  // Solo sesión real (JWT): evita “Mi cuenta” con userId demo sin token → 401 en API.
  const hasSession = !!(localStorage.getItem('token') && localStorage.getItem('userId'));
  /** Admin con sesión: la portada es para mercado; sin ?preview=1 se redirige al panel (login ya manda a /admin). */
  const allowPublicPreview =
    searchParams.get('preview') === '1' || location.state?.previewPublic === true;
  const isAdminSession = hasSession && isAdminRoleStored();
  const showMarketplaceCTAs = true;

  if (isAdminSession && !allowPublicPreview) {
    return <Navigate to="/admin" replace />;
  }

  const handleAccount = () => {
    if (hasSession) {
      if (isAdminRoleStored()) {
        navigate('/admin');
        return;
      }
      // Portada = arrendar: “Mi cuenta” entra como cliente (no al embudo proveedor por userRole).
      try {
        localStorage.setItem('desiredRole', 'client');
      } catch {
        /* ignore */
      }
      navigate(getWelcomeAppHomePath());
      return;
    }
    // No arrastrar intención vieja de "Ofrecer" / embudo machine-first (tras login no debe forzar /provider/add-machine).
    try {
      localStorage.removeItem('providerCameFromWelcome');
      localStorage.removeItem('desiredRole');
    } catch {
      /* ignore */
    }
    // Portada = mercado: "Iniciar sesión" entra como cliente (SMS por defecto). Quien se enroló como proveedor usa "Entrar con correo y contraseña" en Login.
    traceRedirectToLogin('src/screens/WelcomeScreen.jsx (handleAccount → login, entry client)');
    navigate('/login', {
      state: { entry: 'client' },
    });
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
  // Escalar tipografía solo por ancho evita "saltos" cuando el browser móvil
  // colapsa/expande barras y cambia window.innerHeight durante scroll.
  const fineScale = isDesktop ? 1 : widthScale;
  const scalePx = (base, min, max) => {
    const scaled = Math.round(base * fineScale);
    return Math.max(min, Math.min(max, scaled));
  };
  const heroLogoBottom = isDesktop ? 40 : (isShortViewport ? 16 : (isNarrowMobile ? 20 : 24));
  return (
    <div
      className={`maqgo-app ${isDesktop ? 'welcome-desktop' : ''} ${isShortViewport ? 'welcome-short' : ''}`}
      >
      <div
        className={`maqgo-screen welcome-screen ${mounted ? 'welcome-mounted' : ''}`}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: "100vh",
          padding: "24px",
          margin: "0 auto",
          maxWidth: "420px",
          border: "1px solid rgba(0,0,0,0.06)",
          borderRadius: "24px"
        }}
      >
        {/* Hero - compacto en viewports cortos */}
        <header style={{
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          paddingBottom: isShortViewport ? 16 : (isNarrowMobile ? 24 : (isDesktop ? 48 : 36)),
          width: '100%'
        }}>
          <div
            className="welcome-reveal"
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              ['--welcome-d']: '0ms',
            }}
          >
            <MaqgoLogo customSize={logoSize} style={{ marginTop: window.innerWidth < 768 ? "12px" : "32px", marginBottom: "16px" }} />
          </div>
          <div
            className="welcome-hero-caluga welcome-reveal"
            style={{
              ['--welcome-d']: '35ms',
              marginTop: "16px",
              marginBottom: "24px",
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              maxWidth: 'min(100%, 30rem)',
              padding: isDesktop
                ? 'var(--maqgo-welcome-caluga-pad-y-desktop) var(--maqgo-welcome-caluga-pad-x-desktop)'
                : (isShortViewport ? '7px 12px' : '8px 16px'),
              borderRadius: 9999,
              background: 'var(--maqgo-welcome-caluga-bg)',
              boxShadow: 'var(--maqgo-welcome-caluga-box-shadow)',
              border: 'var(--maqgo-welcome-caluga-border)',
            }}
          >
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: isDesktop
                  ? 'var(--maqgo-welcome-caluga-font-size-desktop)'
                  : scalePx(isShortViewport ? 10.5 : 11, 10, 12.5),
                fontWeight: 'var(--maqgo-welcome-caluga-font-weight)',
                letterSpacing: 'var(--maqgo-welcome-caluga-letter-spacing)',
                lineHeight: 'var(--maqgo-welcome-caluga-line-height)',
                color: '#F5F5F7',
                textAlign: 'center',
                textShadow: 'none',
              }}
            >
              Arrienda maquinaria en minutos con disponibilidad en tiempo real.
            </span>
          </div>
          <div
            className="welcome-reveal"
            style={{
              ['--welcome-d']: '130ms',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: isShortViewport ? 8 : (isNarrowMobile ? 10 : 12),
            }}
          >
          <h1 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: isDesktop ? 28 : scalePx(isShortViewport ? 18 : 21, 17, 24),
            fontWeight: 600,
            color: '#FAFAFA',
            margin: 0,
            marginBottom: "16px",
            lineHeight: 1.18,
            letterSpacing: '-0.028em',
            maxWidth: '100%',
            overflowWrap: 'break-word',
            padding: '0 4px'
          }}>
            Maquinaria pesada{' '}
            <span style={{ color: '#EC6819' }}>donde la necesitas</span>
            {' con '}
            <span style={{ color: '#fff' }}>operador incluido</span>
          </h1>
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
          marginTop: isDesktop ? 52 : (isShortViewport ? 24 : (isNarrowMobile ? 40 : 48)),
          /* Aire antes del footer: los CTAs no deben verse pegados al pie */
          paddingBottom: isDesktop ? 52 : (isShortViewport ? 28 : (isNarrowMobile ? 36 : 40))
        }}>
          {showMarketplaceCTAs ? (
            <>
          <button
            onClick={() => {
              const target = '/client/home';
              if (!hasSession) {
                try {
                  localStorage.setItem('desiredRole', 'client');
                } catch {
                  /* ignore */
                }
                traceRedirectToLogin('src/screens/WelcomeScreen.jsx (Arrendar maquinaria CTA)');
                navigate('/login', { state: { redirect: target, entry: 'client' } });
                return;
              }
              // "Arrendar maquinaria" siempre debe iniciar el funnel cliente.
              try {
                localStorage.setItem('desiredRole', 'client');
              } catch {
                /* ignore */
              }
              navigate(target);
            }}
            className="welcome-cta-primary welcome-reveal"
            style={{ ['--welcome-d']: '200ms', transition: "all 0.2s ease" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 10px 20px rgba(0,0,0,0.15)";
              e.currentTarget.style.filter = "brightness(0.95)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0px)";
              e.currentTarget.style.boxShadow = "none";
              e.currentTarget.style.filter = "brightness(1)";
            }}
            data-testid="start-client-btn"
            aria-label="Arrendar maquinaria. Para hoy o en la fecha que indiques."
          >
            <div className="welcome-cta-icon" style={{ background: 'rgba(255,255,255,0.22)' }}>
              <IconExcavator />
            </div>
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <div style={{ marginBottom: 1, fontSize: 15, fontWeight: 600, lineHeight: 1.2, whiteSpace: 'normal' }}>Arrendar maquinaria</div>
              <div style={{ fontSize: 12, opacity: 0.95, lineHeight: 1.35 }}>Para hoy o en la fecha que indiques</div>
            </div>
          </button>

          <button
            onClick={() => {
              try {
                localStorage.setItem('desiredRole', 'provider');
              } catch {
                /* ignore */
              }
              const fromWelcome = true;
              const finalRoute = '/provider/add-machine';
              try {
                localStorage.setItem('providerCameFromWelcome', 'true');
              } catch {
                /* ignore */
              }
              console.log('PROVIDER FLOW ENTRY', { fromWelcome, finalRoute });
              navigate(finalRoute);
            }}
            className="welcome-cta-secondary welcome-reveal"
            style={{ ['--welcome-d']: '270ms' }}
            data-testid="start-provider-btn"
            aria-label="Ofrecer mi maquinaria. Regístrate y recibe solicitudes de clientes."
          >
            <div className="welcome-cta-icon" style={{ background: 'rgba(144, 189, 211, 0.18)', color: '#90BDD3' }}>
              <IconBuilding />
            </div>
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <div style={{ marginBottom: 1, fontSize: 15, fontWeight: 600, lineHeight: 1.2, whiteSpace: 'normal' }}>Ofrecer mi maquinaria</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.86)', lineHeight: 1.35, whiteSpace: 'normal', wordBreak: 'break-word' }}>Regístrate y recibe solicitudes de clientes</div>
            </div>
          </button>

          <button
            onClick={() => navigate(getWelcomeOperatorDestination())}
            className="welcome-cta-secondary welcome-reveal"
            style={{ ['--welcome-d']: '340ms' }}
            data-testid="operator-join-btn"
            aria-label="Soy operador. Unirme con código de equipo."
          >
            <div className="welcome-cta-icon" style={{ background: 'rgba(255,255,255,0.08)', color: '#C8C8C8' }}>
              <IconUser />
            </div>
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <div style={{ marginBottom: 1, fontSize: 15, fontWeight: 600, lineHeight: 1.2, whiteSpace: 'normal' }}>Soy operador</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.86)', lineHeight: 1.35, whiteSpace: 'normal', wordBreak: 'break-word' }}>Unirme con código de equipo</div>
            </div>
          </button>
            </>
          ) : (
            <div
              className="welcome-reveal"
              style={{
                ['--welcome-d']: '200ms',
                maxWidth: 420,
                margin: '0 auto',
                width: '100%',
                padding: '16px 14px',
                borderRadius: 14,
                background: 'rgba(22, 22, 28, 0.72)',
                border: '1px solid rgba(255,255,255,0.08)',
                textAlign: 'center',
              }}
            >
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  color: 'rgba(255,255,255,0.82)',
                  lineHeight: 1.45,
                  margin: '0 0 14px',
                }}
              >
                Vista previa de la portada pública. Con sesión de administrador no mostramos acciones de cliente, proveedor u operador.
              </p>
              <button
                type="button"
                className="maqgo-btn-primary"
                onClick={() => navigate('/admin', { replace: true })}
                style={{ width: '100%', padding: '12px 16px', fontSize: 14, fontWeight: 600 }}
              >
                Volver al panel interno
              </button>
            </div>
          )}
        </main>

        <div style={{ textAlign: "center", marginTop: "20px" }}>

  <div style={{ marginBottom: "18px" }}>
    <a href="/login" style={{
      color: "#FF6B00",
      fontSize: "14px",
      textDecoration: "none"
    }}>
      Iniciar sesión
    </a>
  </div>

  <div style={{
    display: "flex",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: "6px",
    fontSize: "12px",
    color: "#999"
  }}>

    <a href="/faq" target="_blank" rel="noopener noreferrer" style={{ color: "#999", textDecoration: "none" }}>FAQ</a>
    <span>·</span>
    <a href="https://www.maqgo.cl/terminos.html" target="_blank" rel="noopener noreferrer" style={{ color: "#999", textDecoration: "none" }}>Términos y Condiciones</a>
    <span>·</span>
    <a href="https://www.maqgo.cl/privacidad.html" target="_blank" rel="noopener noreferrer" style={{ color: "#999", textDecoration: "none" }}>Política de Privacidad</a>

  </div>

  <div style={{ marginTop: "40px", textAlign: "center" }}>
    <p style={{ fontSize: "12px", color: "#888" }}>
      Al continuar aceptas nuestros{" "}
      <a href="https://www.maqgo.cl/terminos.html" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
        Términos y Condiciones
      </a>{" "}
      y{" "}
      <a href="https://www.maqgo.cl/privacidad.html" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
        Política de Privacidad
      </a>
    </p>
  </div>

</div>
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
          font-size: 12px;
        }
        .welcome-cta-primary {
          width: 100%;
          padding: 15px 18px;
          flex-shrink: 0;
          background: linear-gradient(135deg, #EC6819 0%, #D45A10 100%);
          border: none;
          border-radius: 14px;
          color: #fff;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          text-align: left;
          display: flex;
          align-items: center;
          gap: 14px;
          box-shadow: 0 4px 22px rgba(236, 104, 25, 0.28), 0 1px 0 rgba(255,255,255,0.12) inset;
          transition:
            transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 0.22s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .welcome-cta-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(236, 104, 25, 0.38);
        }
        .welcome-cta-primary:active {
          transform: translateY(0);
          box-shadow: 0 3px 14px rgba(236, 104, 25, 0.32);
        }
        .welcome-cta-secondary {
          width: 100%;
          padding: 15px 18px;
          flex-shrink: 0;
          background: rgba(22, 22, 28, 0.72);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px;
          color: #FAFAFA;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          text-align: left;
          display: flex;
          align-items: center;
          gap: 14px;
          transition: background 0.22s ease, border-color 0.22s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .welcome-cta-secondary:hover {
          background: rgba(30, 30, 38, 0.88);
          border-color: rgba(255,255,255,0.11);
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
          border-radius: 11px;
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
