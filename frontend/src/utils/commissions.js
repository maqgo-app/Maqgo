/**
 * Sistema de Comisiones MAQGO
 * 
 * Modelo de Precios:
 * - Comisión MAQGO al Cliente: 10% + IVA (19%)
 * - Comisión MAQGO al Proveedor: 10% + IVA (19%)
 * - Comisión Total efectiva: 22.9%
 */

// Datos de facturación de MAQGO (el proveedor factura a MAQGO: neto + IVA menos comisión neta + IVA)
export const MAQGO_BILLING = {
  razonSocial: 'MAQGO SpA',
  rut: '76.248.124-3',
  giro: 'Servicios de TI',
  direccion: 'Fdo Chicureo HJ 1 y 2 Colina',
};

// Configuración de comisiones
export const COMMISSION_CONFIG = {
  // IVA Chile
  IVA_RATE: 0.19,
  
  // Comisión que paga el cliente (adicional al precio base)
  CLIENT_COMMISSION: 0.10, // 10%
  
  // Comisión que se descuenta al proveedor
  PROVIDER_COMMISSION: 0.10, // 10%
  
  // Comisión total de la plataforma
  TOTAL_COMMISSION: 0.20, // 20% (10% cliente + 10% proveedor)
};

/**
 * Calcula el desglose completo de precios para un servicio
 * @param {number} basePrice - Precio base del servicio (tarifa del proveedor)
 * @param {number} transportFee - Fee de traslado (opcional)
 * @returns {Object} Desglose completo de precios
 */
export function calculatePriceBreakdown(basePrice, transportFee = 0) {
  const { IVA_RATE, CLIENT_COMMISSION, PROVIDER_COMMISSION } = COMMISSION_CONFIG;
  
  const totalBase = basePrice + transportFee;
  
  // === CÁLCULOS CLIENTE ===
  // Comisión MAQGO al cliente (10% del base)
  const clientCommission = Math.round(totalBase * CLIENT_COMMISSION);
  // IVA sobre la comisión del cliente (19% de la comisión)
  const clientCommissionIVA = Math.round(clientCommission * IVA_RATE);
  // Total que paga el cliente
  const totalClient = totalBase + clientCommission + clientCommissionIVA;
  
  // === CÁLCULOS PROVEEDOR ===
  // Comisión MAQGO al proveedor (10% del base)
  const providerCommission = Math.round(totalBase * PROVIDER_COMMISSION);
  // IVA sobre la comisión del proveedor (19% de la comisión)
  const providerCommissionIVA = Math.round(providerCommission * IVA_RATE);
  // Total que recibe el proveedor
  const providerEarnings = totalBase - providerCommission - providerCommissionIVA;
  
  // === CÁLCULOS MAQGO ===
  const maqgoCommissions = clientCommission + providerCommission;
  const maqgoIVA = clientCommissionIVA + providerCommissionIVA;
  const maqgoTotal = maqgoCommissions + maqgoIVA;
  
  return {
    // Datos base
    basePrice,
    transportFee,
    totalBase,
    
    // Para mostrar al CLIENTE (sin % comisión visible)
    client: {
      serviceValue: totalBase,
      commissionLabel: 'Tarifa por Servicio',
      commission: clientCommission,
      commissionPercent: CLIENT_COMMISSION * 100,
      ivaLabel: 'IVA',
      iva: clientCommissionIVA,
      ivaPercent: IVA_RATE * 100,
      totalLabel: 'TOTAL A PAGAR',
      total: totalClient,
    },
    
    // Para mostrar al PROVEEDOR (sin % comisión visible)
    provider: {
      grossIncome: totalBase,
      commissionLabel: 'Tarifa por Servicio',
      commission: providerCommission,
      commissionPercent: PROVIDER_COMMISSION * 100,
      ivaLabel: 'IVA',
      iva: providerCommissionIVA,
      ivaPercent: IVA_RATE * 100,
      totalLabel: 'TOTAL A RECIBIR',
      total: providerEarnings,
    },
    
    // Para MAQGO
    maqgo: {
      clientCommission,
      providerCommission,
      totalCommissions: maqgoCommissions,
      totalIVA: maqgoIVA,
      totalIncome: maqgoTotal,
    },
    
    // Resumen
    summary: {
      clientPays: totalClient,
      providerReceives: providerEarnings,
      maqgoEarns: maqgoTotal,
    }
  };
}

/**
 * Formatea un monto en pesos chilenos
 * @param {number} amount - Monto a formatear
 * @returns {string} Monto formateado
 */
export function formatCLP(amount) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Formatea un monto sin símbolo de moneda
 * @param {number} amount - Monto a formatear
 * @returns {string} Monto formateado
 */
export function formatNumber(amount) {
  return new Intl.NumberFormat('es-CL').format(amount);
}

/**
 * Calcula si una reserva es inmediata o programada
 * @param {Date} selectedDate - Fecha seleccionada
 * @returns {string} 'immediate' o 'scheduled'
 */
export function getReservationType(selectedDate) {
  const now = new Date();
  const diffDays = Math.ceil((selectedDate - now) / (1000 * 60 * 60 * 24));
  
  return diffDays <= 3 ? 'immediate' : 'scheduled';
}

/**
 * Calcula el precio por hora estándar (jornada de 9 horas)
 * @param {number} totalPrice - Precio total de la jornada
 * @returns {number} Precio por hora
 */
export function calculateHourlyRate(totalPrice) {
  return Math.round(totalPrice / 9);
}
