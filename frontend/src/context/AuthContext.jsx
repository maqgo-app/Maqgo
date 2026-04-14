/**
 * MAQGO - Auth Context con RBAC Jerárquico
 *
 * Sistema de roles:
 * - super_master (Titular): Ve todo + puede invitar Gerentes y Operadores
 * - master (Gerente): Ve todo pero NO puede invitar Gerentes
 * - operator (Operador): Solo ve datos operacionales
 *
 * Permisos:
 * - canViewFinances: Titular y Gerente
 * - canViewInvoices: Titular y Gerente
 * - canUploadInvoice: Titular y Gerente
 * - canManageOperators: Titular y Gerente
 * - canManageMasters: Solo Titular
 * - canAcceptRequests: Todos
 */

import React, { createContext, useState, useCallback, useEffect } from 'react';
import BACKEND_URL, { fetchWithAuth } from '../utils/api';

const AuthContext = createContext(null);

// Permisos por defecto según rol
const DEFAULT_PERMISSIONS = {
  super_master: {
    canViewFinances: true,
    canViewInvoices: true,
    canUploadInvoice: true,
    canManageOperators: true,
    canManageMasters: true,
    canViewBankData: true,
    canAcceptRequests: true,
    canViewServices: true,
    canViewDashboard: true
  },
  master: {
    canViewFinances: true,
    canViewInvoices: true,
    canUploadInvoice: true,
    canManageOperators: true,
    canManageMasters: false,
    canViewBankData: true,
    canAcceptRequests: true,
    canViewServices: true,
    canViewDashboard: true
  },
  owner: {
    canViewFinances: true,
    canViewInvoices: true,
    canUploadInvoice: true,
    canManageOperators: true,
    canManageMasters: true,
    canViewBankData: true,
    canAcceptRequests: true,
    canViewServices: true,
    canViewDashboard: true
  },
  operator: {
    canViewFinances: false,
    canViewInvoices: false,
    canUploadInvoice: false,
    canManageOperators: false,
    canManageMasters: false,
    canViewBankData: false,
    canAcceptRequests: true,
    canViewServices: true,
    canViewDashboard: false
  }
};

