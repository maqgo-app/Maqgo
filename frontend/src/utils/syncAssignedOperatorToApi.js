import axios from 'axios';
import BACKEND_URL from './api';

/**
 * Persiste operador elegido en Mongo (service_requests) para GET del cliente.
 * No bloquea flujo demo (ids demo- / req-) ni sin token.
 */
export async function syncAssignedOperatorToApi(operatorData) {
  const sid = localStorage.getItem('currentServiceId');
  if (!sid || sid.startsWith('demo-') || sid.startsWith('req-')) return;
  const token = localStorage.getItem('token');
  if (!token || !operatorData || typeof operatorData !== 'object') return;

  try {
    await axios.patch(
      `${BACKEND_URL}/api/service-requests/${encodeURIComponent(sid)}/assigned-operator`,
      {
        nombre: operatorData.nombre || '',
        apellido: operatorData.apellido || '',
        rut: operatorData.rut || '',
      },
      { timeout: 8000 }
    );
  } catch (e) {
    console.warn('syncAssignedOperatorToApi:', e?.response?.status || e?.message);
  }
}
