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
import { ensurePushSubscribedIfGranted } from '../utils/pushNotifications';

const AuthContext = createContext(null);

function safeJsonParse(raw, fallback) {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : fallback;
  } catch {
    return fallback;
  }
}

function mergeProviderPermissionsFromApi(basePerms, apiPerms, role, userId) {
  const mergedPerms = { ...(basePerms || {}) };
  const p = apiPerms && typeof apiPerms === 'object' ? apiPerms : {};
  if (typeof p.can_view_finances === 'boolean') mergedPerms.canViewFinances = p.can_view_finances;
  if (typeof p.can_view_finance === 'boolean') mergedPerms.canViewFinances = p.can_view_finance;
  if (typeof p.can_view_invoices === 'boolean') mergedPerms.canViewInvoices = p.can_view_invoices;
  if (typeof p.can_upload_invoice === 'boolean') mergedPerms.canUploadInvoice = p.can_upload_invoice;
  if (typeof p.can_manage_operators === 'boolean') mergedPerms.canManageOperators = p.can_manage_operators;
  if (typeof p.can_manage_machines === 'boolean') mergedPerms.canManageMachines = p.can_manage_machines;
  if (typeof p.can_manage_masters === 'boolean') mergedPerms.canManageMasters = p.can_manage_masters;
  if (typeof p.can_view_bank_data === 'boolean') mergedPerms.canViewBankData = p.can_view_bank_data;
  if (typeof p.can_accept_requests === 'boolean') mergedPerms.canAcceptRequests = p.can_accept_requests;
  if (typeof p.can_view_services === 'boolean') mergedPerms.canViewServices = p.can_view_services;
  if (typeof p.can_delete_machines === 'boolean') mergedPerms.canDeleteMachines = p.can_delete_machines;
  if (typeof p.can_assign_operator === 'boolean') mergedPerms.canAssignOperator = p.can_assign_operator;
  if (typeof p.can_create_work === 'boolean') mergedPerms.canCreateWork = p.can_create_work;
  if (typeof p.can_view_work_details === 'boolean') mergedPerms.canViewWorkDetails = p.can_view_work_details;
  if (typeof p.can_edit_master_profile === 'boolean') mergedPerms.canEditMasterProfile = p.can_edit_master_profile;
  if (typeof p.can_delete_master === 'boolean') mergedPerms.canDeleteMaster = p.can_delete_master;
  void role;
  void userId;
  return mergedPerms;
}

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
    canViewDashboard: true,
    canManageMachines: true,
    canCreateWork: true,
    canAssignOperator: true,
    canViewWorkDetails: true,
    canEditMasterProfile: true,
    canDeleteMaster: true,
    canDeleteMachines: true,
  },
  master: {
    canViewFinances: false,
    canViewInvoices: false,
    canUploadInvoice: false,
    canManageOperators: false,
    canManageMasters: false,
    canViewBankData: false,
    canAcceptRequests: false,
    canViewServices: true,
    canViewDashboard: true,
    canManageMachines: false,
    canCreateWork: false,
    canAssignOperator: false,
    canViewWorkDetails: true,
    canEditMasterProfile: false,
    canDeleteMaster: false,
    canDeleteMachines: false,
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
    canViewDashboard: true,
    canManageMachines: true,
    canCreateWork: true,
    canAssignOperator: true,
    canViewWorkDetails: true,
    canEditMasterProfile: true,
    canDeleteMaster: true,
    canDeleteMachines: true,
  },
  operator: {
    canViewFinances: false,
    canViewInvoices: false,
    canUploadInvoice: false,
    canManageOperators: false,
    canManageMasters: false,
    canViewBankData: false,
    canAcceptRequests: false,
    canViewServices: true,
    canViewDashboard: false,
    canManageMachines: false,
    canCreateWork: false,
    canAssignOperator: false,
    canViewWorkDetails: false,
    canEditMasterProfile: false,
    canDeleteMaster: false,
    canDeleteMachines: false,
  }
};

