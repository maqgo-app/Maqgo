import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { hasPersistedSessionCredentials } from '../utils/api';

/**
 * Onboarding proveedor:
 * - Con sesión JWT: permite continuar.
 * - Sin sesión JWT: deriva a `/provider/register` (OTP como cliente), manteniendo redirect.
 */

function ProviderOnboardingGate({ children }) {
  const location = useLocation();
  const isProviderRegisterFlow = location.pathname.includes('/provider/register');

  if (!hasPersistedSessionCredentials() && !isProviderRegisterFlow) {
    return (
      <Navigate
        to="/provider/register"
        replace
        state={{
          redirect: `${location.pathname}${location.search || ''}`,
        }}
      />
    );
  }
  return children;
}

export default ProviderOnboardingGate;
