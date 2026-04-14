import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/authHooks';
import { traceRedirectToLogin } from '../utils/traceLoginRedirect';

/**
 * Protege rutas exclusivas de proveedor (titular/gerente).
 *
 * Usa AuthContext (fuente única de verdad) para decisiones de rol.
 * ProviderOnboardingGate complementa este guard para secuencia de onboarding;
 * ProviderRoute solo verifica que la sesión activa sea de rol proveedor.
 *
 * - Sin usuario: redirige a /login preservando destino (para retomar tras login).
 * - Cliente puro: redirige a /client/home.
 * - Admin: redirige a /admin.
 */
function ProviderRoute() {
  const location = useLocation();
  const { user } = useAuth();

  if (!user) {
    traceRedirectToLogin('src/components/ProviderRoute.jsx');
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname, redirect: location.pathname, entry: 'provider' }}
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

  return <Outlet />;
}

export default ProviderRoute;

