/**
 * @vitest-environment jsdom
 */
/**
 * Producción simulada (npm run test:guardrails → --mode production + env):
 * el HTML inicial no debe incluir copys de demo / simulación visibles al usuario.
 * En test:unit normal estos casos se omiten (skipIf).
 */
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CheckoutProvider } from '../context/CheckoutContext';
import CardPaymentScreen from '../screens/client/CardPaymentScreen.js';
import OperatorHomeScreen from '../screens/operator/OperatorHomeScreen.js';

const runProdUiGuard =
  import.meta.env.VITE_IS_PRODUCTION === 'true' &&
  import.meta.env.VITE_MAQGO_ENV === 'production' &&
  import.meta.env.VITE_ENABLE_DEMO_MODE !== 'true';

const FORBIDDEN = [
  /modo demo/i,
  /\(Demo\)/,
  /Simular solicitud/i,
  /simulate-request-operator/i,
];

function assertNoDemoCopy(html) {
  for (const re of FORBIDDEN) {
    expect(html, `No debe aparecer en producción: ${re}`).not.toMatch(re);
  }
}

describe.skipIf(!runProdUiGuard)('producción: sin copys demo en UI inicial', () => {
  it('CardPaymentScreen', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/client/card']}>
        <CheckoutProvider>
          <Routes>
            <Route path="/client/card" element={<CardPaymentScreen />} />
          </Routes>
        </CheckoutProvider>
      </MemoryRouter>
    );
    assertNoDemoCopy(html);
  });

  it('OperatorHomeScreen (botón simular oculto si VITE_IS_PRODUCTION)', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/operator/home']}>
        <Routes>
          <Route path="/operator/home" element={<OperatorHomeScreen />} />
        </Routes>
      </MemoryRouter>
    );
    assertNoDemoCopy(html);
  });
});
