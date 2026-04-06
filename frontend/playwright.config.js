import { defineConfig, devices } from '@playwright/test';
import os from 'os';
import {
  e2eWebServerCommand,
  resolvePlaywrightBaseUrl,
  shouldReuseExistingE2ePreviewServer,
  shouldSkipE2eWebServer,
} from './scripts/e2ePreviewConstants.mjs';

const baseURL = resolvePlaywrightBaseUrl();

const e2eWebServer = shouldSkipE2eWebServer()
  ? undefined
  : {
      command: e2eWebServerCommand(),
      url: baseURL,
      reuseExistingServer: shouldReuseExistingE2ePreviewServer(),
      timeout: 180_000,
    };

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
  ...(e2eWebServer ? { webServer: e2eWebServer } : {}),
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: process.env.PLAYWRIGHT_SELLADO_FULL
    ? [
        { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
        { name: 'mobile-webkit', use: { ...devices['iPhone 12'] } },
        { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
      ]
    : [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
