import { test, expect } from '@playwright/test';
import { installApiMocks, seedAdminSession } from './_helpers/mocks.js';

const BASE_URL = (process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');

test.describe('Smoke: admin', () => {
  test('admin dashboard + subpages render (no crash)', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context);
    await context.addInitScript(seedAdminSession);
    const page = await context.newPage();

    const paths = ['/admin', '/admin/users', '/admin/pricing', '/admin/marketing'];

    for (const p of paths) {
      await page.goto(`${BASE_URL}${p}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('load');
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.locator('.maqgo-app')).toHaveCount(1);
    }

    await context.close();
  });
});

