import React from 'react';
import AdminUsersScreen from './AdminUsersScreen';

export default function AdminClientsDomainScreen() {
  return <AdminUsersScreen embedded initialTab="clients" allowedTabs={['clients']} title="Clientes" subtitle="Gestion real de clientes dentro del Admin oficial." />;
}
