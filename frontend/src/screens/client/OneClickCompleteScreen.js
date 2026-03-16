import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { getObject, getArray } from '../../utils/safeStorage';
import MaqgoLogo from '../../components/MaqgoLogo';
import { getDemoProviders } from '../../utils/pricing';

import BACKEND_URL from '../../utils/api';

/**
 * Pantalla de retorno tras completar inscripción OneClick en Transbank.
 * Recibe tbk_user por query, lo guarda, crea la solicitud de servicio en backend
 * y redirige a la búsqueda de proveedores.
 *
 * Modo demo (tbk_user empieza con "demo-"): no llama al backend; usa flujo local
 * con proveedor simulado para vivir la experiencia completa hasta el final.
 */
function OneClickCompleteScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tbk_user = searchParams.get('tbk_user') || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tbk_user') : null);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const demoFlag = localStorage.getItem('oneclickDemoMode') === 'true';
    const effectiveTbk = tbk_user || (demoFlag ? `demo-${Date.now()}` : null);

    if (!effectiveTbk) {
      navigate('/client/card');
      return;
    }

    const email = localStorage.getItem('clientEmail') || '';
    const username = email
      ? email.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)
      : `user_${Date.now()}`;

    localStorage.setItem('tbk_user', effectiveTbk);
    localStorage.setItem('oneclick_username', username);

    const isDemoMode = (effectiveTbk && effectiveTbk.startsWith('demo-')) || demoFlag;

    // Modo demo: flujo local sin backend — asignar proveedor simulado para vivir la experiencia completa
    if (isDemoMode) {
      localStorage.removeItem('oneclickDemoMode');
      const clientId = localStorage.getItem('userId') || `client_${Date.now()}`;
      if (!localStorage.getItem('userId')) {
        localStorage.setItem('userId', clientId);
      }

      const machinery = localStorage.getItem('selectedMachinery') || 'retroexcavadora';
      const demoProviders = getDemoProviders(machinery, 3);

      // Siempre usar proveedores demo en modo tarjeta de prueba para garantizar asignación
      localStorage.setItem('matchedProviders', JSON.stringify(demoProviders));
      localStorage.setItem('selectedProviderIds', JSON.stringify(['demo-1']));
      localStorage.setItem('selectedProvider', JSON.stringify(demoProviders[0]));
      localStorage.setItem('currentServiceId', `demo-${Date.now()}`);

      navigate('/client/searching', { replace: true });
      return;
    }

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

      const FAST_ERROR_MS = 6000; // Mostrar error antes que esperar 15s
      const apiPromise = axios.post(
        `${BACKEND_URL}/api/service-requests`,
        payload,
        { timeout: 12000 }
      );
      const timeoutPromise = new Promise((_, r) => setTimeout(() => r(new Error('timeout')), FAST_ERROR_MS));
      try {
        const { data } = await Promise.race([apiPromise, timeoutPromise]);
        localStorage.setItem('currentServiceId', data.id);
        if (data.matching) {
          localStorage.setItem('matchingResult', JSON.stringify(data.matching));
        }
        navigate('/client/searching', { replace: true });
      } catch (e) {
        console.error('Error creando solicitud:', e);
        setError(e?.response?.data?.detail || e?.message || 'El servidor tardó demasiado. Intenta de nuevo.');
      }
    };

    createServiceAndContinue();
  }, [tbk_user, navigate, retryCount]);

  const handleRetry = () => {
    setError(null);
    setRetryCount((c) => c + 1);
  };

  const handleBack = () => {
    navigate('/client/card');
  };

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <MaqgoLogo size="small" />
        {error ? (
          <>
            <p style={{ color: '#EF4444', fontSize: 15, marginTop: 24, textAlign: 'center', maxWidth: 320 }}>
              {error}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24, width: '100%', maxWidth: 280 }}>
              <button className="maqgo-btn-primary" onClick={handleRetry} aria-label="Reintentar crear solicitud">
                Reintentar
              </button>
              <button
                onClick={handleBack}
                style={{
                  padding: 14,
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: 12,
                  color: 'rgba(255,255,255,0.95)',
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: "'Inter', sans-serif"
                }}
                aria-label="Volver a pago"
              >
                Volver a pago
              </button>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

export default OneClickCompleteScreen;
