import { defineConfig, devices } from '@playwright/test';
import os from 'os';

const baseURL = (process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4173').replace(/\/$/, '');

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
    baseURL,
    trace: 'on-first-retry',
  },
  /**
   * Por defecto un solo Chromium (CI / smoke rápido).
   * Sellado: `PLAYWRIGHT_SELLADO_FULL=1 npm run test:e2e:sellado` → desktop + iPhone + Pixel.
   */
  projects: process.env.PLAYWRIGHT_SELLADO_FULL
    ? [
        { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
        { name: 'mobile-webkit', use: { ...devices['iPhone 12'] } },
        { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
      ]
    : [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