export function AuthProvider({ children }) {
  const initialUserId = localStorage.getItem('userId');
  const initialUserRole = localStorage.getItem('userRole');
  const initialProviderRoleRaw = localStorage.getItem('providerRole') || 'super_master';
  const initialProviderRole = initialProviderRoleRaw === 'owner' ? 'super_master' : initialProviderRoleRaw;
  const initialHasToken = Boolean(localStorage.getItem('token') || localStorage.getItem('authToken'));

  const [user, setUser] = useState(
    initialUserId ? { id: initialUserId, role: initialUserRole } : null
  );
  const [providerRole, setProviderRole] = useState(initialProviderRole);
  const [permissions, setPermissions] = useState(
    DEFAULT_PERMISSIONS[initialProviderRole] || DEFAULT_PERMISSIONS.super_master
  );
  const [loading, setLoading] = useState(initialHasToken);
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
            const basePerms = DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.super_master;
            setPermissions(mergeProviderPermissionsFromApi(basePerms, roleData?.permissions, role, userId));
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
    const basePerms = DEFAULT_PERMISSIONS[permKey] || DEFAULT_PERMISSIONS.super_master;
    setPermissions(basePerms);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('authToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('userRole');
    localStorage.removeItem('providerRole');
    localStorage.removeItem('ownerId');
    setUser(null);
    setProviderRole('super_master');
    setPermissions(DEFAULT_PERMISSIONS.super_master);
  }, []);

  const hasPermission = useCallback((permission) => permissions[permission] === true, [permissions]);
  const can = useCallback(
    (permission) => {
      const key = String(permission || '').trim();
      if (!key) return false;
      if (Object.prototype.hasOwnProperty.call(permissions, key)) return permissions[key] === true;
      const map = {
        can_view_finance: 'canViewFinances',
        can_manage_machines: 'canManageMachines',
        can_manage_operators: 'canManageOperators',
        can_create_work: 'canCreateWork',
        can_assign_operator: 'canAssignOperator',
        can_view_work_details: 'canViewWorkDetails',
        can_edit_master_profile: 'canEditMasterProfile',
        can_delete_master: 'canDeleteMaster',
        can_delete_machines: 'canDeleteMachines',
      };
      const mapped = map[key];
      if (mapped && Object.prototype.hasOwnProperty.call(permissions, mapped)) return permissions[mapped] === true;
      return false;
    },
    [permissions]
  );
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
        const apiRoles = Array.isArray(data.roles) ? data.roles : [];
        const storedRole = localStorage.getItem('userRole');
        const isAdmin = data.role === 'admin' || apiRoles.includes('admin');
        let userRole = 'client';
        if (isAdmin) {
          userRole = 'admin';
        } else if (storedRole && (storedRole === 'client' || apiRoles.includes(storedRole))) {
          userRole = storedRole;
        } else {
          userRole = 'client';
        }
        const rawProviderRole = apiRoles.includes('provider')
          ? (data.provider_role || localStorage.getItem('providerRole') || 'super_master')
          : 'super_master';
        const oid = data.owner_id || null;
        if (!cancelled) {
          await login(userId, userRole, rawProviderRole, oid);
          if (userRole === 'provider') {
            const role = (rawProviderRole === 'owner' ? 'super_master' : rawProviderRole) || 'super_master';
            const basePerms = DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.super_master;
            const permsFromMe = data?.provider_permissions;
            if (permsFromMe && typeof permsFromMe === 'object') {
              setProviderRole(role);
              setPermissions(mergeProviderPermissionsFromApi(basePerms, permsFromMe, role, userId));
              setOwnerId(oid);
            } else {
              await loadUserData();
            }
          }
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

  useEffect(() => {
    if (!user?.id) return;
    ensurePushSubscribedIfGranted();
  }, [user?.id]);

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
    can,
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
