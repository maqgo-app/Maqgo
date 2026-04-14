import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { hasPersistedSessionCredentials } from '../utils/api';
import { traceRedirectToLogin } from '../utils/traceLoginRedirect';

/**
 * Protege rutas exclusivas de proveedor (titular/gerente/operador).
 * - Sin sesión: redirige a login con state.redirect para retomar tras login.
 * - Sesión de cliente puro: redirige a /client/home.
 * - Sesión de admin: redirige a /admin.
 *
 * Nota: ProviderOnboardingGate complementa este guard para onboarding;
 * ProviderRoute protege el acceso al namespace /provider/* a nivel de rol.
 */
function ProviderRoute() {
  const location = useLocation();
  const pathname = location.pathname;

  if (!hasPersistedSessionCredentials()) {
    traceRedirectToLogin('src/components/ProviderRoute.jsx');
    return (
      <Navigate
        to="/login"
        state={{ from: pathname, redirect: pathname, entry: 'provider' }}
        replace
      />
    );
  }

  const userRole = localStorage.getItem('userRole') || '';
  if (userRole === 'admin') {
    return <Navigate to="/admin" replace />;
  }
  if (userRole === 'client') {
    return <Navigate to="/client/home" replace />;
  }

  return <Outlet />;
}

export default ProviderRoute;
