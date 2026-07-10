import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import FAQScreen from './FAQScreen';

function renderWithAuth(ui, { route, authValue }) {
  return renderToString(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </AuthContext.Provider>
  );
}

function countOccurrences(haystack, needle) {
  return (haystack.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
}

describe('FAQScreen role-based visibility', () => {
  it('Cliente solo ve FAQ de Cliente', () => {
    const html = renderWithAuth(<FAQScreen />, {
      route: '/faq',
      authValue: {
        loading: false,
        user: { id: 'c-1', role: 'client' },
        providerRole: null,
        logout: () => {},
        can: () => false,
      },
    });

    expect(html).toContain('¿Qué es MAQGO?');
    expect(html).toContain('¿Puedo cancelar una reserva?');
    expect(html).not.toContain('¿Cómo registro mi empresa?');
    expect(html).not.toContain('¿Qué es "Soy operador (tengo código)"?');
    expect(countOccurrences(html, '¿Cuál es la tarifa por servicio\?')).toBe(1);
  });

  it('Proveedor solo ve FAQ de Proveedor', () => {
    const html = renderWithAuth(<FAQScreen />, {
      route: '/faq',
      authValue: {
        loading: false,
        user: { id: 'p-1', role: 'provider' },
        providerRole: 'super_master',
        logout: () => {},
        can: () => false,
      },
    });

    expect(html).toContain('¿Cómo registro mi empresa?');
    expect(html).toContain('¿Cómo emito la factura a MAQGO?');
    expect(html).not.toContain('¿Qué es MAQGO?');
    expect(html).not.toContain('¿Qué es "Soy operador (tengo código)"?');
    expect(countOccurrences(html, '¿Cuál es la tarifa por servicio\?')).toBe(1);
  });

  it('Operador solo ve FAQ de Operador', () => {
    const html = renderWithAuth(<FAQScreen />, {
      route: '/faq',
      authValue: {
        loading: false,
        user: { id: 'o-1', role: 'provider' },
        providerRole: 'operator',
        logout: () => {},
        can: () => false,
      },
    });

    expect(html).toContain('Soy operador (tengo código)');
    expect(html).toContain('¿Qué NO puedo ver como operador?');
    expect(html).not.toContain('¿Qué es MAQGO?');
    expect(html).not.toContain('¿Cómo registro mi empresa?');
    expect(countOccurrences(html, '¿Cuál es la tarifa por servicio\?')).toBe(0);
  });
});
