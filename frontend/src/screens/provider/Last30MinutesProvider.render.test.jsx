import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import Last30MinutesProvider from './Last30MinutesProvider.js';

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

describe('Last30MinutesProvider render', () => {
  beforeEach(() => {
    globalThis.localStorage = makeLocalStorage();
    localStorage.setItem('currentServiceId', 'demo-provider');
  });

  it('renderiza copy estándar y no filtra términos técnicos', () => {
    const html = renderToString(
      <MemoryRouter>
        <Last30MinutesProvider />
      </MemoryRouter>
    );
    expect(html).toContain('Últimos 30');
    expect(html).toContain('Volver a Servicio');
    expect(html.toLowerCase()).not.toContain('endtime');
  });
});

