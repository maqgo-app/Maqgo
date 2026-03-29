import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';

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
  '/select-channel',
  '/verify-sms',
  '/verified',
  '/select-role',
  '/code-expired',
  '/code-incorrect',
  '/provider/register',
  '/provider/select-channel',
  '/provider/verify-sms',
  '/provider/verified',
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

  const userId = localStorage.getItem('userId');
  const token = localStorage.getItem('token');
  if (!userId || !token) {
    // Mantener UX: si venían de Welcome y no hay sesión,
    // enviar a /login y al loguearse redirigir al destino original.
    return <Navigate to="/login" state={{ from: pathname, redirect: pathname }} replace />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
