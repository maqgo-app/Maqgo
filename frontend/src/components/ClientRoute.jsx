import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/authHooks';
import { traceRedirectToLogin } from '../utils/traceLoginRedirect';

/**
 * Protege rutas exclusivas del rol cliente.
 *
 * Usa AuthContext (fuente única de verdad) en lugar de leer localStorage
 * directamente, para que el rol se actualice cuando hydrateFromMe completa.
 *
 * - Sin usuario: redirige a /login con state.redirect.
 * - Admin: redirige a /admin.
 * - Proveedor/operador: redirige al home de su rol.
 * - Mientras carga (hidratación API): no bloquea navegación (user viene de
 *   localStorage sync y ya tiene rol; loading solo indica re-validación).
 */
function ClientRoute() {
  const location = useLocation();
  const { user, providerRole } = useAuth();

  if (!user) {
    traceRedirectToLogin('src/components/ClientRoute.jsx');
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname, redirect: location.pathname }}
        replace
      />
    );
  }

  const role = user.role || '';
  if (role === 'admin') {
    return <Navigate to="/admin" replace />;
  }
  if (role === 'provider' || role === 'owner' || role === 'manager') {
    return (
      <Navigate
        to={providerRole === 'operator' ? '/operator/home' : '/provider/home'}
        replace
      />
    );
  }

  return <Outlet />;
}

export default ClientRoute;

