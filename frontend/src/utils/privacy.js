/**
 * Utilidades de privacidad MAQGO
 * 
 * Regla de negocio: Evitar que clientes y proveedores se contacten directamente
 * para proteger el modelo de negocio de la plataforma.
 */

/**
 * Anonimizar nombre de persona o empresa
 * "Carlos González" → "Carlos G."
 * "Transportes Silva SpA" → "Transportes S."
 */
export const maskName = (name) => {
  if (!name) return 'Usuario';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return name;
  // Tomar primera palabra completa + inicial de la segunda
  return `${parts[0]} ${parts[1]?.charAt(0)}.`;
};

/**
 * Anonimizar nombre de empresa más agresivamente
 * "Constructora Silva SpA" → "Constructora S."
 * "Juan Pérez" → "Juan P."
 */
export const maskCompanyName = (name) => {
  if (!name) return 'Empresa';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return `${name.charAt(0)}***`;
  return `${parts[0]} ${parts[1]?.charAt(0)}.`;
};

/**
 * Anonimizar ubicación (ocultar números de calle)
 * "Av. Providencia 1234" → "Av. Providencia ****"
 */
export const maskLocation = (location) => {
  if (!location) return '';
  return location.replace(/\d{3,}/g, '****');
};

/**
 * Anonimizar teléfono
 * "+56912345678" → "+569****5678"
 */
export const maskPhone = (phone) => {
  if (!phone) return '';
  if (phone.length < 8) return '****';
  return phone.slice(0, 4) + '****' + phone.slice(-4);
};

/**
 * Anonimizar RUT
 * "12.345.678-9" → "12.***.**8-9"
 */
export const maskRut = (rut) => {
  if (!rut) return '';
  if (rut.length < 5) return '***';
  return rut.slice(0, 3) + '***' + rut.slice(-3);
};

/**
 * Nombre a mostrar al cliente para el proveedor.
 * REGLA: Cliente NUNCA ve empresa, solo datos del operador.
 */
export const getClientProviderDisplayName = (provider) => {
  if (!provider) return 'Operador asignado';
  return provider.operator_name || provider.providerOperatorName || 'Operador asignado';
};

/**
 * Determinar nivel de privacidad según estado del servicio
 * - active/in_progress: Mostrar info necesaria para el servicio
 * - completed/invoiced/paid: Máxima anonimización
 */
export const getPrivacyLevel = (serviceStatus) => {
  const highPrivacyStatuses = ['completed', 'invoiced', 'paid', 'cancelled'];
  return highPrivacyStatuses.includes(serviceStatus) ? 'high' : 'low';
};

/**
 * Aplicar anonimización según contexto
 */
export const anonymizeForClient = (providerData, serviceStatus) => {
  const privacyLevel = getPrivacyLevel(serviceStatus);
  
  if (privacyLevel === 'high') {
    return {
      name: maskName(providerData.operator_name || providerData.name),
      company: null, // No mostrar empresa cuando servicio terminó
      phone: null,
      location: maskLocation(providerData.location),
      // Mantener solo lo esencial
      rating: providerData.rating,
      machinery: providerData.machinery
    };
  }
  
  // Durante servicio activo: solo operador, nunca empresa
  return {
    name: providerData.operator_name || providerData.providerOperatorName || providerData.name,
    company: null, // Cliente nunca ve empresa
    phone: null, // Nunca mostrar teléfono directo
    location: providerData.location,
    rating: providerData.rating,
    machinery: providerData.machinery
  };
};

/**
 * Aplicar anonimización para proveedor viendo cliente
 */
export const anonymizeForProvider = (clientData, serviceStatus) => {
  const privacyLevel = getPrivacyLevel(serviceStatus);
  
  if (privacyLevel === 'high') {
    return {
      name: maskName(clientData.name),
      company: clientData.billing?.billingType === 'empresa' 
        ? maskCompanyName(clientData.billing.razonSocial) 
        : null,
      rut: null, // No mostrar RUT después de facturado
      phone: null,
      location: maskLocation(clientData.location),
      rating: clientData.rating
    };
  }
  
  // Durante servicio activo para facturación
  return {
    name: clientData.name,
    company: clientData.billing?.razonSocial,
    rut: clientData.billing?.rut, // Necesario para facturar
    phone: null, // Nunca teléfono directo
    location: clientData.location,
    rating: clientData.rating
  };
};
