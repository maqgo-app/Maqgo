import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { hasPersistedSessionCredentials } from '../utils/api';
import { traceRedirectToLogin } from '../utils/traceLoginRedirect';

/**
 * Rutas públicas: no requieren sesión.
 * Cualquier otra ruta de cliente, proveedor u operador requiere sesión persistida
 * (token + userId) en localStorage.
 */
const PUBLIC_PATHS = [
  '/',
  '/welcome',
  '/register',
  '/login',
  '/forgot-password',
  '/verify-sms',
  '/verified',
  '/code-expired',
  '/code-incorrect',
  '/provider/register',
  '/provider/verify-sms',
  '/provider/verified',
  /** Machine-first: entrada sin JWT; OTP/alta inline en pantalla (ProviderOnboardingGate alinea perfil). */
  '/provider/add-machine',
  '/operator/join',
  '/faq',
  '/terms',
  '/privacy',
];

function isPublicPath(pathname) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
}

/**
 * Layout que protege rutas según sesión.
 * Rutas públicas → pasan. Rutas protegidas sin sesión válida → redirige a login.
 */
function ProtectedRoute() {
  const location = useLocation();
  const pathname = location.pathname;

  if (isPublicPath(pathname)) {
    return <Outlet />;
  }

  if (!hasPersistedSessionCredentials()) {
    // Mantener UX: si venían de Welcome y no hay sesión,
    // enviar a /login y al loguearse redirigir al destino original.
    traceRedirectToLogin('src/components/ProtectedRoute.jsx');
    return <Navigate to="/login" state={{ from: pathname, redirect: pathname }} replace />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
