/**
 * Cierra sesión sin borrar avances de formularios/reserva.
 * Evita usar localStorage.clear() para no perder draft del usuario.
 */
export function clearAuthSessionPreservingDraft() {
  const authKeys = [
    'token',
    'authToken',
    'userPhone',
    'userId',
    'userRole',
    'userRoles',
    'providerRole',
    'ownerId',
    'desiredRole',
    'adminMode',
    'isAuthenticated',
    'refreshToken'
  ];

  authKeys.forEach((key) => localStorage.removeItem(key));
}

export default {
  clearAuthSessionPreservingDraft
};