export function AuthProvider({ children }) {
  const initialUserId = localStorage.getItem('userId');
  const initialUserRole = localStorage.getItem('userRole');
  const initialProviderRoleRaw = localStorage.getItem('providerRole') || 'super_master';
  const initialProviderRole = initialProviderRoleRaw === 'owner' ? 'super_master' : initialProviderRoleRaw;

  const [user, setUser] = useState(
    initialUserId ? { id: initialUserId, role: initialUserRole } : null
  );
  const [providerRole, setProviderRole] = useState(initialProviderRole);
  const [permissions, setPermissions] = useState(
    DEFAULT_PERMISSIONS[initialProviderRole] || DEFAULT_PERMISSIONS.super_master
  );
  const [loading, setLoading] = useState(false);
  const [ownerId, setOwnerId] = useState(() => localStorage.getItem('ownerId'));
  const [ownerName, setOwnerName] = useState(null);

  const loadUserData = useCallback(async () => {
    try {
      const userId = localStorage.getItem('userId');
      const userRole = localStorage.getItem('userRole');
      const savedProviderRole = localStorage.getItem('providerRole');

      if (!userId) {
        setLoading(false);
        return;
      }

      if (userRole === 'provider') {
        try {
          const response = await fetchWithAuth(`${BACKEND_URL}/api/users/${userId}/role`, {
            redirectOn401: false,
          });
          if (response.ok) {
            const roleData = await response.json();
            let role = roleData.provider_role || 'super_master';
            if (role === 'owner') role = 'super_master';
            setProviderRole(role);
            setPermissions(DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.super_master);
            setOwnerId(roleData.owner_id || null);
            setOwnerName(roleData.owner_name);
            localStorage.setItem('providerRole', role);
            if (roleData.owner_id) localStorage.setItem('ownerId', roleData.owner_id);
            else localStorage.removeItem('ownerId');
          }
        } catch {
          let role = savedProviderRole || 'super_master';
          if (role === 'owner') role = 'super_master';
          setProviderRole(role);
          setPermissions(DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.super_master);
        }
      }

      setUser({ id: userId, role: userRole });
    } catch (error) {
      console.error('Error loading user data:', error);
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (userId, userRole, provRole = 'super_master', ownerIdFromApi = null) => {
    let normalizedRole = provRole;
    if (normalizedRole === 'owner') normalizedRole = 'super_master';
    localStorage.setItem('userId', userId);
    localStorage.setItem('userRole', userRole);
    if (userRole === 'provider') {
      localStorage.setItem('providerRole', normalizedRole);
      if (ownerIdFromApi) {
        localStorage.setItem('ownerId', ownerIdFromApi);
        setOwnerId(ownerIdFromApi);
      } else {
        localStorage.removeItem('ownerId');
        setOwnerId(null);
      }
    } else {
      localStorage.removeItem('providerRole');
      localStorage.removeItem('ownerId');
      setOwnerId(null);
    }
    setUser({ id: userId, role: userRole });
    const permKey = userRole === 'provider' ? normalizedRole : 'super_master';
    setProviderRole(userRole === 'provider' ? normalizedRole : 'super_master');
    setPermissions(DEFAULT_PERMISSIONS[permKey] || DEFAULT_PERMISSIONS.super_master);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('authToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('userRole');
    localStorage.removeItem('providerRole');
    localStorage.removeItem('ownerId');
    // Flags de intención de sesión: limpiar junto con la sesión para evitar
    // contaminación entre sesiones/roles consecutivos.
    localStorage.removeItem('desiredRole');
    localStorage.removeItem('providerCameFromWelcome');
    setUser(null);
    setProviderRole('super_master');
    setPermissions(DEFAULT_PERMISSIONS.super_master);
  }, []);

  const hasPermission = useCallback((permission) => permissions[permission] === true, [permissions]);
  const isOwner = useCallback(() => providerRole === 'super_master' || providerRole === 'owner', [providerRole]);
  const isSuperMaster = useCallback(() => providerRole === 'super_master' || providerRole === 'owner', [providerRole]);
  const isMaster = useCallback(() => providerRole === 'master', [providerRole]);
  const isOperator = useCallback(() => providerRole === 'operator', [providerRole]);
  const hasFullVisibility = useCallback(() => ['super_master', 'master', 'owner'].includes(providerRole), [providerRole]);

  const switchRole = useCallback((newRole) => {
    if (['super_master', 'master', 'operator', 'owner'].includes(newRole)) {
      let normalizedRole = newRole;
      if (normalizedRole === 'owner') normalizedRole = 'super_master';
      setProviderRole(normalizedRole);
      setPermissions(DEFAULT_PERMISSIONS[normalizedRole] || DEFAULT_PERMISSIONS.super_master);
      localStorage.setItem('providerRole', normalizedRole);
    }
  }, []);

  // Auto-hidratación de sesión al cargar la app:
  // si existe token en localStorage, validar contra /auth/me
  // para evitar pedir OTP en cada ingreso.
  useEffect(() => {
    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    if (!token) return;

    let cancelled = false;

    const hydrateFromMe = async () => {
      setLoading(true);
      try {
        const res = await fetchWithAuth(`${BACKEND_URL}/api/auth/me`, { redirectOn401: true });
        if (!res.ok) {
          // 401 y otros errores ya disparan clearLocalSession vía interceptor.
          return;
        }
        const data = await res.json();
        if (!data || !data.id) return;

        const userId = String(data.id);
        const userRole = data.role || localStorage.getItem('userRole') || 'client';
        const apiRoles = Array.isArray(data.roles) ? data.roles : [];
        const rawProviderRole = apiRoles.includes('provider')
          ? (data.provider_role || localStorage.getItem('providerRole') || 'super_master')
          : 'super_master';
        const oid = data.owner_id || null;
        if (!cancelled) {
          await login(userId, userRole, rawProviderRole, oid);
          try {
            if (data.phone) {
              localStorage.setItem('userPhone', String(data.phone).trim());
            }
          } catch {
            /* ignore */
          }
        }
      } catch {
        // Silencioso: en caso de fallo se mantiene el flujo normal hacia /login.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    hydrateFromMe();

    return () => {
      cancelled = true;
    };
  }, [login]);

  const value = {
    user,
    providerRole,
    permissions,
    loading,
    ownerId,
    ownerName,
    login,
    logout,
    hasPermission,
    isOwner,
    isSuperMaster,
    isMaster,
    isOperator,
    hasFullVisibility,
    switchRole,
    refreshUserData: loadUserData
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
export { AuthContext };
