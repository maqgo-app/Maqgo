import React, { useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

function buildDemoSession(role) {
  const now = new Date().toISOString();
  const token = `dev-${role}-token`;
  const base = {
    token,
    authToken: token,
    userId: `dev-${role}-001`,
    legalAcceptedAt: now,
  };

  if (role === 'provider') {
    return {
      ...base,
      userRole: 'provider',
      providerRole: 'super_master',
      ownerId: 'dev-provider-owner-001',
      providerAvailable: 'true',
    };
  }

  if (role === 'operator') {
    return {
      ...base,
      userRole: 'operator',
      providerRole: 'operator',
      ownerId: 'dev-provider-owner-001',
      providerAvailable: 'true',
    };
  }

  return {
    ...base,
    userRole: 'client',
  };
}

export default function DevSessionRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  if (!import.meta.env.DEV) return <Navigate to="/welcome" replace />;

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const roleRaw = String(params.get('role') || 'client').toLowerCase();
    const role = roleRaw === 'provider' || roleRaw === 'operator' ? roleRaw : 'client';
    const redirectRaw = String(params.get('redirect') || '').trim();
    const redirect = redirectRaw.startsWith('/') ? redirectRaw : `/${redirectRaw}`;

    const session = buildDemoSession(role);
    for (const [k, v] of Object.entries(session)) {
      try {
        localStorage.setItem(k, String(v));
      } catch {
        /* ignore */
      }
    }

    navigate(redirect === '/' ? '/welcome' : redirect, { replace: true });
  }, [location.search, navigate]);

  return <div className="maqgo-app"><div className="maqgo-screen" /></div>;
}

