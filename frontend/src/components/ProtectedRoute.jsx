import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { hasPersistedSessionCredentials } from '../utils/api';
import { traceRedirectToLogin } from '../utils/traceLoginRedirect';

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
  '/provider/add-machine',
  '/operator/join',
  '/faq',
  '/terms',
  '/privacy',
];

function isPublicPath(pathname) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function ProtectedRoute() {
  const location = useLocation();
  const pathname = location.pathname;
  const role = localStorage.getItem('role') || localStorage.getItem('userRole');

  if (isPublicPath(pathname)) {
    return <Outlet />;
  }

  if (!hasPersistedSessionCredentials()) {
    traceRedirectToLogin('src/components/ProtectedRoute.jsx');
    return <Navigate to="/login" state={{ from: pathname, redirect: pathname }} replace />;
  }

  const isClientPath = pathname.startsWith('/client/');
  const isProviderPath = pathname.startsWith('/provider/');

  if (role === 'client' && isProviderPath) {
    return <Navigate to="/client/home" replace />;
  }

  if (role === 'provider' && isClientPath) {
    return <Navigate to="/provider/home" replace />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
