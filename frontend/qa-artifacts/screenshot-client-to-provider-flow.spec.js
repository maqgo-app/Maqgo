import { test, expect } from '@playwright/test';
import { installApiMocks } from './_helpers/mocks';

async function seedClientSession(page) {
  await page.addInitScript(() => {
    localStorage.setItem('userRole', 'client');
    localStorage.setItem('userId', 'client-qa-001');
    localStorage.setItem('token', 'client-token');
    localStorage.setItem('authToken', 'client-token');
    localStorage.setItem('legalAcceptedAt', new Date().toISOString());
    localStorage.setItem('reservationType', 'immediate');
    localStorage.setItem('priceType', 'hour');
  });
}

async function seedProviderSession(page, { incomingRequest }) {
  await page.addInitScript((incomingRequest) => {
    localStorage.setItem('userRole', 'provider');
    localStorage.setItem('providerRole', 'super_master');
    localStorage.setItem('userId', 'provider-qa-001');
    localStorage.setItem('token', 'provider-token');
    localStorage.setItem('authToken', 'provider-token');
    localStorage.setItem('legalAcceptedAt', new Date().toISOString());
    localStorage.setItem('incomingRequest', JSON.stringify(incomingRequest));
  }, incomingRequest);
}

test.describe('Capturas: flujo cliente → solicitud → proveedor', () => {
  test.use({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });

  test('Pantalla por pantalla', async ({ page, baseURL }) => {
    await installApiMocks(page);
    await seedClientSession(page);

    await page.goto(`${baseURL}/client/machinery`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Selecciona el tipo de maquinaria')).toBeVisible();
    await page.screenshot({ path: 'qa-artifacts/out/flow-01-cliente-maquinaria.png', fullPage: true });
    await page.screenshot({ path: 'qa-artifacts/out/flow-01-cliente-maquinaria-hd.png', fullPage: true, scale: 'device' });

    const machineryScroll = page.locator('.maqgo-funnel-split-scroll');
    await machineryScroll.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(250);
    await page.screenshot({ path: 'qa-artifacts/out/flow-01b-cliente-maquinaria-bottom.png', fullPage: true });

    await page.getByText('Retroexcavadora').click();
    await page.locator('.maqgo-funnel-split-footer button').click();

    await expect(page).toHaveURL(/\/client\/service-location/);
    await expect(page.getByText('¿Dónde necesitas la maquinaria?')).toBeVisible();
    await page.screenshot({ path: 'qa-artifacts/out/flow-02-cliente-ubicacion.png', fullPage: true });

    await page.getByPlaceholder('Ej: Av. Providencia 1234').first().fill('Av. Providencia 123');
    await page.getByPlaceholder('Escribe para buscar...').fill('Provi');
    await page.getByText('Providencia').first().click();
    await page.getByTestId('service-reference-input').fill('Portón verde, acceso por el costado');
    await page.getByTestId('continue-to-providers-btn').click();

    await expect(page).toHaveURL(/\/client\/providers/);
    await expect(page.getByRole('button', { name: /Opción 1/i })).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'qa-artifacts/out/flow-03-cliente-proveedores.png', fullPage: true });

    await page.getByRole('button', { name: /Opción 1/i }).click();
    await page.screenshot({ path: 'qa-artifacts/out/flow-04-cliente-proveedores-seleccion.png', fullPage: true });

    await page.getByText('Enviar solicitud').click();

    await expect(page).toHaveURL(/\/client\/confirm/);
    await expect(page.getByText('Revisa tu solicitud')).toBeVisible();
    await page.screenshot({ path: 'qa-artifacts/out/flow-05-cliente-confirmar.png', fullPage: true });

    await page.getByTestId('confirm-btn').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'qa-artifacts/out/flow-06-cliente-siguiente-paso.png', fullPage: true });

    await page.evaluate(() => {
      localStorage.setItem('oneclickDemoMode', 'true');
      if (!localStorage.getItem('selectedMachinery')) localStorage.setItem('selectedMachinery', 'retroexcavadora');
      if (!localStorage.getItem('serviceLocation')) localStorage.setItem('serviceLocation', 'Av. Providencia 123, Providencia');
    });

    await page.goto(`${baseURL}/oneclick/complete`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/client\/searching/, { timeout: 10000 });
    await page.screenshot({ path: 'qa-artifacts/out/flow-07-cliente-buscando.png', fullPage: true });

    const providerPage = await page.context().newPage();
    await installApiMocks(providerPage);

    await seedProviderSession(providerPage, {
      incomingRequest: {
        id: 'req-qa-001',
        reservationType: 'immediate',
        machineryType: 'retroexcavadora',
        workDescription: 'Excavación básica',
        address: 'Av. Providencia 123, Providencia',
        basePrice: 80000,
        transportFee: 15000,
        offerTimeoutSeconds: 60,
        urgencyType: 'today',
        urgencyWindowMinutes: 120,
        client: { name: 'Cliente MAQGO' },
      },
    });

    await providerPage.goto(`${baseURL}/provider/request-received`, { waitUntil: 'domcontentloaded' });
    await expect(providerPage.getByTestId('accept-request-btn')).toBeVisible();
    await providerPage.screenshot({ path: 'qa-artifacts/out/flow-08-proveedor-solicitud-recibida.png', fullPage: true });
  });
});
