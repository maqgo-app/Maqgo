import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { hasPersistedSessionCredentials } from '../utils/api';
import { traceRedirectToLogin } from '../utils/traceLoginRedirect';

/**
 * Protege rutas exclusivas del rol cliente.
 * - Sin sesión: redirige a login con state.redirect.
 * - Sesión de proveedor/operador: redirige al home del rol real.
 */
function ClientRoute() {
  const location = useLocation();
  const pathname = location.pathname;

  if (!hasPersistedSessionCredentials()) {
    traceRedirectToLogin('src/components/ClientRoute.jsx');
    return (
      <Navigate
        to="/login"
        state={{ from: pathname, redirect: pathname }}
        replace
      />
    );
  }

  const userRole = localStorage.getItem('userRole') || 'client';
  if (userRole === 'admin') {
    return <Navigate to="/admin" replace />;
  }
  if (userRole === 'provider' || userRole === 'owner' || userRole === 'manager') {
    const providerRole = localStorage.getItem('providerRole');
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
