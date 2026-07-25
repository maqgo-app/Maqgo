import React, { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';

export default function AdminLegacyAreaRedirect() {
  const { areaId } = useParams();

  useEffect(() => {
    try {
      if (areaId) {
        localStorage.setItem('maqgo_admin_area', String(areaId));
      }
    } catch {
      /* ignore */
    }
  }, [areaId]);

  return <Navigate to="/admin/legacy/dashboard" replace />;
}
