import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import OperatorServiceActiveScreen from './OperatorServiceActiveScreen.js';

function makeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
    setItem: (k, v) => {
      store.set(String(k), String(v));
    },
    removeItem: (k) => {
      store.delete(String(k));
    },
    clear: () => store.clear(),
  };
}

describe('OperatorServiceActiveScreen render', () => {
  beforeEach(() => {
    globalThis.localStorage = makeLocalStorage();
    localStorage.setItem('currentServiceId', 'demo-operator');
  });

  it('renderiza encabezado y acciones operativas', () => {
    const html = renderToString(
      <MemoryRouter>
        <OperatorServiceActiveScreen />
      </MemoryRouter>
    );
    expect(html).toContain('Servicio en curso');
    expect(html).toContain('Ir a avisos');
    expect(html).toContain('Volver al inicio');
  });
});

