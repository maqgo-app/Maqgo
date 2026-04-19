import React from 'react';
import { Navigate } from 'react-router-dom';
import { traceRedirectToLogin } from '../utils/traceLoginRedirect';

/**
 * Rutas legacy o redirecciones forzadas al login.
 * Separado de App.jsx para evitar dependencias circulares.
 */
export function AppNavigateToLogin({ trace, state }) {
  if (trace) {
    traceRedirectToLogin(trace);
  }
  return <Navigate to="/login" replace state={state} />;
}
