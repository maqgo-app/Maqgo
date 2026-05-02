import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { hasPersistedSessionCredentials } from '../utils/api';

/**
 * Onboarding proveedor: con sesión JWT se muestran pasos posteriores a máquina (fotos, tarifas, etc.).
 * Sin sesión → `/provider/register` como fallback (OTP/registro).
 *
 * Regla actual: sin sesión (token + userId) → exigir OTP en /login.
 */
function ProviderOnboardingGate({ children }) {
  const location = useLocation();
  const isProviderRegisterFlow = location.pathname.includes('/provider/register');

  if (!hasPersistedSessionCredentials() && !isProviderRegisterFlow) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          redirect: `${location.pathname}${location.search || ''}`,
          entry: 'provider',
        }}
      />
    );
  }
  return children;
}

export default ProviderOnboardingGate;
