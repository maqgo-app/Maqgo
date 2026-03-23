import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import BACKEND_URL, { fetchWithAuth } from '../utils/api';

/**
 * Protege las rutas administrativas. Solo usuarios con role 'admin' pueden acceder.
 * - No logueado → redirige a /login con redirect a /admin
 * - Logueado pero no admin → muestra "Acceso restringido"
 * Usar una sola vez como layout (`<Route path="/admin" element={<AdminRoute />}>` + rutas hijas)
 * para no re-verificar en cada cambio de sub-ruta.
 */
function AdminRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const userId = localStorage.getItem('userId');
  const userRole = localStorage.getItem('userRole');
  const token = localStorage.getItem('token');
  const userRolesRaw = localStorage.getItem('userRoles');
  const [verifiedAdmin, setVerifiedAdmin] = useState(false);

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
  // Si ya hay rol admin en storage, no bloquear la UI en cada montaje; la verificación sigue en background.
  const [checkingAdmin, setCheckingAdmin] = useState(
    () => Boolean(shouldVerifyAdmin && !isAdminByStorage)
  );

  useEffect(() => {
    let mounted = true;
    if (!shouldVerifyAdmin) {
      return () => {};
    }

    (async () => {
      try {
        const res = await fetchWithAuth(
          `${BACKEND_URL}/api/admin/stats`,
          { method: 'GET', redirectOn401: false },
          5000
        );
        if (!mounted) return;
        if (res.ok) {
          localStorage.setItem('userRole', 'admin');
          setVerifiedAdmin(true);
        } else {
          // Solo revocamos el rol local si backend confirma falta de permisos/sesión.
          if (res.status === 401 || res.status === 403) {
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
            return;
          }
          // Ante errores del servidor, preservamos el rol local para evitar falsos bloqueos.
          setVerifiedAdmin(isAdminByStorage);
        }
      } catch {
        if (!mounted) return;
        // Evita falsos "Acceso restringido" por fallas transitorias de red/CORS.
        setVerifiedAdmin(isAdminByStorage);
      } finally {
        if (mounted) setCheckingAdmin(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [token, shouldVerifyAdmin, isAdminByStorage]);

  const isAdmin = verifiedAdmin || isAdminByStorage;

  if (!userId) {
    return <Navigate to="/login" state={{ from: location.pathname, redirect: '/admin' }} replace />;
  }

  if (checkingAdmin) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--maqgo-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
        Verificando permisos...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--maqgo-bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        color: '#fff',
        fontFamily: "'Inter', sans-serif"
      }}>
        <p style={{ fontSize: 24, fontWeight: 700, margin: '0 0 12px', color: '#F44336' }}>
          Acceso restringido
        </p>
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
