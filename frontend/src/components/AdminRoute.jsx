import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import BACKEND_URL, { clearAdminSession, fetchWithAuth } from '../utils/api';
import {
  maskBackendHost,
  getAdminDemoBypass,
  setAdminDemoBypass,
  clearAdminDemoBypass,
} from '../utils/apiHealth';
import { establishAdminSession, persistAdminSessionMetadata } from '../utils/sessionPersistence';

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
  const userId = localStorage.getItem('adminUserId');
  const token = localStorage.getItem('adminToken') || localStorage.getItem('adminAuthToken');
  const rolesRaw = localStorage.getItem('adminRoles');
  const [verifiedAdmin, setVerifiedAdmin] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  /** Tras primer intento de verificación: true si falló la red y el usuario creía ser admin. */
  const [statsNetworkFailure, setStatsNetworkFailure] = useState(false);
  const [demoBypass, setDemoBypassState] = useState(() => getAdminDemoBypass());

  const roles = useMemo(() => {
    try {
      return rolesRaw ? JSON.parse(rolesRaw) : [];
    } catch {
      return [];
    }
  }, [rolesRaw]);

  const isAdminByStorage = Array.isArray(roles) && roles.includes('admin');
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
          `${BACKEND_URL}/api/admin/access`,
          { method: 'GET', redirectOn401: false },
          VERIFY_TIMEOUT_MS
        );
        if (!mounted) return;

        if (res.ok) {
          let payload = null;
          try {
            payload = await res.json();
          } catch {
            payload = null;
          }
          try {
            localStorage.setItem('adminRoles', JSON.stringify(['admin']));
          } catch {
            /* ignore */
          }
          setVerifiedAdmin(true);
          setAdminVerifiedNow();
          setStatsNetworkFailure(false);
          clearAdminDemoBypass();
          setDemoBypassState(false);
          const must = Boolean(payload?.must_change_password);
          setMustChangePassword(must);
          if (must) {
            localStorage.setItem('adminMustChangePassword', '1');
          } else {
            localStorage.removeItem('adminMustChangePassword');
          }
          if (payload?.email) {
            localStorage.setItem('adminEmail', payload.email);
          }
        } else if (res.status === 401 || res.status === 403) {
          clearAdminSession();
          setVerifiedAdmin(false);
          setMustChangePassword(false);
          clearAdminVerifiedCache();
          setStatsNetworkFailure(false);
          clearAdminDemoBypass();
          setDemoBypassState(false);
        } else {
          setVerifiedAdmin(isAdminByStorage);
          setMustChangePassword(localStorage.getItem('adminMustChangePassword') === '1');
          if (!isAdminByStorage) clearAdminVerifiedCache();
          setStatsNetworkFailure(false);
        }
      } catch {
        if (!mounted) return;
        setVerifiedAdmin(isAdminByStorage);
        setMustChangePassword(localStorage.getItem('adminMustChangePassword') === '1');
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
  const isChangePasswordPath = location.pathname === '/admin/change-password';

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

  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoginError, setAdminLoginError] = useState('');
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);

  const submitAdminLogin = async (e) => {
    e.preventDefault();
    if (adminLoginLoading) return;
    setAdminLoginError('');
    const em = String(adminEmail || '').trim().toLowerCase();
    const pw = String(adminPassword || '');
    if (!em || !pw) {
      setAdminLoginError('Ingresa tu correo y contraseña.');
      return;
    }
    setAdminLoginLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: em, password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAdminLoginError(typeof data?.detail === 'string' ? data.detail : 'Credenciales inválidas.');
        return;
      }
      const roles = Array.isArray(data?.roles) ? data.roles : [];
      const isAdmin = data?.role === 'admin' || roles.includes('admin');
      if (!isAdmin) {
        clearAdminSession();
        setAdminLoginError('Acceso restringido a administradores.');
        return;
      }
      if (!establishAdminSession(data)) {
        setAdminLoginError('No se pudo crear la sesión.');
        return;
      }
      persistAdminSessionMetadata(data);
      try {
        localStorage.setItem('adminRoles', JSON.stringify(roles.length ? roles : ['admin']));
      } catch {
        /* ignore */
      }
      clearAdminVerifiedCache();
      setRetryNonce((n) => n + 1);
      navigate('/admin', { replace: true });
    } catch {
      setAdminLoginError('No hay conexión con el servidor MAQGO.');
    } finally {
      setAdminLoginLoading(false);
    }
  };

  if (!token || !userId) {
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
        <div style={{ width: '100%', maxWidth: 420 }}>
          <h1 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 800 }}>Panel Administrativo</h1>
          <p style={{ margin: '0 0 18px', color: 'rgba(255,255,255,0.65)', fontSize: 13, lineHeight: 1.5 }}>
            Acceso exclusivo para el equipo MAQGO.
          </p>
          <form onSubmit={submitAdminLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
              Correo
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                disabled={adminLoginLoading}
                autoComplete="email"
                style={{
                  marginTop: 6,
                  width: '100%',
                  padding: '12px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.16)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  outline: 'none',
                }}
              />
            </label>
            <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
              Contraseña
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                disabled={adminLoginLoading}
                autoComplete="current-password"
                style={{
                  marginTop: 6,
                  width: '100%',
                  padding: '12px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.16)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  outline: 'none',
                }}
              />
            </label>

            {adminLoginError && (
              <div style={{ color: '#E57373', fontSize: 13, lineHeight: 1.4 }}>{adminLoginError}</div>
            )}

            <button
              type="submit"
              className="maqgo-btn-primary"
              disabled={adminLoginLoading}
              style={{ marginTop: 4 }}
            >
              {adminLoginLoading ? 'Ingresando…' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    );
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
          className="maqgo-btn-primary"
          onClick={() => {
            clearAdminSession();
            clearAdminVerifiedCache();
            clearAdminDemoBypass();
            navigate('/admin', { replace: true });
          }}
          style={{ marginTop: 18, width: 'min(420px, 100%)' }}
        >
          Ingresar con cuenta admin
        </button>
        <button
          type="button"
          className="maqgo-btn-secondary"
          onClick={() => navigate('/', { replace: true })}
          style={{ marginTop: 12, width: 'min(420px, 100%)' }}
        >
          Volver a la portada
        </button>
      </div>
    );
  }

  if (isAdmin && mustChangePassword && !isChangePasswordPath) {
    return <Navigate to="/admin/change-password" replace />;
  }
  if (isAdmin && !mustChangePassword && isChangePasswordPath) {
    return <Navigate to="/admin" replace />;
  }

  return <Outlet />;
}

export default AdminRoute;
