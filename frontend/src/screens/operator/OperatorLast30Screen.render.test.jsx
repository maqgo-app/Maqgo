import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import OperatorLast30Screen from './OperatorLast30Screen.js';

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

describe('OperatorLast30Screen render', () => {
  beforeEach(() => {
    globalThis.localStorage = makeLocalStorage();
    localStorage.setItem('currentServiceId', 'demo-operator');
  });

  it('renderiza título y CTA estándar', () => {
    const html = renderToString(
      <MemoryRouter>
        <OperatorLast30Screen />
      </MemoryRouter>
    );
    expect(html).toContain('Últimos 30');
    expect(html).toContain('Volver a Servicio');
    expect(html.toLowerCase()).not.toContain('last 30');
  });
});

