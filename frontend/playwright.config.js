import { defineConfig } from '@playwright/test';
import os from 'os';

// Si Chromium sigue fallando (SIGSEGV), ejecuta E2E fuera del sandbox del IDE:
// cd frontend && npx playwright install chromium && npm run test:e2e

// En entornos donde `os.cpus()` no reporta modelo "Apple" (p. ej. sandbox), Playwright
// elige mac-x64 pero el binario instalado es arm64. Alinear con Node arm64 en macOS.
if (os.platform() === 'darwin' && os.arch() === 'arm64' && !process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE) {
  const ver = os.release().split('.').map((a) => parseInt(a, 10));
  const major = Number.isFinite(ver[0]) ? ver[0] : 24;
  const macMinor = Math.min(Math.max(major - 9, 10), 15);
  process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE = `mac${macMinor}-arm64`;
}

export default defineConfig({
  testDir: './qa-artifacts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    trace: 'on-first-retry',
  },
});
