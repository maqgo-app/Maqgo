/**
 * Constantes centralizadas MAQGO
 * Un solo lugar para valores compartidos. Importar desde aquí en código nuevo.
 */

// Re-exportar desde utils existentes
export { MACHINERY_NAMES, getMachineryDisplayName } from '../utils/machineryNames';
export { BOOKING_BACK_ROUTES, getBookingBackRoute } from '../utils/bookingFlow';

// Valores por defecto
export const DEFAULT_MACHINERY = 'retroexcavadora';
export const DEFAULT_HOURS = 4;
export const MIN_HOURS_IMMEDIATE = 4;
export const MAX_HOURS_IMMEDIATE = 8;

// Rutas principales (para navegación programática)
export const ROUTES = {
  HOME: '/',
  CLIENT_HOME: '/client/home',
  PROVIDER_HOME: '/provider/home',
  OPERATOR_HOME: '/operator/home',
  LOGIN: '/login',
  REGISTER: '/',
  CLIENT_MACHINERY: '/client/machinery',
  CLIENT_CONFIRM: '/client/confirm',
  CLIENT_CARD: '/client/card',
  CLIENT_BILLING: '/client/billing',
};
