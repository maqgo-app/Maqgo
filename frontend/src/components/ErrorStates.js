import React from 'react';

/**
 * Componente centralizado para todos los estados de error y cancelación
 * Siguiendo las especificaciones UX de MAQGO
 * 
 * REGLA CLAVE: Todo error repite "No se realizó ningún cobro" cuando aplica
 */

// === ICONOS ===
const IconError = ({ size = 60, color = '#F44336' }) => (
  <div style={{
    width: size,
    height: size,
    borderRadius: '50%',
    background: `${color}20`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }}>
    <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
      <path d="M18 6L6 18M6 6L18 18" stroke={color} strokeWidth="3" strokeLinecap="round"/>
    </svg>
  </div>
);

const IconWarning = ({ size = 60, color = '#FFA726' }) => (
  <div style={{
    width: size,
    height: size,
    borderRadius: '50%',
    background: `${color}20`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }}>
    <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
      <path d="M12 9V13M12 17H12.01M21 12C21 16.97 16.97 21 12 21C7.03 21 3 16.97 3 12C3 7.03 7.03 3 12 3C16.97 3 21 7.03 21 12Z" 
            stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  </div>
);

const IconSuccess = ({ size = 60, color = '#90BDD3' }) => (
  <div style={{
    width: size,
    height: size,
    borderRadius: '50%',
    background: `${color}20`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }}>
    <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
      <path d="M5 13L9 17L19 7" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  </div>
);

const IconClock = ({ size = 60, color = '#FFA726' }) => (
  <div style={{
    width: size,
    height: size,
    borderRadius: '50%',
    background: `${color}20`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }}>
    <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2"/>
      <path d="M12 6v6l4 2" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  </div>
);

const IconConnection = ({ size = 60, color = '#9E9E9E' }) => (
  <div style={{
    width: size,
    height: size,
    borderRadius: '50%',
    background: `${color}20`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }}>
    <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
      <path d="M1 1l22 22M16.72 11.06C15.88 9.45 14.09 8.5 12 8.5c-.44 0-.88.05-1.3.15M5 12.55a11.02 11.02 0 0 1 6.56-7.52" 
            stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <path d="M10.71 5.05A16 16 0 0 1 22 12M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 8.94 0M12 20h.01" 
            stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  </div>
);

// === COMPONENTES DE ESTADO ===

/**
 * 1. Error de disponibilidad - No hay proveedores
 */
export const NoProvidersError = ({ onModify }) => (
  <ErrorStateContainer>
    <IconWarning size={70} />
    <ErrorTitle>No hay proveedores disponibles en tu zona</ErrorTitle>
    <ErrorDescription>
      No encontramos maquinaria disponible para los criterios que elegiste. Prueba:
    </ErrorDescription>
    <ul style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 1.8, margin: '12px 0 20px', paddingLeft: 20, textAlign: 'left' }}>
      <li>Cambiar la ubicación de la obra</li>
      <li>Elegir otra fecha u horario</li>
      <li>Seleccionar otro tipo de maquinaria</li>
    </ul>
    <NoChargeNotice />
    <PrimaryButton onClick={onModify}>Modificar mi solicitud</PrimaryButton>
  </ErrorStateContainer>
);

/**
 * 1b. No hay proveedores hoy, pero sí para mañana (reserva inmediata)
 * Aviso positivo: mostramos cuántas opciones hay para el día siguiente
 */
export const NoProvidersTryTomorrow = ({ tomorrowCount, onReserveTomorrow, onModify }) => (
  <ErrorStateContainer>
    <IconSuccess size={70} />
    <ErrorTitle>No encontramos disponibilidad para hoy</ErrorTitle>
    <ErrorDescription>
      {tomorrowCount != null && tomorrowCount > 0
        ? `¡Buenas noticias! Mañana tenemos ${tomorrowCount} ${tomorrowCount === 1 ? 'opción disponible' : 'opciones disponibles'} para tu solicitud. ¿Quieres ver el listado y reservar para el día siguiente?`
        : 'Tenemos disponibilidad para mañana. ¿Quieres ver el listado y reservar para el día siguiente?'}
    </ErrorDescription>
    <NoChargeNotice />
    <PrimaryButton onClick={onReserveTomorrow}>
      {tomorrowCount != null && tomorrowCount > 0 ? `Ver ${tomorrowCount} opciones para mañana` : 'Ver opciones para mañana'}
    </PrimaryButton>
    <div style={{ marginTop: 12 }}>
      <SecondaryButton onClick={onModify}>Modificar solicitud</SecondaryButton>
    </div>
  </ErrorStateContainer>
);

/**
 * 2. Solicitud expirada / Proveedor no acepta
 */
export const RequestExpiredError = ({ onViewOthers }) => (
  <ErrorStateContainer>
    <IconClock size={70} />
    <ErrorTitle>La solicitud no fue aceptada</ErrorTitle>
    <ErrorDescription>
      El proveedor no confirmó dentro del tiempo esperado.
    </ErrorDescription>
    <NoChargeNotice />
    <ErrorDescription style={{ marginTop: 8 }}>
      Puedes intentar con otro proveedor o modificar tu solicitud.
    </ErrorDescription>
    <PrimaryButton onClick={onViewOthers}>Ver otros proveedores</PrimaryButton>
  </ErrorStateContainer>
);

