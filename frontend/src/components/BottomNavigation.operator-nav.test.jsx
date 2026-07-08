import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { OperatorNavigation, ProviderNavigation } from './BottomNavigation';

function renderWithAuth(ui, { route, authValue }) {
  return renderToString(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[route]}>
        {ui}
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('BottomNavigation role separation', () => {
  it('mantiene footer puro para operador con 3 items', () => {
    const html = renderWithAuth(<OperatorNavigation />, {
      route: '/operator/home',
      authValue: {
        loading: false,
        user: { id: 'op-1', role: 'provider' },
        providerRole: 'operator',
        logout: () => {},
        can: () => false,
      },
    });

    expect(html).toContain('Inicio');
    expect(html).toContain('Avisos');
    expect(html).toContain('Historial');
    expect(html).not.toContain('Mi Empresa');
    expect(html).not.toContain('Máquinas');
    expect(html).not.toContain('Salir');
    expect(html).not.toContain('Perfil');
    expect(html).not.toContain('Cuenta');
  });

  it('preserva footer de proveedor sin mezclarlo con operador', () => {
    const html = renderWithAuth(<ProviderNavigation />, {
      route: '/provider/home',
      authValue: {
        loading: false,
        user: { id: 'prov-1', role: 'provider' },
        providerRole: 'super_master',
        logout: () => {},
        can: (permission) => permission === 'canManageMachines' || permission === 'can_manage_machines',
      },
    });

    expect(html).toContain('Inicio');
    expect(html).toContain('Avisos');
    expect(html).toContain('Máquinas');
    expect(html).toContain('Mi Empresa');
    expect(html).toContain('Salir');
    expect(html).not.toContain('Perfil');
  });
});
