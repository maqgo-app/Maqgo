import React from 'react';
import AdminUsersScreen from './AdminUsersScreen';

export default function AdminSupplyDomainScreen({ mode }) {
  const screenProps =
    mode === 'providers'
      ? {
          initialTab: 'providers',
          allowedTabs: ['providers'],
          title: 'Proveedores',
          subtitle: 'Gestion real de cuentas proveedoras dentro del Admin oficial.',
        }
      : mode === 'operators'
        ? {
            initialTab: 'operators',
            allowedTabs: ['operators'],
            title: 'Operadores',
            subtitle: 'Gestion real del equipo operativo dentro del Admin oficial.',
          }
        : {
            initialTab: 'machines',
            allowedTabs: ['machines'],
            title: 'Maquinarias',
            subtitle: 'Gestion real del catalogo de maquinarias dentro del Admin oficial.',
          };

  return <AdminUsersScreen embedded {...screenProps} />;
}
