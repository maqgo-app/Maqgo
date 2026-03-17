import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';

/**
 * Rutas públicas: no requieren sesión.
 * Cualquier otra ruta de cliente, proveedor u operador requiere userId en localStorage.
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
 * Rutas públicas → pasan. Rutas protegidas sin userId → redirige a Welcome.
 */
function ProtectedRoute() {
  const location = useLocation();
  const pathname = location.pathname;

  if (isPublicPath(pathname)) {
    return <Outlet />;
  }

  const userId = localStorage.getItem('userId');
  if (!userId) {
    return <Navigate to="/" state={{ from: pathname }} replace />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
