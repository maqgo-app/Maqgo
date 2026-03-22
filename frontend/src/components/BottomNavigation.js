import React from 'react';
import { Z_INDEX } from '../constants/zIndex';
import { useNavigate, useLocation } from 'react-router-dom';
import { clearAuthSessionPreservingDraft } from '../utils/sessionCleanup';

/**
 * Ítem de navegación
 * isPrimary: Inicio - destaca más cuando está activo
 */
const NavItem = ({ icon, label, active, onClick, isPrimary }) => (
  <button
    type="button"
    onClick={(e) => { e.preventDefault(); onClick?.(); }}
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      background: isPrimary && active ? 'rgba(236, 104, 25, 0.25)' : 'none',
      border: isPrimary && active ? '1px solid rgba(236, 104, 25, 0.6)' : 'none',
      borderRadius: 10,
      padding: '5px 10px',
      cursor: 'pointer',
      minWidth: isPrimary ? 64 : 56
    }}
  >
    <div style={{ color: active ? '#EC6819' : 'rgba(255,255,255,0.7)' }}>
      {icon}
    </div>
    <span style={{
      fontSize: isPrimary ? 11 : 10,
      fontWeight: active ? 700 : 400,
      color: active ? '#EC6819' : 'rgba(255,255,255,0.7)'
    }}>
      {label}
    </span>
  </button>
);

// Iconos SVG
const Icons = {
  home: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M3 12L5 10M5 10L12 3L19 10M5 10V20C5 20.5523 5.44772 21 6 21H9M19 10L21 12M19 10V20C19 20.5523 18.5523 21 18 21H15M9 21C9.55228 21 10 20.5523 10 20V16C10 15.4477 10.4477 15 11 15H13C13.5523 15 14 15.4477 14 16V20C14 20.5523 14.4477 21 15 21M9 21H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  history: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  profile: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 14C8.13401 14 5 17.134 5 21H19C19 17.134 15.866 14 12 14Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  machinery: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="14" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="2"/>
      <rect x="16" y="14" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="2"/>
      <path d="M8 17H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M10 14V8C10 6.89543 10.8954 6 12 6V6C13.1046 6 14 6.89543 14 8V14" stroke="currentColor" strokeWidth="2"/>
      <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  money: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 6V18M9 9C9 7.89543 10.3431 7 12 7C13.6569 7 15 7.89543 15 9C15 10.1046 13.6569 11 12 11C10.3431 11 9 11.8954 9 13C9 14.1046 10.3431 15 12 15C13.6569 15 15 14.1046 15 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  logout: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M9 21H6C4.89543 21 4 20.1046 4 19V5C4 3.89543 4.89543 3 6 3H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 17L21 12L16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
};

function logoutAndGoWelcome(navigate) {
  const confirmed = window.confirm('¿Quieres cerrar sesión ahora?');
  if (!confirmed) return;
  clearAuthSessionPreservingDraft();
  navigate('/welcome');
}

/**
 * Navega al "Home" correcto según sesión y rol:
 * - Sin sesión → Welcome
 * - Cliente → ClientHome (reserva inmediata/programada)
 * - Proveedor → ProviderHome
 * - Operador → OperatorHome
 */
function goToHome(navigate) {
  const userRole = localStorage.getItem('userRole');
  const userId = localStorage.getItem('userId');
  const providerRole = localStorage.getItem('providerRole');
  if (!userId || !userRole) {
    navigate('/welcome');
    return;
  }
  if (userRole === 'provider' || userRole === 'owner' || userRole === 'manager') {
    navigate(providerRole === 'operator' ? '/operator/home' : '/provider/home');
  } else {
    navigate('/client/home');
  }
}

/**
 * Navegación inferior para CLIENTE
 * Inicio | Historial | Perfil
 */
