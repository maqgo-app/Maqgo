import { logoutAndClearSession } from './api';

/**
 * Cierra sesión sin borrar avances de formularios/reserva.
 * Evita usar localStorage.clear() para no perder draft del usuario.
 */
export async function clearAuthSessionPreservingDraft() {
  await logoutAndClearSession();
  // Flags de intención de sesión no cubiertos por clearLocalSession en este camino
  // (logoutAndClearSession puede estar mockeado en tests).
  // En producción se limpian dos veces (idempotente): por clearLocalSession y aquí.
  const extraAuthKeys = [
    'desiredRole',
    'providerCameFromWelcome',
    'adminMode',
    'isAuthenticated',
    'refreshToken',
  ];
  extraAuthKeys.forEach((key) => localStorage.removeItem(key));
}

export default {
  clearAuthSessionPreservingDraft
};