/**
 * 3. Proveedor rechaza la solicitud
 */
export const ProviderRejectedError = ({ onSelectOther }) => (
  <ErrorStateContainer>
    <IconWarning size={70} color="#F44336" />
    <ErrorTitle>El proveedor rechazó la solicitud</ErrorTitle>
    <NoChargeNotice />
    <ErrorDescription>
      Puedes seleccionar otro proveedor disponible.
    </ErrorDescription>
    <PrimaryButton onClick={onSelectOther}>Seleccionar otro proveedor</PrimaryButton>
  </ErrorStateContainer>
);

/**
 * 4. Error al registrar tarjeta (Oneclick)
 * @param {string} [message] - Mensaje opcional (ej. error de Transbank)
 */
export const CardRegistrationError = ({ onRetry, message }) => (
  <ErrorStateContainer>
    <IconError size={70} />
    <ErrorTitle>No pudimos registrar tu tarjeta</ErrorTitle>
    <ErrorDescription>
      {message || 'Intenta nuevamente o utiliza otra tarjeta.'}
    </ErrorDescription>
    <NoChargeNotice />
    <PrimaryButton onClick={onRetry}>Intentar nuevamente</PrimaryButton>
  </ErrorStateContainer>
);

/**
 * 5. Error de pago (post-aceptación)
 */
export const PaymentFailedError = ({ onRetry }) => (
  <ErrorStateContainer>
    <IconError size={70} />
    <ErrorTitle>Error al procesar el pago</ErrorTitle>
    <ErrorDescription>
      El proveedor aceptó el servicio, pero no pudimos realizar el cobro.
    </ErrorDescription>
    <ErrorDescription style={{ marginTop: 8 }}>
      Intenta nuevamente para confirmar el servicio.
    </ErrorDescription>
    <PrimaryButton onClick={onRetry}>Reintentar pago</PrimaryButton>
  </ErrorStateContainer>
);

/**
 * 6. Error de conexión (global)
 */
export const ConnectionError = ({ onRetry }) => (
  <ErrorStateContainer>
    <IconConnection size={70} />
    <ErrorTitle>Error de conexión</ErrorTitle>
    <ErrorDescription>
      Revisa tu internet e intenta nuevamente.
    </ErrorDescription>
    <NoChargeNotice />
    <PrimaryButton onClick={onRetry}>Reintentar</PrimaryButton>
  </ErrorStateContainer>
);

// === CANCELACIONES ===

/**
 * 7. Cancelación sin cargo (válida)
 */
export const CancellationSuccess = ({ onClose }) => (
  <ErrorStateContainer>
    <IconSuccess size={70} color="#90BDD3" />
    <ErrorTitle style={{ color: '#90BDD3' }}>Cancelación realizada</ErrorTitle>
    <ErrorDescription>
      Cancelaste el servicio dentro del plazo permitido.
    </ErrorDescription>
    <NoChargeNotice />
    {onClose && <PrimaryButton onClick={onClose}>Volver al inicio</PrimaryButton>}
  </ErrorStateContainer>
);

/**
 * 8. Cancelación con cargo
 */
export const CancellationWithCharge = ({ amount, onClose }) => (
  <ErrorStateContainer>
    <IconWarning size={70} color="#F44336" />
    <ErrorTitle>Cancelación fuera de plazo</ErrorTitle>
    <ErrorDescription>
      El proveedor ya había confirmado el servicio.
    </ErrorDescription>
    <ChargeNotice amount={amount} />
    {onClose && <SecondaryButton onClick={onClose}>Entendido</SecondaryButton>}
  </ErrorStateContainer>
);

/**
 * 9. Cancelación por proveedor
 */
export const ProviderCancellation = ({ onSearchOther }) => (
  <ErrorStateContainer>
    <IconWarning size={70} />
    <ErrorTitle>El proveedor canceló el servicio</ErrorTitle>
    <ErrorDescription>
      Lamentamos el inconveniente.
    </ErrorDescription>
    <NoChargeNotice />
    <ErrorDescription style={{ marginTop: 8 }}>
      Puedes seleccionar otro proveedor disponible.
    </ErrorDescription>
    <PrimaryButton onClick={onSearchOther}>Buscar otro proveedor</PrimaryButton>
  </ErrorStateContainer>
);

// === ESTADOS PARA PROVEEDOR ===

/**
 * Solicitud expirada - Vista proveedor
 */
export const ProviderRequestExpired = ({ onClose }) => (
  <ErrorStateContainer>
    <IconClock size={70} color="#9E9E9E" />
    <ErrorTitle style={{ color: '#9E9E9E' }}>Solicitud expirada</ErrorTitle>
    <ErrorDescription>
      No aceptaste la solicitud dentro del tiempo límite.
    </ErrorDescription>
    {onClose && <SecondaryButton onClick={onClose}>Entendido</SecondaryButton>}
  </ErrorStateContainer>
);

