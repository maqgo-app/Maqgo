/**
 * UX Copy Contract — flujo P5–P6 (única fuente de verdad).
 * No duplicar estos textos en componentes; importar PAYMENT_COPY.
 */

export const PAYMENT_COPY = {
  /** P5 — confirmación de solicitud (antes de tarjeta) */
  P5_INIT: {
    title: 'No se realizará ningún cobro ahora.',
    subtitle: 'Solo pagarás si un proveedor acepta tu solicitud.',
    /** Bullets: siguiente paso operativo (sin repetir el bloque verde de “no cobro”). */
    methodBullets: [
      'Siguiente paso: registrar tu tarjeta con Transbank (validación segura).',
      'MAQGO no almacena los datos de tu tarjeta.',
    ],
    /** Un proveedor: pie de refuerzo bajo el monto */
    singleProviderCaption: 'Total estimado para tu solicitud.',
    /** Varios proveedores: rango + aclaración breve */
    priceCapNote:
      'Rango estimado: el total final depende de qué proveedor acepte primero (no pagarás más que el tope mostrado).',
    /** Solo factura empresa (checkbox). No mencionar boleta ni otro tipo de documento. */
    invoiceQuestion: '¿Necesitas factura?',
    invoiceSameTotalNote: 'El precio final es el mismo.',
    /** Una sola opción explícita; si no marcas, no se pide otro comprobante en esta pantalla. */
    invoiceCheckboxLabel: 'Sí, necesito factura con RUT de empresa',
    invoiceYesHint: 'Ingresarás RUT y razón social al pagar.',
    breakdownMultiProviderHint:
      'Estimación según el tope del rango; el total final puede ser menor.',
    /** Dentro del desglose expandido: evita leer dos montos distintos */
    breakdownSameTotalHint: 'Es el mismo total que ves arriba.',
    totalRowLabel: 'Total a pagar',
  },

  /** P6 — registro de tarjeta (OneClick) */
  P6_VERIFY: {
    screenTitle: 'Registrar tarjeta',
    /** Texto principal del bloque verde (línea 1 y 2) */
    noChargeNow: 'Registra tu tarjeta (sin cobro)',
    chargeWhen: 'Solo se cobrará si un proveedor acepta tu solicitud.',
    transbankNote: 'Serás redirigido a Transbank para validar tu tarjeta de forma segura.',
    cardStorageNote: 'MAQGO no almacena los datos de tu tarjeta.',
    footerBelowButton: 'No se realizará ningún cobro en este paso',
    /** Error antes de Transbank (sync de perfil / sesión) — el detalle concreto viene del backend o de red */
    sessionErrorTitle: 'No pudimos validar tu sesión',
    sessionErrorFallback:
      'No pudimos sincronizar tu perfil antes de ir a Transbank. Revisa tu conexión o vuelve a iniciar sesión.',
    cardErrorTitle: 'No se pudo registrar tu tarjeta',
    cardErrorNoCharge: 'No hubo cobro. Intenta de nuevo u otra tarjeta.',
    ctaContinue: 'Registrar tarjeta',
    ctaContinueLoading: 'Registrando tarjeta…',
    ctaRetryAfterError: 'Intentar nuevamente',
  },
};
