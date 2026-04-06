import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import BACKEND_URL, { fetchWithAuth } from '../utils/api';
import {
  maskBackendHost,
  getAdminDemoBypass,
  setAdminDemoBypass,
  clearAdminDemoBypass,
} from '../utils/apiHealth';
import { traceRedirectToLogin } from '../utils/traceLoginRedirect';

const VERIFY_TIMEOUT_MS = 3500;
const ADMIN_VERIFY_CACHE_KEY = 'maqgo_admin_verified_at';
const ADMIN_VERIFY_CACHE_TTL_MS = 90 * 1000;

function getAdminVerifiedAt() {
  try {
    const raw = sessionStorage.getItem(ADMIN_VERIFY_CACHE_KEY);
    if (!raw) return 0;
    const ts = Number(raw);
    return Number.isFinite(ts) ? ts : 0;
  } catch {
    return 0;
  }
}

function setAdminVerifiedNow() {
  try {
    sessionStorage.setItem(ADMIN_VERIFY_CACHE_KEY, String(Date.now()));
  } catch {
    /* private mode */
  }
}

function clearAdminVerifiedCache() {
  try {
    sessionStorage.removeItem(ADMIN_VERIFY_CACHE_KEY);
  } catch {
    /* private mode */
  }
}

/**
 * Protege rutas /admin. Verifica /api/admin/stats antes de mostrar el panel.
 * - Red caída/DNS: pantalla de bloqueo con reintentar o modo demostración (evita falsa sensación de "panel vivo").
 * - 401/403: revoca admin local y muestra acceso restringido.
 */
function AdminRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const userId = localStorage.getItem('userId');
  const userRole = localStorage.getItem('userRole');
  const token = localStorage.getItem('token');
  const userRolesRaw = localStorage.getItem('userRoles');
  const [verifiedAdmin, setVerifiedAdmin] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  /** Tras primer intento de verificación: true si falló la red y el usuario creía ser admin. */
  const [statsNetworkFailure, setStatsNetworkFailure] = useState(false);
  const [demoBypass, setDemoBypassState] = useState(() => getAdminDemoBypass());

  const userRoles = useMemo(() => {
    try {
      return userRolesRaw ? JSON.parse(userRolesRaw) : [];
    } catch {
      return [];
    }
  }, [userRolesRaw]);

  const isAdminByStorage =
    userRole === 'admin' || (Array.isArray(userRoles) && userRoles.includes('admin'));
  const shouldVerifyAdmin = Boolean(userId && token);

  /** Solo muestra bloqueo en la primera entrada o cuando vence el cache. */
  const [checkingAdmin, setCheckingAdmin] = useState(() => {
    if (!shouldVerifyAdmin) return false;
    if (!isAdminByStorage) return true;
    return Date.now() - getAdminVerifiedAt() > ADMIN_VERIFY_CACHE_TTL_MS;
  });

  useEffect(() => {
    let mounted = true;
    if (!shouldVerifyAdmin) {
      setCheckingAdmin(false);
      setStatsNetworkFailure(false);
      return () => {};
    }

    const cacheFresh =
      isAdminByStorage && Date.now() - getAdminVerifiedAt() <= ADMIN_VERIFY_CACHE_TTL_MS;
    if (cacheFresh && retryNonce === 0) {
      setVerifiedAdmin(true);
      setCheckingAdmin(false);
      return () => {};
    }

    setCheckingAdmin(true);

    (async () => {
      try {
        const res = await fetchWithAuth(
          `${BACKEND_URL}/api/admin/stats`,
          { method: 'GET', redirectOn401: false },
          VERIFY_TIMEOUT_MS
        );
        if (!mounted) return;

        if (res.ok) {
          localStorage.setItem('userRole', 'admin');
          setVerifiedAdmin(true);
          setAdminVerifiedNow();
          setStatsNetworkFailure(false);
          clearAdminDemoBypass();
          setDemoBypassState(false);
        } else if (res.status === 401 || res.status === 403) {
          try {
            const raw = localStorage.getItem('userRoles');
            const parsed = raw ? JSON.parse(raw) : [];
            const next = Array.isArray(parsed) ? parsed.filter((x) => x !== 'admin') : [];
            localStorage.removeItem('userRole');
            if (next.length) {
              localStorage.setItem('userRoles', JSON.stringify(next));
              localStorage.setItem('userRole', next[0]);
            } else {
              localStorage.removeItem('userRoles');
            }
          } catch {
            localStorage.removeItem('userRole');
            localStorage.removeItem('userRoles');
          }
          setVerifiedAdmin(false);
          clearAdminVerifiedCache();
          setStatsNetworkFailure(false);
          clearAdminDemoBypass();
          setDemoBypassState(false);
        } else {
          setVerifiedAdmin(isAdminByStorage);
          if (!isAdminByStorage) clearAdminVerifiedCache();
          setStatsNetworkFailure(false);
        }
      } catch {
        if (!mounted) return;
        setVerifiedAdmin(isAdminByStorage);
        if (!isAdminByStorage) clearAdminVerifiedCache();
        setStatsNetworkFailure(Boolean(isAdminByStorage));
      } finally {
        if (mounted) setCheckingAdmin(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [token, shouldVerifyAdmin, isAdminByStorage, retryNonce]);

  const isAdmin = verifiedAdmin || isAdminByStorage;

  const enableDemoBypass = () => {
    setAdminDemoBypass(true);
    setDemoBypassState(true);
    setStatsNetworkFailure(false);
  };

  const retryVerify = () => {
    clearAdminDemoBypass();
    clearAdminVerifiedCache();
    setDemoBypassState(false);
    setStatsNetworkFailure(false);
    setRetryNonce((n) => n + 1);
  };

  if (!userId) {
    traceRedirectToLogin('src/components/AdminRoute.jsx');
    return <Navigate to="/login" state={{ from: location.pathname, redirect: '/admin' }} replace />;
  }

  if (checkingAdmin) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--maqgo-bg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: 16, margin: 0 }}>Verificando conexión con el panel MAQGO…</p>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: '12px 0 0', maxWidth: 360 }}>
          Comprobando permisos y alcance del API (
          <code style={{ color: '#7EB8D4' }}>{maskBackendHost(BACKEND_URL)}</code>
          ).
        </p>
      </div>
    );
  }

  if (statsNetworkFailure && isAdmin && !demoBypass) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--maqgo-bg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          color: '#fff',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div style={{ maxWidth: 440, textAlign: 'center' }}>
          <p style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px', color: '#E8A34B' }}>
            No hay conexión con el servidor MAQGO
          </p>
          <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, lineHeight: 1.5, margin: '0 0 8px' }}>
            No pudimos alcanzar el API en{' '}
            <strong style={{ color: '#fff' }}>{maskBackendHost(BACKEND_URL)}</strong>. Revisa DNS (sin NXDOMAIN),
            variable <code style={{ color: '#7EB8D4' }}>REACT_APP_BACKEND_URL</code> en Vercel y que Railway esté en
            línea.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: '0 0 24px' }}>
            CORS: el backend debe permitir el origen de tu web (ej. <code>https://www.maqgo.cl</code>) en{' '}
            <code>CORS_ORIGINS</code>.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              type="button"
              className="maqgo-btn-primary"
              onClick={retryVerify}
              style={{ padding: '12px 20px', fontWeight: 600 }}
            >
              Reintentar conexión
            </button>
            <button
              type="button"
              className="maqgo-btn-secondary"
              onClick={enableDemoBypass}
              style={{ padding: '12px 20px' }}
            >
              Entrar en modo demostración (solo vista, sin API)
            </button>
            <button
              type="button"
              className="maqgo-btn-secondary"
              onClick={() => navigate('/', { replace: true })}
              style={{ padding: '10px 20px', marginTop: 8 }}
            >
              Volver a la portada
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--maqgo-bg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          color: '#fff',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <p style={{ fontSize: 24, fontWeight: 700, margin: '0 0 12px', color: '#E57373' }}>Acceso restringido</p>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 15, margin: 0, textAlign: 'center' }}>
          Este panel es solo para el dueño / equipo interno MAQGO.
        </p>
        <button
          type="button"
          className="maqgo-btn-secondary"
          onClick={() => navigate('/', { replace: true })}
          style={{ marginTop: 24 }}
        >
          Volver a la portada
        </button>
      </div>
    );
  }

  return <Outlet />;
}

export default AdminRoute;
