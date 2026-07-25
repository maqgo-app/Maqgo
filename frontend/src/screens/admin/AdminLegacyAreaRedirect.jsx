import React, { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';

export default function AdminLegacyAreaRedirect() {
  const { areaId } = useParams();
  const routeByArea = {
    today: '/admin/reservas',
    system: '/admin/matching',
    platform: '/admin/clientes',
    money: '/admin/pagos',
    access: '/admin/soporte',
  };

  useEffect(() => {
    try {
      if (areaId) {
        localStorage.setItem('maqgo_admin_area', String(areaId));
      }
    } catch {
      /* ignore */
    }
  }, [areaId]);

  return <Navigate to={routeByArea[String(areaId || '').trim()] || '/admin'} replace />;
}
