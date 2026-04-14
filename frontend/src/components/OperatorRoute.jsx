import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { hasPersistedSessionCredentials } from '../utils/api';
import { traceRedirectToLogin } from '../utils/traceLoginRedirect';

/**
 * Protege rutas exclusivas de operador.
 * - Sin sesión: redirige a login.
 * - Sesión de cliente puro: redirige a /client/home.
 * - Sesión de admin: redirige a /admin.
 * - Proveedor titular (no operator): redirige a /provider/home.
 */
function OperatorRoute() {
  const location = useLocation();
  const pathname = location.pathname;

  if (!hasPersistedSessionCredentials()) {
    traceRedirectToLogin('src/components/OperatorRoute.jsx');
    return (
      <Navigate
        to="/login"
        state={{ from: pathname, redirect: pathname }}
        replace
      />
    );
  }

  const userRole = localStorage.getItem('userRole') || '';
  const providerRole = localStorage.getItem('providerRole') || '';

  if (userRole === 'admin') {
    return <Navigate to="/admin" replace />;
  }
  if (userRole === 'client') {
    return <Navigate to="/client/home" replace />;
  }
  if (
    (userRole === 'provider' || userRole === 'owner' || userRole === 'manager') &&
    providerRole !== 'operator'
  ) {
    return <Navigate to="/provider/home" replace />;
  }

  return <Outlet />;
}

export default OperatorRoute;
