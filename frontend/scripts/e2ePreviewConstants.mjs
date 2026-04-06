/**
 * Fuente única para preview E2E (Vite `preview` + Playwright `baseURL` / specs).
 * No depender de `localhost` (IPv4/IPv6); 127.0.0.1 es estable en smoke local/CI.
 */
export const E2E_PREVIEW_HOST = '127.0.0.1';
export const E2E_PREVIEW_PORT = 4173;
export const E2E_DEFAULT_BASE_URL = `http://${E2E_PREVIEW_HOST}:${E2E_PREVIEW_PORT}`;

export function resolvePlaywrightBaseUrl() {
  return (process.env.PLAYWRIGHT_BASE_URL || E2E_DEFAULT_BASE_URL).replace(/\/$/, '');
}

export function shouldSkipE2eWebServer() {
  return (
    process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1' || process.env.PLAYWRIGHT_SKIP_WEBSERVER === 'true'
  );
}

export function e2eWebServerCommand() {
  const skipBuild =
    process.env.PLAYWRIGHT_E2E_SKIP_BUILD === '1' || process.env.PLAYWRIGHT_E2E_SKIP_BUILD === 'true';
  return skipBuild ? 'npm run preview:e2e' : 'npm run build && npm run preview:e2e';
}

/** Reutilizar proceso en 4173 si ya responde; en GitHub/GitLab no reutilizar (build + servidor limpio). */
export function shouldReuseExistingE2ePreviewServer() {
  if (process.env.PLAYWRIGHT_REUSE_PREVIEW === '0' || process.env.PLAYWRIGHT_REUSE_PREVIEW === 'false') {
    return false;
  }
  if (process.env.GITHUB_ACTIONS === 'true') return false;
  if (process.env.GITLAB_CI === 'true') return false;
  return true;
}
