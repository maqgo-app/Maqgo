import { logoutAndClearSession } from './api';

/**
 * Cierra sesión sin borrar avances de formularios/reserva.
 * Evita usar localStorage.clear() para no perder draft del usuario.
 */
export async function clearAuthSessionPreservingDraft() {
  await logoutAndClearSession();
  const extraAuthKeys = ['desiredRole', 'adminMode', 'isAuthenticated', 'refreshToken'];
  extraAuthKeys.forEach((key) => localStorage.removeItem(key));
}

export default {
  clearAuthSessionPreservingDraft
};
