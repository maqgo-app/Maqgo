/**
 * UX Copy Contract — flujo pagos P5–P6 (única fuente de verdad para mensajes de cobro/validación).
 * No duplicar estos textos en componentes; importar PAYMENT_COPY.
 */

export const PAYMENT_COPY = {
  /** P5 — confirmación de solicitud (antes de tarjeta) */
  P5_INIT: {
    title: 'No se realizará ningún cobro en este momento.',
    subtitle: 'Solo pagarás si un proveedor acepta tu solicitud.',
    /** Texto bajo el CTA principal (misma voz que el contrato) */
    footerUnderCta: 'Sin cobro en este paso',
    /** Bullets informativos (método; no sustituyen title/subtitle) */
    methodBullets: [
      'Pago seguro con Transbank OneClick',
      'Acepta débito y crédito',
      'MAQGO no almacena tus datos de tarjeta',
    ],
    /** Tope de precio (rango) — coherente con “solo cobro si aceptan” */
    priceCapNote: 'Nunca pagarás más que el valor máximo.',
    /** Desglose (varios proveedores) */
    breakdownMultiProviderHint:
      'Basado en el precio máximo del rango; el cobro real puede ser menor.',
    /** Fila final del desglose */
    totalRowLabel: 'Total a pagar',
  },

  /** P6 — validación de tarjeta (OneClick) */
  P6_VERIFY: {
    /** Título de pantalla (header) */
    screenTitle: 'Valida tu tarjeta para continuar',
    title: 'No se realizará ningún cobro en este paso.',
    subtitle: 'Tu tarjeta solo se valida para poder cobrar si tu solicitud es aceptada.',
    transbankRedirect: 'Serás redirigido a Transbank para validar tu tarjeta de forma segura.',
    /** Pantalla de error tras fallo OneClick (sin cobro) */
    cardErrorNoCharge:
      'No se realizó ningún cobro. Intenta nuevamente o utiliza otra tarjeta.',
    ctaContinue: 'Continuar con Transbank',
    ctaContinueLoading: 'Continuar con Transbank...',
  },
};
