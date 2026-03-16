import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { getObject, getArray } from '../../utils/safeStorage';
import MaqgoLogo from '../../components/MaqgoLogo';

import BACKEND_URL from '../../utils/api';

/**
 * Pantalla de retorno tras completar inscripción OneClick en Transbank.
 * Recibe tbk_user por query, lo guarda, crea la solicitud de servicio en backend
 * y redirige a la búsqueda de proveedores.
 */
function OneClickCompleteScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tbk_user = searchParams.get('tbk_user');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!tbk_user) {
      navigate('/client/card');
      return;
    }

    const email = localStorage.getItem('clientEmail') || '';
    // Mismo formato que CardPaymentScreen (Transbank requiere consistencia)
    const username = email
      ? email.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)
      : `user_${Date.now()}`;

    // Guardar en localStorage para el flujo de cobro
    localStorage.setItem('tbk_user', tbk_user);
    localStorage.setItem('oneclick_username', username);

    // Persistir OneClick en backend
    const saveOneClick = async () => {
      try {
        await axios.post(`${BACKEND_URL}/api/payments/oneclick/save`, {
          email,
          tbk_user,
          username
        }, { timeout: 5000 });
      } catch (e) {
        console.warn('No se pudo guardar OneClick en backend:', e?.message);
      }
    };
    saveOneClick();

    // Crear solicitud de servicio en backend y continuar
    const createServiceAndContinue = async () => {
      const clientId = localStorage.getItem('userId') || `client_${Date.now()}`;
      if (!localStorage.getItem('userId')) {
        localStorage.setItem('userId', clientId);
      }

      const billingData = getObject('billingData', {});
      const registerData = getObject('registerData', {});
      const clientName = billingData.nombre
        ? `${billingData.nombre || ''} ${billingData.apellido || ''}`.trim()
        : registerData.nombre
          ? `${registerData.nombre || ''} ${registerData.apellido || ''}`.trim()
          : 'Cliente MAQGO';

      const serviceLat = parseFloat(localStorage.getItem('serviceLat'));
      const serviceLng = parseFloat(localStorage.getItem('serviceLng'));
      const serviceLocation = localStorage.getItem('serviceLocation') || '';

      const basePrice = parseFloat(localStorage.getItem('serviceBasePrice')) || 150000;
      const transportFee = parseFloat(localStorage.getItem('serviceTransportFee')) || 0;
      const totalAmount = parseInt(localStorage.getItem('totalAmount') || localStorage.getItem('maxTotalAmount') || '0', 10);
      const needsInvoice = localStorage.getItem('needsInvoice') === 'true';

      const selectedProvider = getObject('selectedProvider', {});
      const selectedProviderIds = getArray('selectedProviderIds', []);
      const selectedProviderId = selectedProviderIds.length > 0 ? selectedProviderIds[0] : (selectedProvider?.id || undefined);

      const payload = {
        clientId,
        clientName: clientName || 'Cliente MAQGO',
        clientEmail: email || undefined,
        selectedProviderId: selectedProviderId || undefined,
        selectedProviderIds: selectedProviderIds.length > 0 ? selectedProviderIds : undefined,
        location: {
          lat: Number.isFinite(serviceLat) ? serviceLat : -33.4489,
          lng: Number.isFinite(serviceLng) ? serviceLng : -70.6693,
          address: serviceLocation
        },
        basePrice,
        transportFee,
        totalAmount: totalAmount > 0 ? totalAmount : undefined,
        needsInvoice: needsInvoice || undefined,
        machineryType: localStorage.getItem('selectedMachinery') || 'retroexcavadora',
        workdayAccepted: true,
        reservationType: localStorage.getItem('reservationType') || 'immediate',
        scheduledDate: localStorage.getItem('selectedDate') || undefined
      };

      try {
        const { data } = await axios.post(
          `${BACKEND_URL}/api/service-requests`,
          payload,
          { timeout: 15000 }
        );
        localStorage.setItem('currentServiceId', data.id);
        if (data.matching) {
          localStorage.setItem('matchingResult', JSON.stringify(data.matching));
        }
        navigate('/client/searching', { replace: true });
      } catch (e) {
        console.error('Error creando solicitud:', e);
        setError(e?.response?.data?.detail || e?.message || 'Error al crear la solicitud');
      }
    };

    createServiceAndContinue();
  }, [tbk_user, navigate]);

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <MaqgoLogo size="small" />
        <div style={{
          width: 50,
          height: 50,
          marginTop: 30,
          border: '4px solid rgba(255,255,255,0.2)',
          borderTopColor: '#EC6819',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <p style={{ color: '#fff', marginTop: 20, textAlign: 'center' }}>
          Tarjeta registrada. Buscando proveedores disponibles...
        </p>
        {error && (
          <p style={{ color: '#EF4444', fontSize: 14, marginTop: 12, textAlign: 'center' }}>
            {error}
          </p>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

export default OneClickCompleteScreen;