export function ClientNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const isActive = (path) => location.pathname.includes(path);

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: '#1A1A1F',
      borderTop: '1px solid rgba(255,255,255,0.1)',
      display: 'flex',
      justifyContent: 'space-around',
      alignItems: 'center',
      padding: '4px 0',
      paddingBottom: 'max(4px, env(safe-area-inset-bottom))',
      zIndex: Z_INDEX.overlay
    }}>
      <NavItem
        active={isActive('/client/home') || location.pathname === '/client/machinery'}
        onClick={() => goToHome(navigate)}
        label="Inicio"
        icon={Icons.home}
        isPrimary
      />
      <NavItem
        active={isActive('/client/history')}
        onClick={() => navigate('/client/history')}
        label="Historial"
        icon={Icons.history}
      />
      <NavItem
        active={isActive('/profile')}
        onClick={() => navigate('/profile')}
        label="Perfil"
        icon={Icons.profile}
      />
      <NavItem
        active={false}
        onClick={() => logoutAndGoWelcome(navigate)}
        label="Salir"
        icon={Icons.logout}
      />
    </div>
  );
}

/**
 * Navegación inferior para PROVEEDOR (Titular/Gerente)
 * Inicio | Máquinas | Perfil (Cobros se accede desde Perfil)
 */
export function ProviderNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const providerRole = localStorage.getItem('providerRole') || 'owner';
  
  // Operadores solo ven: Inicio | Historial | Perfil (sin Cobros ni Máquinas)
  const isOperatorOnly = providerRole === 'operator';
  
  const isActive = (paths) => {
    if (Array.isArray(paths)) {
      return paths.some(p => location.pathname.includes(p));
    }
    return location.pathname.includes(paths);
  };

  // Navegación para Operador (sin Cobros ni Máquinas)
  if (isOperatorOnly) {
    return (
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#1A1A1F',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
      padding: '4px 0',
      paddingBottom: 'max(4px, env(safe-area-inset-bottom))',
      zIndex: Z_INDEX.overlay
    }}>
        <NavItem
          active={isActive('/operator/home')}
          onClick={() => goToHome(navigate)}
          label="Inicio"
          icon={Icons.home}
          isPrimary
        />
        <NavItem
          active={isActive('/provider/history')}
          onClick={() => navigate('/provider/history')}
          label="Historial"
          icon={Icons.history}
        />
        <NavItem
          active={isActive('/provider/profile')}
          onClick={() => navigate('/provider/profile')}
          label="Perfil"
          icon={Icons.profile}
        />
        <NavItem
          active={false}
          onClick={() => logoutAndGoWelcome(navigate)}
          label="Salir"
          icon={Icons.logout}
        />
      </div>
    );
  }

  // Navegación para Titular/Gerente (completa)
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: '#1A1A1F',
      borderTop: '1px solid rgba(255,255,255,0.1)',
      display: 'flex',
      justifyContent: 'space-around',
      alignItems: 'center',
      padding: '4px 0',
      paddingBottom: 'max(4px, env(safe-area-inset-bottom))',
      zIndex: Z_INDEX.overlay
    }}>
      <NavItem
        active={isActive('/provider/home')}
        onClick={() => goToHome(navigate)}
        label="Inicio"
        icon={Icons.home}
        isPrimary
      />
      <NavItem
        active={isActive(['/provider/machines', '/provider/pricing'])}
        onClick={() => navigate('/provider/machines')}
        label="Máquinas"
        icon={Icons.machinery}
      />
      <NavItem
        active={isActive('/provider/profile')}
        onClick={() => navigate('/provider/profile')}
        label="Perfil"
        icon={Icons.profile}
      />
      <NavItem
        active={false}
        onClick={() => logoutAndGoWelcome(navigate)}
        label="Salir"
        icon={Icons.logout}
      />
    </div>
  );
}

/**
 * Componente que detecta el rol y muestra la navegación correcta
 */
function BottomNavigation() {
  const userRole = localStorage.getItem('userRole') || 'client';
  
  if (userRole === 'provider' || userRole === 'owner' || userRole === 'manager') {
    return <ProviderNavigation />;
  }
  
  return <ClientNavigation />;
}

export default BottomNavigation;
