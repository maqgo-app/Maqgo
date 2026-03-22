import { test, expect } from '@playwright/test';

/** Definí PLAYWRIGHT_BASE_URL para probar local (ej. http://127.0.0.1:4173 tras `vite preview`). */
const BASE_URL = (process.env.PLAYWRIGHT_BASE_URL || 'https://maqgo.vercel.app').replace(/\/$/, '');

const CASES = [
  {
    name: 'mac-desktop',
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  },
  {
    name: 'windows-desktop',
    viewport: { width: 1366, height: 768 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  },
];

for (const qaCase of CASES) {
  test(`welcome behavior ${qaCase.name}`, async ({ browser }) => {
    test.setTimeout(60000);
    const context = await browser.newContext({
      viewport: qaCase.viewport,
      userAgent: qaCase.userAgent,
    });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForLoadState('load');
    await page.waitForTimeout(800);

    // 1) Modal de reanudar no debe existir antes de tocar el CTA.
    await expect(
      page.getByRole('dialog', { name: /reanudar arriendo/i })
    ).toHaveCount(0);

    const cta = page.getByRole('button', { name: /Arrendar maquinaria/i }).first();
    await expect(cta).toBeVisible();

    await cta.click();
    await page.waitForTimeout(800);

    const url = page.url();
    const hasResumeDialog =
      (await page.getByRole('dialog', { name: /reanudar arriendo/i }).count()) > 0;

    // Navegó a login/client o quedó en welcome con modal.
    const navigatedAway =
      url.includes('/client/home') ||
      url.includes('/login') ||
      url.includes('/register');
    expect(navigatedAway || hasResumeDialog).toBeTruthy();

    if (hasResumeDialog) {
      await expect(
        page.getByRole('button', { name: /Continuar arriendo/i })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /Empezar desde cero/i })
      ).toBeVisible();
    }

    await context.close();
  });
}
