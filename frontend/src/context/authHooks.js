import React, { useContext } from 'react';
import { AuthContext } from './AuthContext';

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}

export function withPermission(WrappedComponent, requiredPermission) {
  return function PermissionWrapper(props) {
    const { hasPermission, loading } = useAuth();
    if (loading) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#1a1a1a' }}>
          <p style={{ color: 'rgba(255,255,255,0.95)' }}>Cargando...</p>
        </div>
      );
    }
    if (!hasPermission(requiredPermission)) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#1a1a1a', padding: 20 }}>
          <p style={{ color: '#ff6b6b', fontSize: 18, marginBottom: 10 }}>Acceso restringido</p>
          <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 14, textAlign: 'center' }}>No tienes permisos para acceder a esta sección.</p>
        </div>
      );
    }
    return <WrappedComponent {...props} />;
  };
}
