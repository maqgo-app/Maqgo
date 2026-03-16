import { getObject } from './safeStorage';

/**
 * MAQGO - Sistema de Roles y Permisos
 * 
 * ROLES:
 * - owner: Dueño/Gerente/Secretaria - Ve TODO
 * - operator: Operador de maquinaria - Ve solo lo operativo
 * 
 * REGLA: El operador trabaja, el dueño administra.
 */

// Permisos por rol
export const PERMISSIONS = {
  owner: {
    // Solicitudes
    viewRequests: true,
    acceptRequests: true,
    assignOperator: true,
    
    // Operativo
    viewLocation: true,
    viewNavigation: true,
    startService: true,
    endService: true,
    
    // Financiero
    viewPrices: true,
    viewInvoices: true,
    uploadInvoice: true,
    viewPayments: true,
    viewCommissions: true,
    viewDashboard: true,
    viewWeeklySummary: true,
    viewClientBillingData: true,
    
    // Configuración
    manageOperators: true,
    manageMachines: true,
    manageProfile: true,
  },
  
  operator: {
    // Solicitudes
    viewRequests: true,
    acceptRequests: true,  // Puede aceptar (modelo híbrido)
    assignOperator: false,
    
    // Operativo
    viewLocation: true,
    viewNavigation: true,
    startService: true,
    endService: true,
    
    // Financiero - RESTRINGIDO
    viewPrices: true,      // Ve el valor para negociar con dueño
    viewInvoices: false,   // ❌ No ve facturas
    uploadInvoice: false,  // ❌ No sube facturas
    viewPayments: false,   // ❌ No ve pagos
    viewCommissions: false,// ❌ No ve comisiones
    viewDashboard: false,  // ❌ No ve dashboard financiero
    viewWeeklySummary: false, // ❌ No ve resumen semanal
    viewClientBillingData: false, // ❌ No ve RUT, razón social, etc.
    
    // Configuración
    manageOperators: false,
    manageMachines: false,
    manageProfile: true,   // Solo su perfil básico
  }
};

// Rutas protegidas por rol
export const PROTECTED_ROUTES = {
  // Solo dueños
  ownerOnly: [
    '/provider/cobros',           // Mis Cobros (my-services, dashboard redirigen aquí)
    '/provider/upload-invoice',   // Subir factura
  ],
  
  // Dueños y operadores
  providerAll: [
    '/provider/home',
    '/provider/request-received',
    '/provider/en-route',
    '/provider/arrival',
    '/provider/service-active',
    '/provider/service-finished',
    '/provider/rate',
    '/provider/profile',
  ]
};

// Información que se oculta al operador en notificaciones
export const OPERATOR_HIDDEN_FIELDS = [
  'invoice',
  'invoice_number',
  'invoice_amount',
  'client_rut',
  'client_billing',
  'razonSocial',
  'giro',
  'commission',
  'net_amount',
  'payment',
];

/**
 * Verifica si un rol tiene un permiso específico
 */
export function hasPermission(role, permission) {
  const rolePerms = PERMISSIONS[role];
  if (!rolePerms) return false;
  return rolePerms[permission] === true;
}

/**
 * Verifica si un rol puede acceder a una ruta
 */
export function canAccessRoute(role, route) {
  // Admin puede todo
  if (role === 'admin') return true;
  
  // Owner puede todo de proveedor
  if (role === 'owner') return true;
  
  // Operator tiene restricciones
  if (role === 'operator') {
    const isOwnerOnly = PROTECTED_ROUTES.ownerOnly.some(r => route.startsWith(r));
    if (isOwnerOnly) return false;
  }
  
  return true;
}

/**
 * Filtra datos sensibles para operadores
 */
export function filterDataForOperator(data, role) {
  if (role !== 'operator') return data;
  
  const filtered = { ...data };
  OPERATOR_HIDDEN_FIELDS.forEach(field => {
    if (field in filtered) {
      delete filtered[field];
    }
  });
  
  return filtered;
}

/**
 * Obtiene el rol del usuario actual
 */
export function getCurrentProviderRole() {
  const providerData = getObject('providerData', {});
  // Si tiene operadores registrados, es owner
  // Si fue asignado como operador, es operator
  return providerData.role || 'owner'; // Default owner para MVP
}

/**
 * Verifica si es dueño/master
 */
export function isOwner() {
  return getCurrentProviderRole() === 'owner';
}

/**
 * Verifica si es operador
 */
export function isOperator() {
  return getCurrentProviderRole() === 'operator';
}
