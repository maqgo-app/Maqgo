import { test, expect } from '@playwright/test';
import { resolvePlaywrightBaseUrl } from '../scripts/e2ePreviewConstants.mjs';
import { installApiMocks } from './_helpers/mocks.js';

const BASE_URL = resolvePlaywrightBaseUrl();

test.describe('Legacy routing: /chat', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  test('/chat/:serviceId redirige a funnel cliente', async ({ browser }) => {
    const context = await browser.newContext();
    await installApiMocks(context);
    await context.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('authToken', 'test-token');
      localStorage.setItem('userId', 'client-1');
      localStorage.setItem('userRole', 'client');
      localStorage.setItem('legalAcceptedAt', new Date().toISOString());
    });

    const page = await context.newPage();
    await page.goto(`${BASE_URL}/chat/svc-123`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await expect(page).toHaveURL(/\/client\//, { timeout: 15_000 });
    await expect(page.getByRole('alert')).toHaveCount(0);
    await context.close();
  });
});

