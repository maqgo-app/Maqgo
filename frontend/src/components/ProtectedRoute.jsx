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
  const role = localStorage.getItem('role');

  if (isPublicPath(pathname)) {
    return <Outlet />;
  }

  if (!hasPersistedSessionCredentials()) {
    // Mantener UX: si venían de Welcome y no hay sesión,
    // enviar a /login y al loguearse redirigir al destino original.
    traceRedirectToLogin('src/components/ProtectedRoute.jsx');
    return <Navigate to="/login" state={{ from: pathname, redirect: pathname }} replace />;
  }

  // Validación estricta de rol - evitar rutas cruzadas
  if (role) {
    const isClientPath = pathname.startsWith('/client/');
    const isProviderPath = pathname.startsWith('/provider/');
    
    if (role === 'client' && isProviderPath) {
      return <Navigate to="/client/home" replace />;
    }
    
    if (role === 'provider' && isClientPath) {
      return <Navigate to="/provider/home" replace />;
    }
  }

  return <Outlet />;
}

export default ProtectedRoute;
