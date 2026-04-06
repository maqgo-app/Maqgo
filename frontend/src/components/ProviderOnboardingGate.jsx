import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { hasPersistedSessionCredentials } from '../utils/api';

/**
 * Onboarding proveedor: con sesión JWT se muestran pasos posteriores a máquina (fotos, tarifas, etc.).
 * Sin sesión → `/provider/register` como fallback (OTP/registro).
 *
 * Machine-first: `/provider/add-machine` también es ruta pública (`ProtectedRoute`); aquí se permite
 * sin JWT para que el gate no bloquee la entrada (OTP/alta inline en pantalla).
 */
function isAddMachineRoute(pathname) {
  const p = String(pathname || '').replace(/\/+$/, '') || '/';
  return p === '/provider/add-machine';
}

function ProviderOnboardingGate({ children }) {
  const location = useLocation();
  const isProviderRegisterFlow = location.pathname.includes('/provider/register');

  if (isAddMachineRoute(location.pathname)) {
    return children;
  }

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
