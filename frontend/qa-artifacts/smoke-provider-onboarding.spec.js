import { test, expect } from '@playwright/test';
import { resolvePlaywrightBaseUrl } from '../scripts/e2ePreviewConstants.mjs';
import { installApiMocks, seedProviderSession } from './_helpers/mocks.js';

const BASE_URL = resolvePlaywrightBaseUrl();

test.describe('Smoke: provider onboarding + perfil', () => {
  test('provider core screens render (no crash)', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context);
    await context.addInitScript(seedProviderSession);
    const page = await context.newPage();

    const paths = [
      '/provider/home',
      '/provider/profile',
      '/provider/profile/empresa',
      '/provider/profile/banco',
      '/provider/profile/maqgo-billing',
      '/provider/machines',
      '/provider/history',
      '/provider/team',
      '/provider/tariffs',
    ];

    for (const p of paths) {
      await page.goto(`${BASE_URL}${p}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('load');
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.locator('.maqgo-app')).toHaveCount(1);
    }

    await context.close();
  });
});

