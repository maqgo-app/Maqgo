import React, { Suspense, useEffect, useMemo, useState } from 'react';
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
 * Lee el token Admin desde localStorage (helper único para evitar dispersión).
 */
function _readAdminTokenLs() {
  try {
    return localStorage.getItem('adminToken') || localStorage.getItem('adminAuthToken') || null;
  } catch {
    return null;
  }
}

/**
 * Dispara un CustomEvent síncrono para avisar a AdminRoute (y otros suscriptores)
 * que localStorage Admin cambió. Evita reload/navigate hard y fuerza re-render React.
 */
function dispatchAdminSessionChanged() {
  try {
    window.dispatchEvent(new CustomEvent('maqgo-admin-session-changed'));
  } catch {
    /* ignore */
  }
}

/**
 * Protege rutas /admin. Verifica /api/admin/access antes de mostrar el panel.
 * - Red caída/DNS: pantalla de bloqueo con reintentar o modo demostración (evita falsa sensación de "panel vivo").
 * - 401/403: revoca admin local y muestra acceso restringido.
 */
function AdminRoute() {
  const location = useLocation();
  const navigate = useNavigate();

  // R3 FIX: userId, token, rolesRaw son STATE React con suscripción a cambios localStorage.
  // Antes (L51-53 histórico): constantes sin suscriptor → submitAdminLogin save → navigate →
  //   MISMO componente AdminRoute sin remount → valores seguían null → volvía a render login form →
  //   401 children → flash /admin?expired=1 / error Chrome.
  const [userId, setUserId] = useState(() => {
    try { return localStorage.getItem('adminUserId'); } catch { return null; }
  });
  const [token, setToken] = useState(() => _readAdminTokenLs());
  const [rolesRaw, setRolesRaw] = useState(() => {
    try { return localStorage.getItem('adminRoles'); } catch { return null; }
  });

  // Suscriptor a cambios en localStorage (trigger por sí mismo / otras pestañas / session sync).
  useEffect(() => {
    function refreshFromLs() {
      try { setUserId(localStorage.getItem('adminUserId')); } catch { setUserId(null); }
      setToken(_readAdminTokenLs());
      try { setRolesRaw(localStorage.getItem('adminRoles')); } catch { setRolesRaw(null); }
    }
    function onStorage(e) {
      if (e.key && !e.key.startsWith('admin') && e.key !== 'adminAuthToken') return;
      refreshFromLs();
    }
    window.addEventListener('storage', onStorage);
    window.addEventListener('maqgo-admin-session-changed', refreshFromLs);
    refreshFromLs();
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('maqgo-admin-session-changed', refreshFromLs);
    };
  }, []);

  const [verifiedAdmin, setVerifiedAdmin] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(() => {
    try {
      return localStorage.getItem('adminMustChangePassword') === '1';
    } catch {
      return false;
    }
  });
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

  const shouldVerifyAdmin = Boolean(userId && token);
  const isAdminByStorage = shouldVerifyAdmin && Array.isArray(roles) && roles.includes('admin');

  /** Solo muestra bloqueo en la primera entrada o cuando vence el cache. */
  const [checkingAdmin, setCheckingAdmin] = useState(() => {
    if (!shouldVerifyAdmin) return false;
    if (!isAdminByStorage) return true;
    return Date.now() - getAdminVerifiedAt() > ADMIN_VERIFY_CACHE_TTL_MS;
  });

  useEffect(() => {
    let mounted = true;
    if (!shouldVerifyAdmin) {
      if (userId && !token) {
        clearAdminSession();
        clearAdminVerifiedCache();
        clearAdminDemoBypass();
      }
      setCheckingAdmin(false);
      setStatsNetworkFailure(false);
      setVerifiedAdmin(false);
      setMustChangePassword(false);
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
          if (res.status === 401) {
            clearAdminSession();
            clearAdminVerifiedCache();
            clearAdminDemoBypass();
            setDemoBypassState(false);
            // FIX R3: oficial access 401 → sync state React sin navigate, sin hard reload, sin ?expired=1.
            dispatchAdminSessionChanged();
          }
          setVerifiedAdmin(false);
          setMustChangePassword(false);
          setStatsNetworkFailure(false);
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
  }, [token, userId, shouldVerifyAdmin, isAdminByStorage, retryNonce]);

  /**
   * Suscriptor al ÚNICO evento de 401 oficial (solo desde /api/admin/access).
   * Regla 10O: NO navigate('...?expired=1'). NO window.location.href.
   * Solo re-sincroniza estado interno para que el render LOGIN inline se active
   * (token/userId fue clear en api.js CASO A → cae en bloque L278 render Login UI).
   */
  useEffect(() => {
    function onOfficialAccess401() {
      // SOLO sync state interno. NO navigate, NO push history, NO ?expired=1.
      clearAdminVerifiedCache();
      clearAdminDemoBypass();
      setVerifiedAdmin(false);
      setMustChangePassword(false);
      setStatsNetworkFailure(false);
      setDemoBypassState(false);
      setCheckingAdmin(false);
      setRetryNonce((n) => n + 1);
    }
    window.addEventListener('maqgo-admin-official-401', onOfficialAccess401);
    return () => window.removeEventListener('maqgo-admin-official-401', onOfficialAccess401);
  }, []);

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
    setStatsNetworkFailure(false);
    clearAdminDemoBypass();
    setDemoBypassState(false);
    const em = String(adminEmail || '').trim().toLowerCase();
    const pw = String(adminPassword || '');
    if (!em || !pw) {
      setAdminLoginError('Ingresa el correo y la contraseña de acceso.');
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
      // FIX R3: submitAdminLogin SÍ escribe localStorage.
      // - Antes: constantes userId/token/rolesRaw L51-53 no re-render React
      //   → volvía a L281 !token || !userId → FORM LOGIN OTRA VEZ sin hard reload
      //   → 401s children → flash /admin?expired=1.
      // - Ahora: dispatch event sincroniza el state React de AdminRoute (L87-105 suscriptor)
      //   sin hard reload ni navigate con ?expired=1.
      dispatchAdminSessionChanged();
      setVerifiedAdmin(true);
      setAdminVerifiedNow();
      setMustChangePassword(Boolean(data?.must_change_password));
      clearAdminVerifiedCache();
      setRetryNonce((n) => n + 1);
      if (Boolean(data?.must_change_password)) {
        navigate('/admin/change-password', { replace: true });
      } else {
        navigate('/admin', { replace: true });
      }
    } catch {
      setAdminLoginError('No hay conexión con el servidor MAQGO.');
    } finally {
      setAdminLoginLoading(false);
    }
  };

  if (!token || !userId) {
    return (
      <div
        className="maqgo-admin"
        style={{
          minHeight: '100vh',
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
            Acceso exclusivo para el equipo administrativo.
          </p>
          <form onSubmit={submitAdminLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
              Correo de acceso
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
              Contraseña de acceso
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
        className="maqgo-admin"
        style={{
          minHeight: '100vh',
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
        className="maqgo-admin"
        style={{
          minHeight: '100vh',
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
            variable <code style={{ color: '#7EB8D4' }}>VITE_BACKEND_URL</code> (o <code style={{ color: '#7EB8D4' }}>REACT_APP_BACKEND_URL</code> legacy) en Vercel y que Railway esté en línea.
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
        className="maqgo-admin"
        style={{
          minHeight: '100vh',
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
          Este panel es solo para el equipo interno de MAQGO.
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

  if (isAdmin && !mustChangePassword && isChangePasswordPath) {
    return <Navigate to="/admin" replace />;
  }
  if (isAdmin && mustChangePassword && !isChangePasswordPath) {
    return <Navigate to="/admin/change-password" replace />;
  }

  return (
    <div className="maqgo-admin">
      <Suspense
        fallback={
          <div
            style={{
              minHeight: '100vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              padding: 24,
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: 16, margin: 0 }}>Cargando panel administrativo…</p>
          </div>
        }
      >
        <Outlet />
      </Suspense>
    </div>
  );
}

export default AdminRoute;
