/**
 * Verificación temprana de variables canónicas Maqgo (Vite inyecta strings en build).
 */
const REQUIRED_KEYS = ['VITE_IS_PRODUCTION', 'VITE_MAQGO_ENV', 'VITE_ENABLE_DEMO_MODE'];

export function validateMaqgoEnvAtStartup() {
  const missing = [];
  for (const key of REQUIRED_KEYS) {
    const v = import.meta.env[key];
    if (v === undefined || String(v).trim() === '') {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    console.error(
      '[Maqgo] Faltan o están vacías variables de entorno requeridas:',
      missing.join(', '),
      '— Revisa .env / Vercel Environment Variables y vuelve a desplegar.'
    );
  }
}