/**
 * Aceptación confirmada - Vista proveedor
 */
export const ProviderAcceptanceConfirmed = ({ onContinue }) => (
  <ErrorStateContainer>
    <IconSuccess size={70} />
    <ErrorTitle style={{ color: '#4CAF50' }}>Servicio confirmado</ErrorTitle>
    <ErrorDescription>
      El cliente fue notificado y el cobro será ejecutado automáticamente.
    </ErrorDescription>
    <PrimaryButton onClick={onContinue}>Ir al servicio</PrimaryButton>
  </ErrorStateContainer>
);

// === COMPONENTES AUXILIARES ===

const ErrorStateContainer = ({ children }) => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    textAlign: 'center',
    minHeight: '60vh'
  }}>
    {children}
  </div>
);

const ErrorTitle = ({ children, style = {} }) => (
  <h2 style={{
    color: '#FAFAFA',
    fontSize: 20,
    fontWeight: 600,
    margin: '20px 0 12px',
    lineHeight: 1.3,
    letterSpacing: '-0.02em',
    fontFamily: "'Inter', sans-serif",
    ...style
  }}>
    {children}
  </h2>
);

const ErrorDescription = ({ children, style = {} }) => (
  <p style={{
    color: 'rgba(250,250,250,0.9)',
    fontSize: 14,
    fontWeight: 400,
    margin: 0,
    lineHeight: 1.5,
    maxWidth: 300,
    fontFamily: "'Inter', sans-serif",
    ...style
  }}>
    {children}
  </p>
);

/**
 * Aviso: No se realizó ningún cobro - Azul suave del logo
 */
const NoChargeNotice = () => (
  <div style={{
    background: 'rgba(144, 189, 211, 0.1)',
    border: '1px solid rgba(144, 189, 211, 0.25)',
    borderRadius: 10,
    padding: '10px 16px',
    marginTop: 16,
    marginBottom: 16
  }}>
    <p style={{
      color: '#90BDD3',
      fontSize: 13,
      fontWeight: 600,
      margin: 0,
      fontFamily: "'Inter', sans-serif"
    }}>
      No se realizó ningún cobro.
    </p>
  </div>
);

/**
 * Aviso: Se aplicó cobro
 */
const ChargeNotice = ({ amount }) => {
  const formatPrice = (price) => {
    return new Intl.NumberFormat('es-CL', { 
      style: 'currency', currency: 'CLP', maximumFractionDigits: 0 
    }).format(price);
  };

  return (
    <div style={{
      background: 'rgba(244, 67, 54, 0.1)',
      border: '1px solid rgba(244, 67, 54, 0.3)',
      borderRadius: 10,
      padding: '10px 16px',
      marginTop: 16,
      marginBottom: 16
    }}>
      <p style={{
        color: '#F44336',
        fontSize: 13,
        fontWeight: 600,
        margin: 0,
        fontFamily: "'Inter', sans-serif"
      }}>
        Se aplicó el cobro correspondiente según las condiciones.
        {amount && <span style={{ display: 'block', marginTop: 4 }}>{formatPrice(amount)}</span>}
      </p>
    </div>
  );
};

const PrimaryButton = ({ children, onClick }) => (
  <button
    onClick={onClick}
    style={{
      width: '100%',
      maxWidth: 280,
      padding: 16,
      background: '#EC6819',
      border: 'none',
      borderRadius: 25,
      color: '#fff',
      fontSize: 15,
      fontWeight: 600,
      cursor: 'pointer',
      marginTop: 8,
      fontFamily: "'Inter', sans-serif"
    }}
    data-testid="error-state-primary-btn"
  >
    {children}
  </button>
);

const SecondaryButton = ({ children, onClick }) => (
  <button
    onClick={onClick}
    style={{
      width: '100%',
      maxWidth: 280,
      padding: 16,
      background: 'transparent',
      border: '1px solid rgba(250,250,250,0.25)',
      borderRadius: 25,
      color: 'rgba(250,250,250,0.95)',
      fontSize: 15,
      fontWeight: 500,
      cursor: 'pointer',
      marginTop: 8,
      fontFamily: "'Inter', sans-serif"
    }}
    data-testid="error-state-secondary-btn"
  >
    {children}
  </button>
);

/**
 * Texto legal corto - Para usar debajo de CTAs
 */
export const LegalChargeNotice = () => (
  <p style={{
    color: 'rgba(250,250,250,0.9)',
    fontSize: 12,
    fontWeight: 400,
    margin: '12px 0 0',
    textAlign: 'center',
    fontFamily: "'Inter', sans-serif"
  }}>
    El cobro se realiza únicamente después de la aceptación del proveedor.
  </p>
);

export default {
  NoProvidersError,
  NoProvidersTryTomorrow,
  RequestExpiredError,
  ProviderRejectedError,
  CardRegistrationError,
  PaymentFailedError,
  ConnectionError,
  CancellationSuccess,
  CancellationWithCharge,
  ProviderCancellation,
  ProviderRequestExpired,
  ProviderAcceptanceConfirmed,
  LegalChargeNotice
};
