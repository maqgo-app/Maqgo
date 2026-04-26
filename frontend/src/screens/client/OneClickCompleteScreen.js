import React, { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { getObject, getArray } from '../../utils/safeStorage';
import MaqgoLogo from '../../components/MaqgoLogo';
import { getDemoProviders } from '../../utils/pricing';

import BACKEND_URL from '../../utils/api';
import { getHttpErrorMessage } from '../../utils/httpErrors';
import { getOrCreateBookingId, idempotencyKey } from '../../utils/bookingPaymentKeys';
import {
  ensureBackendSessionForClientBooking,
  getClientDisplayNameForApi,
  getStoredProfileOptionsForBookingSync,
  persistClientEmailToStorage,
} from '../../utils/clientSessionForPayment';
import { getBookingLocationLineOrEmpty } from '../../utils/mapPlaceToAddress';
import { useCheckoutState } from '../../context/CheckoutContext';

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
  const cardSavedEventSent = useRef(false);
  const effectGenerationRef = useRef(0);
  const { dispatch: dispatchCheckout } = useCheckoutState();
  const [searchParams] = useSearchParams();
  const tbk_user =
    searchParams.get('tbk_user') ||
    (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tbk_user') : null);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  const skipMainFlow =
    typeof window !== 'undefined' &&
    !tbk_user &&
    localStorage.getItem('oneclickDemoMode') !== 'true';

  useLayoutEffect(() => {
    if (skipMainFlow) navigate('/client/card', { replace: true });
  }, [skipMainFlow, navigate]);

  useEffect(() => {
    if (skipMainFlow) return undefined;

    const gen = ++effectGenerationRef.current;
    let cancelled = false;
    const stale = () => cancelled || gen !== effectGenerationRef.current;

    const run = async () => {
      const demoFlag = localStorage.getItem('oneclickDemoMode') === 'true';
      const effectiveTbk = tbk_user || (demoFlag ? `demo-${Date.now()}` : null);

      if (!effectiveTbk) {
        navigate('/client/card', { replace: true });
        return;
      }

      let email = (localStorage.getItem('clientEmail') || '').trim();
      if (!email && effectiveTbk && !effectiveTbk.startsWith('demo-')) {
        try {
          const { data } = await axios.get(`${BACKEND_URL}/api/payments/oneclick/resume-context`, {
            params: { tbk_user: effectiveTbk },
            timeout: 10000,
          });
          if (stale()) return;
          const resolved = (data?.email || '').trim();
          if (resolved) {
            email = resolved;
            persistClientEmailToStorage(email);
          }
        } catch {
          /* se maneja abajo si sigue vacío */
        }
      }
      const username = email
        ? email.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)
        : `user_${Date.now()}`;

      localStorage.setItem('tbk_user', effectiveTbk);
      localStorage.setItem('oneclick_username', username);

      const isDemoMode = (effectiveTbk && effectiveTbk.startsWith('demo-')) || demoFlag;

      if (isDemoMode) {
        localStorage.removeItem('oneclickDemoMode');
        const clientId = localStorage.getItem('userId') || `client_${Date.now()}`;
        if (!localStorage.getItem('userId')) {
          localStorage.setItem('userId', clientId);
        }

        const machinery = localStorage.getItem('selectedMachinery') || 'retroexcavadora';
        const demoProviders = getDemoProviders(machinery, 3);

        localStorage.setItem('matchedProviders', JSON.stringify(demoProviders));
        localStorage.setItem('selectedProviderIds', JSON.stringify(['demo-1']));
        localStorage.setItem('selectedProvider', JSON.stringify(demoProviders[0]));
        localStorage.setItem('currentServiceId', `demo-${Date.now()}`);

        if (!stale()) {
          if (!cardSavedEventSent.current) {
            cardSavedEventSent.current = true;
            dispatchCheckout({ type: 'CARD_SAVED' });
          }
          navigate('/client/searching', { replace: true });
        }
        return;
      }

      const clientName = getClientDisplayNameForApi();

      try {
        const bookingId = getOrCreateBookingId();
        if (!email) {
          throw new Error(
            'No encontramos tu correo asociado a la tarjeta. Vuelve a la pantalla de pago, ingresa tu correo e intenta de nuevo.'
          );
        }

        await axios.post(
          `${BACKEND_URL}/api/payments/oneclick/save`,
          { email, tbk_user: effectiveTbk, username, booking_id: bookingId },
          {
            timeout: 8000,
            headers: { 'Idempotency-Key': idempotencyKey('oneclick-save') },
          }
        );

        if (stale()) return;
        await ensureBackendSessionForClientBooking(email, getStoredProfileOptionsForBookingSync());
        if (stale()) return;

        const clientId = localStorage.getItem('userId');
        if (!clientId) {
          throw new Error('No se pudo iniciar sesión. Intenta de nuevo.');
        }

        const serviceLat = parseFloat(localStorage.getItem('serviceLat'));
        const serviceLng = parseFloat(localStorage.getItem('serviceLng'));
        const serviceLocation = getBookingLocationLineOrEmpty();

        const basePrice = parseFloat(localStorage.getItem('serviceBasePrice')) || 150000;
        const transportFee = parseFloat(localStorage.getItem('serviceTransportFee')) || 0;
        const totalAmount = parseInt(localStorage.getItem('totalAmount') || localStorage.getItem('maxTotalAmount') || '0', 10);
        const needsInvoice = localStorage.getItem('needsInvoice') === 'true';
        const reservationType = localStorage.getItem('reservationType') || 'immediate';
        const urgencyType = localStorage.getItem('urgencyType') || '';

        const urgencyWindowMinutes = (() => {
          if (String(reservationType).toLowerCase() !== 'immediate') return null;
          const t = String(urgencyType || '').toLowerCase();
          if (t === 'urgent') return 90;
          if (t === 'express') return 240;
          if (t === 'today') return 480;
          return null;
        })();

        const selectedProvider = getObject('selectedProvider', {});
        const selectedProviderIds = getArray('selectedProviderIds', []);
        const selectedProviderId =
          selectedProviderIds.length > 0 ? selectedProviderIds[0] : (selectedProvider?.id || undefined);

        const payload = {
          booking_id: bookingId,
          clientId,
          clientName: clientName || 'Cliente MAQGO',
          clientEmail: email || undefined,
          selectedProviderId: selectedProviderId || undefined,
          selectedProviderIds: selectedProviderIds.length > 0 ? selectedProviderIds : undefined,
          location: {
            lat: Number.isFinite(serviceLat) ? serviceLat : -33.4489,
            lng: Number.isFinite(serviceLng) ? serviceLng : -70.6693,
            address: serviceLocation,
          },
          basePrice,
          transportFee,
          totalAmount: totalAmount > 0 ? totalAmount : undefined,
          needsInvoice: needsInvoice || undefined,
          machineryType: localStorage.getItem('selectedMachinery') || 'retroexcavadora',
          workdayAccepted: true,
          reservationType,
          scheduledDate: localStorage.getItem('selectedDate') || undefined,
          urgencyType: urgencyType || undefined,
          urgencyWindowMinutes: urgencyWindowMinutes || undefined,
        };

        const { data } = await axios.post(`${BACKEND_URL}/api/service-requests`, payload, {
          timeout: 12000,
          headers: { 'Idempotency-Key': idempotencyKey('service-request') },
        });
        if (stale()) return;
        localStorage.setItem('currentServiceId', data.id);
        if (data.booking_id) {
          localStorage.setItem('maqgo_booking_id', data.booking_id);
        }
        if (data.matching) {
          localStorage.setItem('matchingResult', JSON.stringify(data.matching));
        }
        if (!cardSavedEventSent.current) {
          cardSavedEventSent.current = true;
          dispatchCheckout({ type: 'CARD_SAVED' });
        }
        navigate('/client/searching', { replace: true });
      } catch (e) {
        if (stale()) return;
        if (import.meta.env.DEV) {
          console.error('Error OneClick complete:', e);
        } else {
          console.error('Error OneClick complete:', e?.message || 'request failed');
        }
        setError(
          getHttpErrorMessage(e, {
            fallback:
              typeof e?.message === 'string' && e.message.trim()
                ? e.message.trim()
                : 'El servidor tardó demasiado. Intenta de nuevo.',
          })
        );
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [tbk_user, navigate, retryCount, skipMainFlow, dispatchCheckout]);

  const handleRetry = () => {
    setError(null);
    setRetryCount((c) => c + 1);
  };

  const handleBack = () => {
    navigate('/client/card');
  };

  if (skipMainFlow) return null;

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div
        className="maqgo-screen"
        style={{ justifyContent: 'center', alignItems: 'center', padding: 'var(--maqgo-screen-padding-top) 24px 24px' }}
        role={error ? undefined : 'status'}
        aria-live={error ? undefined : 'polite'}
        aria-busy={error ? undefined : true}
      >
        <MaqgoLogo size="small" />
        {error ? (
          <>
            <p style={{ color: '#EF4444', fontSize: 15, marginTop: 24, textAlign: 'center', maxWidth: 320 }}>
              {error}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24, width: '100%', maxWidth: 280 }}>
              <button type="button" className="maqgo-btn-primary" onClick={handleRetry} aria-label="Reintentar crear solicitud">
                Reintentar
              </button>
              <button
                type="button"
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
                  fontFamily: "'Inter', sans-serif",
                }}
                aria-label="Volver a pago"
              >
                Volver a pago
              </button>
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                width: 50,
                height: 50,
                marginTop: 30,
                border: '4px solid rgba(255,255,255,0.2)',
                borderTopColor: '#EC6819',
                borderRadius: '50%',
                animation: 'maqgo-spin-oneclick-complete 1s linear infinite',
              }}
              aria-hidden="true"
            />
            <p style={{ color: '#fff', marginTop: 20, textAlign: 'center' }}>
              Tarjeta registrada. Preparando tu solicitud...
            </p>
          </>
        )}
        <style>{`@keyframes maqgo-spin-oneclick-complete { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

export default OneClickCompleteScreen;
