/**
 * DEBUG temporal: origen de redirecciones a /login.
 * @param {string} source - identificador del archivo o ruta (ej. src/components/ProtectedRoute.jsx)
 */
export function traceRedirectToLogin(source) {
  console.log('REDIRECT TO LOGIN FROM:', source);
}

/** Embudo proveedor sin pasar por /login (política otp-single-source-of-truth-maqgo). */
export function traceProviderFunnelNav(source, targetPath) {
  console.log('PROVIDER FUNNEL NAV:', source, '→', targetPath);
}
