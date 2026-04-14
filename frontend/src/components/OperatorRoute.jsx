import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/authHooks';
import { traceRedirectToLogin } from '../utils/traceLoginRedirect';

/**
 * Protege rutas exclusivas de operador.
 *
 * Usa AuthContext (fuente única de verdad). `providerRole` proviene de la API
 * tras hydratación, por lo que es más fiable que leer 'providerRole' de LS.
 *
 * - Sin usuario: redirige a /login.
 * - Cliente puro: redirige a /client/home.
 * - Admin: redirige a /admin.
 * - Proveedor titular (no operator): redirige a /provider/home.
 */
function OperatorRoute() {
  const location = useLocation();
  const { user, providerRole } = useAuth();

  if (!user) {
    traceRedirectToLogin('src/components/OperatorRoute.jsx');
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
  if (role === 'client') {
    return <Navigate to="/client/home" replace />;
  }
  if (
    (role === 'provider' || role === 'owner' || role === 'manager') &&
    providerRole !== 'operator'
  ) {
    return <Navigate to="/provider/home" replace />;
  }

  return <Outlet />;
}

export default OperatorRoute;

