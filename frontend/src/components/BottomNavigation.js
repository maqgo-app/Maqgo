import React, { useEffect, useMemo, useState } from 'react';
import { Z_INDEX } from '../constants/zIndex';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { getProviderLandingPath } from '../utils/providerOnboardingStatus';
import { getSessionRole, isProviderSession } from '../utils/userAuthState';
import { useAuth } from '../context/authHooks';
import { fetchUnreadCount } from '../utils/notificationsClient';

/**
 * Ítem de navegación
 * isPrimary: Inicio - destaca más cuando está activo
 */
const NavItem = ({ icon, label, active, onClick, isPrimary, badgeCount }) => (
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
    <div style={{ position: 'relative', color: active ? '#EC6819' : 'rgba(255,255,255,0.7)' }}>
      {icon}
      {badgeCount > 0 ? (
        <span
          style={{
            position: 'absolute',
            top: -2,
            right: -6,
            minWidth: 16,
            height: 16,
            padding: '0 5px',
            borderRadius: 999,
            background: '#EC6819',
            color: '#fff',
            fontSize: 10,
            fontWeight: 900,
            lineHeight: '16px',
            textAlign: 'center',
            boxShadow: '0 2px 10px rgba(236, 104, 25, 0.30)',
          }}
        >
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      ) : null}
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
  avisos: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M15 17H9C7.89543 17 7 16.1046 7 15V11C7 8.23858 9.23858 6 12 6C14.7614 6 17 8.23858 17 11V15C17 16.1046 16.1046 17 15 17Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 17C10 18.1046 10.8954 19 12 19C13.1046 19 14 18.1046 14 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 11V10C7 7.23858 9.23858 5 12 5C14.7614 5 17 7.23858 17 10V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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

function goToPortada(navigate) {
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
  const userRole = getSessionRole();
  const userId = localStorage.getItem('userId');
  const providerRole = localStorage.getItem('providerRole') || 'owner';

  console.log("CURRENT ROLE (goToHome):", userRole);
  console.log("CURRENT USER ID:", userId);
  
  if (!userId || !userRole) {
    console.log("NO USER ID OR ROLE - redirecting to welcome");
    navigate('/welcome');
    return;
  }

  if (userRole === 'admin') {
    console.log("ADMIN ROLE - redirecting to /admin");
    navigate('/admin');
    return;
  }

  if (isProviderSession()) {
    console.log("PROVIDER ROLE - redirecting to provider home");
    navigate(providerRole === 'operator' ? '/operator/home' : getProviderLandingPath());
  } else {
    console.log("CLIENT ROLE - redirecting to /client/home");
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
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;

  const [unreadAvisos, setUnreadAvisos] = useState(0);

  const isClientSession = useMemo(() => {
    const userRole = getSessionRole();
    const userId = localStorage.getItem('userId');
    return Boolean(userId && userRole === 'client');
  }, []);
  
  const isActive = (path) => location.pathname.includes(path);

  const dockStyle = isDesktop
    ? { left: '50%', right: 'auto', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, borderRadius: '0 0 40px 40px' }
    : { left: 0, right: 0, transform: 'none', width: 'auto', maxWidth: 'none', borderRadius: 0 };

  useEffect(() => {
    if (!isClientSession) return;
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    if (!token) return;

    let mounted = true;

    const load = async () => {
      try {
        const res = await fetchUnreadCount();
        if (!mounted) return;
        const nextVal = Number(res?.unread || 0);
        setUnreadAvisos(Number.isFinite(nextVal) ? nextVal : 0);
      } catch {
        if (!mounted) return;
        setUnreadAvisos(0);
      }
    };

    load();
    const id = window.setInterval(load, 20000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [isClientSession]);

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      ...dockStyle,
      background: '#1A1A1F',
      borderTop: '1px solid rgba(255,255,255,0.1)',
      display: 'flex',
      justifyContent: 'space-around',
      alignItems: 'center',
      padding: '4px 0',
      paddingBottom: 'max(4px, env(safe-area-inset-bottom))',
      zIndex: Z_INDEX.fixedBar
    }}>
      <NavItem
        active={isActive('/client/home') || location.pathname === '/client/machinery'}
        onClick={() => goToHome(navigate)}
        label="Inicio"
        icon={Icons.home}
        isPrimary
      />
      <NavItem
        active={isActive('/client/avisos')}
        onClick={() => navigate('/client/avisos')}
        label="Avisos"
        icon={Icons.avisos}
        badgeCount={unreadAvisos}
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
  const { can } = useAuth();
  const providerRole = localStorage.getItem('providerRole') || 'owner';
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;

  const [unreadAvisos, setUnreadAvisos] = useState(0);

  const isProviderSessionOk = useMemo(() => {
    const userRole = getSessionRole();
    const userId = localStorage.getItem('userId');
    return Boolean(userId && userRole === 'provider');
  }, []);
  
  // Operadores solo ven: Inicio | Historial | Perfil (sin Cobros ni Máquinas)
  const isOperatorOnly = providerRole === 'operator';
  
  const isActive = (paths) => {
    if (Array.isArray(paths)) {
      return paths.some(p => location.pathname.includes(p));
    }
    return location.pathname.includes(paths);
  };

  useEffect(() => {
    if (!isProviderSessionOk) return;
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    if (!token) return;

    let mounted = true;

    const load = async () => {
      try {
        const res = await fetchUnreadCount();
        if (!mounted) return;
        const nextVal = Number(res?.unread || 0);
        setUnreadAvisos(Number.isFinite(nextVal) ? nextVal : 0);
      } catch {
        if (!mounted) return;
        setUnreadAvisos(0);
      }
    };

    load();
    const id = window.setInterval(load, 20000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [isProviderSessionOk]);

  // Navegación para Operador (sin Cobros ni Máquinas)
  if (isOperatorOnly) {
    const dockStyle = isDesktop
      ? { left: '50%', right: 'auto', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, borderRadius: '0 0 40px 40px' }
      : { left: 0, right: 0, transform: 'none', width: 'auto', maxWidth: 'none', borderRadius: 0 };

    return (
      <div style={{
        position: 'fixed',
        bottom: 0,
        ...dockStyle,
        background: '#1A1A1F',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
      padding: '4px 0',
      paddingBottom: 'max(4px, env(safe-area-inset-bottom))',
      zIndex: Z_INDEX.fixedBar
    }}>
        <NavItem
          active={isActive('/operator/home')}
          onClick={() => navigate('/operator/home')}
          label="Inicio"
          icon={Icons.home}
          isPrimary
        />
        <NavItem
          active={isActive('/operator/avisos')}
          onClick={() => navigate('/operator/avisos')}
          label="Avisos"
          icon={Icons.avisos}
          badgeCount={unreadAvisos}
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
          label="Mi Empresa"
          icon={Icons.profile}
        />
        <NavItem
          active={false}
          onClick={() => goToPortada(navigate)}
          label="Salir"
          icon={Icons.logout}
        />
      </div>
    );
  }

  // Navegación para Titular/Gerente (completa)
  const dockStyle = isDesktop
    ? { left: '50%', right: 'auto', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, borderRadius: '0 0 40px 40px' }
    : { left: 0, right: 0, transform: 'none', width: 'auto', maxWidth: 'none', borderRadius: 0 };

  const showMachines = can('canManageMachines') || can('can_manage_machines');

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      ...dockStyle,
      background: '#1A1A1F',
      borderTop: '1px solid rgba(255,255,255,0.1)',
      display: 'flex',
      justifyContent: 'space-around',
      alignItems: 'center',
      padding: '4px 0',
      paddingBottom: 'max(4px, env(safe-area-inset-bottom))',
      zIndex: Z_INDEX.fixedBar
    }}>
      <NavItem
        active={location.pathname === getProviderLandingPath()}
        onClick={() => navigate(getProviderLandingPath())}
        label="Inicio"
        icon={Icons.home}
        isPrimary
      />
      <NavItem
        active={isActive('/provider/avisos')}
        onClick={() => navigate('/provider/avisos')}
        label="Avisos"
        icon={Icons.avisos}
        badgeCount={unreadAvisos}
      />
      {showMachines ? (
        <NavItem
          active={isActive(['/provider/machines', '/provider/pricing'])}
          onClick={() => navigate('/provider/machines')}
          label="Máquinas"
          icon={Icons.machinery}
        />
      ) : null}
      <NavItem
        active={isActive('/provider/profile')}
        onClick={() => navigate('/provider/profile')}
        label="Mi Empresa"
        icon={Icons.profile}
      />
      <NavItem
        active={false}
        onClick={() => goToPortada(navigate)}
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
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const role = localStorage.getItem('userRole');

  if (!role) return null;

  if (location.pathname === '/terms' && searchParams.get('accept') === '1') {
    return null;
  }

  // Admin no usa la barra de cliente/proveedor
  if (role === 'admin') {
    return null;
  }

  if (role === 'provider') {
    return <ProviderNavigation />;
  }

  if (role === 'client') {
    return <ClientNavigation />;
  }

  return null;
}

export default BottomNavigation;
