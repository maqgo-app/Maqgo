import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

/**
 * Protege las rutas administrativas. Solo usuarios con role 'admin' pueden acceder.
 * - No logueado → redirige a /login con redirect a /admin
 * - Logueado pero no admin → muestra "Acceso restringido"
 */
function AdminRoute({ children }) {
  const location = useLocation();
  const userId = localStorage.getItem('userId');
  const userRole = localStorage.getItem('userRole');

  if (!userId) {
    return <Navigate to="/login" state={{ from: location.pathname, redirect: '/admin' }} replace />;
  }

  if (userRole !== 'admin') {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0F0F12',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        color: '#fff',
        fontFamily: "'Inter', sans-serif"
      }}>
        <p style={{ fontSize: 24, fontWeight: 700, margin: '0 0 12px', color: '#F44336' }}>
          Acceso restringido
        </p>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 15, margin: 0, textAlign: 'center' }}>
          Solo el equipo MAQGO puede acceder al panel de administración.
        </p>
        <button type="button" className="maqgo-btn-secondary" onClick={() => window.history.back()} style={{ marginTop: 24 }}>
          Volver
        </button>
      </div>
    );
  }

  return children;
}

export default AdminRoute;
