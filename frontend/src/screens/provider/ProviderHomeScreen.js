import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';
import { useToast } from '../../components/Toast';
import { getObject } from '../../utils/safeStorage';
import { playNewRequestSound, playTapSound, unlockAudio } from '../../utils/notificationSounds';
import { vibrate } from '../../utils/uberUX';
import BACKEND_URL, { hasPersistedSessionCredentials } from '../../utils/api';
import { traceRedirectToLogin } from '../../utils/traceLoginRedirect';
import {
  readProviderAvailableDefaultOn,
  writeProviderAvailability,
  subscribeProviderAvailability,
  isDemoProviderUserId,
} from '../../utils/providerAvailability';

function ProviderHomeScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const inFlightRef = useRef(false);
  const errorStreakRef = useRef(0);
  const lastErrorLogAtRef = useRef(0);
  const [available, setAvailable] = useState(() => readProviderAvailableDefaultOn());
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [bankDataComplete, setBankDataComplete] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [showBankWarningModal, setShowBankWarningModal] = useState(false);
  const isBlockedByBank = onboardingCompleted && !bankDataComplete && !available;
  const providerData = getObject('providerData', {});
  const machineData = getObject('machineData', {});
  const companyComplete = !!(providerData?.businessName && providerData?.rut);
  const machineComplete = !!(machineData?.machineryType && machineData?.licensePlate);

  const nextActivationStep = (() => {
    if (!companyComplete) {
      return {
        title: 'Completa datos de empresa',
        hint: 'Necesario para activar cobros.',
        actionLabel: 'Ir a empresa',
        onClick: () => navigate('/provider/profile/empresa'),
      };
    }
    if (!machineComplete) {
      return {
        title: 'Completa tu máquina',
        hint: 'Define tipo y patente.',
        actionLabel: 'Ir a máquinas',
        onClick: () => navigate('/provider/machines'),
      };
    }
    if (!onboardingCompleted) {
      return {
        title: 'Finaliza activación',
        hint: 'Termina el flujo de activación en Máquinas.',
        actionLabel: 'Continuar',
        onClick: () => navigate('/provider/machines'),
      };
    }
    if (!bankDataComplete) {
      return {
        title: 'Completa datos bancarios',
        hint: 'Requerido para recibir pagos.',
        actionLabel: 'Ir a banco',
        onClick: () => navigate('/provider/profile/banco'),
      };
    }
    return null;
  })();

  const isBankComplete = (bankData) =>
    !!bankData?.bank &&
    !!bankData?.accountType &&
    !!bankData?.accountNumber &&
    !!bankData?.holderName &&
    !!bankData?.holderRut;

  useEffect(() => {
    const unsubscribe = subscribeProviderAvailability((next) => setAvailable(next));
    return unsubscribe;
  }, []);

  useEffect(() => {
    const completedLocal = localStorage.getItem('providerOnboardingCompleted') === 'true';
    setOnboardingCompleted(completedLocal);

    const bankDataLocal = getObject('bankData', {});
    setBankDataComplete(isBankComplete(bankDataLocal));

    const userId = localStorage.getItem('userId');
    if (userId && !isDemoProviderUserId(userId)) {
      axios
        .get(`${BACKEND_URL}/api/users/${userId}`, { timeout: 5000 })
        .then((res) => {
          const onboardingDb = Boolean(res.data?.onboarding_completed);
          setOnboardingCompleted(onboardingDb || completedLocal);
          if (onboardingDb) localStorage.setItem('providerOnboardingCompleted', 'true');

          const avail = res.data?.isAvailable ?? res.data?.available ?? false;
          setAvailable(!!avail);
          writeProviderAvailability(!!avail, { notify: false });

          const bankFromDb = res.data?.providerData?.bankData;
          if (bankFromDb && typeof bankFromDb === 'object') {
            localStorage.setItem('bankData', JSON.stringify(bankFromDb));
            setBankDataComplete(isBankComplete(bankFromDb));
          }
        })
        .catch(() => {
          setAvailable(readProviderAvailableDefaultOn());
        });
    } else {
      setAvailable(readProviderAvailableDefaultOn());
    }

    setBootstrapped(true);
  }, []);

  useEffect(() => {
    const checkRequests = async () => {
      const userId = localStorage.getItem('userId');
      if (userId && available && onboardingCompleted) {
        const res = await axios.get(`${BACKEND_URL}/api/service-requests/pending`);
        if (res.data && res.data.length > 0) {
          localStorage.setItem('incomingRequest', JSON.stringify(res.data[0]));
          unlockAudio();
          playNewRequestSound();
          vibrate('newRequest');
          navigate('/provider/request-received');
        }
      }
    };

    if (!available || !onboardingCompleted) return undefined;

    let cancelled = false;
    let timeoutId = null;
    const baseDelayMs = 5000;
    const maxDelayMs = 30000;

    const run = async () => {
      if (cancelled) return;
      if (inFlightRef.current) {
        timeoutId = setTimeout(run, 1000);
        return;
      }

      inFlightRef.current = true;
      try {
        await checkRequests();
        errorStreakRef.current = 0;
      } catch (e) {
        const now = Date.now();
        if (now - lastErrorLogAtRef.current > 60000 && import.meta.env.DEV) {
          console.warn('ProviderHomeScreen poll error:', e?.message || e);
          lastErrorLogAtRef.current = now;
        }
        errorStreakRef.current += 1;
      } finally {
        inFlightRef.current = false;
        const delay = Math.min(maxDelayMs, baseDelayMs * (2 ** errorStreakRef.current));
        timeoutId = setTimeout(run, delay);
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [available, onboardingCompleted, navigate]);

  const toggleAvailability = async () => {
    if (!onboardingCompleted || isToggling) return;
    if (!bankDataComplete && !available) {
      setShowBankWarningModal(true);
      toast.warning('Completa tus datos bancarios antes de conectarte.');
      return;
    }

    setIsToggling(true);
    const userId = localStorage.getItem('userId');
    if (!userId) {
      setIsToggling(false);
      toast.error('Debes iniciar sesión para conectarte.');
      return;
    }

    const newStatus = !available;
    setAvailable(newStatus);
    writeProviderAvailability(newStatus);
    unlockAudio();
    playTapSound();
    vibrate(newStatus ? 'accepted' : 'tap');

    if (isDemoProviderUserId(userId)) {
      toast.success(newStatus ? 'Te conectaste' : 'Te desconectaste', 'availability');
      setIsToggling(false);
      return;
    }

    const doPatch = () =>
      axios.patch(
        `${BACKEND_URL}/api/users/${userId}`,
        { available: newStatus },
        { timeout: 8000 }
      );

    try {
      await doPatch();
      toast.success(newStatus ? 'Te conectaste' : 'Te desconectaste', 'availability');
    } catch (e) {
      const isRetryable =
        !e.response ||
        e.code === 'ECONNABORTED' ||
        e.code === 'ERR_NETWORK' ||
        e.message?.includes('Network Error');
      if (isRetryable) {
        try {
          await doPatch();
          toast.success(newStatus ? 'Te conectaste' : 'Te desconectaste', 'availability');
          setIsToggling(false);
          return;
        } catch {
          /* fallback abajo */
        }
      }

      const status = e.response?.status;
      const detail = e.response?.data?.detail;
      const detailStr =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((d) => d?.msg || d).join(' ')
            : '';
      const isNetworkError =
        !e.response ||
        e.code === 'ECONNREFUSED' ||
        e.code === 'ERR_NETWORK' ||
        e.code === 'ECONNABORTED' ||
        e.message?.includes('Network Error') ||
        e.message?.includes('timeout');

      if (status === 404 || (detailStr && detailStr.toLowerCase().includes('no encontrado'))) {
        setAvailable(!newStatus);
        writeProviderAvailability(!newStatus);
        toast.error('Tu sesión expiró. Cierra sesión e inicia sesión nuevamente.');
      } else if (isNetworkError) {
        toast.success(
          newStatus
            ? 'Te conectaste. No se pudo sincronizar (sin conexión).'
            : 'Te desconectaste. No se pudo sincronizar (sin conexión).',
          'availability'
        );
      } else {
        setAvailable(!newStatus);
        writeProviderAvailability(!newStatus);
        toast.error('No se pudo conectar. Intenta de nuevo.');
      }
    } finally {
      setIsToggling(false);
    }
  };

  if (bootstrapped && !onboardingCompleted && !hasPersistedSessionCredentials()) {
    traceRedirectToLogin('src/screens/provider/ProviderHomeScreen.js');
    return <Navigate to="/login" replace state={{ entry: 'provider', redirect: '/provider/home' }} />;
  }

  if (!bootstrapped) {
    return (
      <div className="maqgo-app maqgo-provider-funnel">
        <div className="maqgo-screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <MaqgoLogo size="small" />
        </div>
      </div>
    );
  }

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div className="maqgo-screen" style={{ paddingBottom: 80, justifyContent: 'flex-start' }}>
        <MaqgoLogo size="medium" style={{ marginBottom: 24 }} />

        <div
          style={{
            background: '#2A2A2A',
            borderRadius: 12,
            padding: 14,
            marginBottom: 14,
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: '0 0 8px', textTransform: 'uppercase' }}>
            Activación
          </p>
          {nextActivationStep ? (
            <>
              <p style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>
                {nextActivationStep.title}
              </p>
              <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, margin: '0 0 10px' }}>
                {nextActivationStep.hint}
              </p>
              <button
                onClick={nextActivationStep.onClick}
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 10,
                  border: 'none',
                  background: '#EC6819',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {nextActivationStep.actionLabel}
              </button>
            </>
          ) : (
            <p style={{ color: '#90BDD3', fontSize: 14, fontWeight: 600, margin: 0 }}>
              Activación completa.
            </p>
          )}
        </div>

        <div
          style={{
            background: 'linear-gradient(180deg, #363636 0%, #2f2f2f 100%)',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.06)',
            padding: 18,
            marginBottom: 12,
            opacity: onboardingCompleted ? 1 : 0.6,
            textAlign: 'center',
          }}
        >
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, margin: 0, marginBottom: 8 }}>
            Estado
          </p>
          <p style={{ color: available ? '#90BDD3' : '#ffb182', fontSize: 24, margin: 0, fontWeight: 700 }}>
            {!onboardingCompleted ? 'Bloqueado' : available ? 'Conectado' : 'Pausado'}
          </p>
          <button
            onClick={toggleAvailability}
            disabled={!onboardingCompleted || isToggling || isBlockedByBank}
            style={{
              marginTop: 12,
              width: '100%',
              padding: 13,
              borderRadius: 12,
              border: available ? '1px solid rgba(255,255,255,0.25)' : 'none',
              background: available ? 'rgba(255,255,255,0.08)' : '#EC6819',
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              cursor: onboardingCompleted && !isToggling && !isBlockedByBank ? 'pointer' : 'not-allowed',
              opacity: isToggling ? 0.75 : 1,
            }}
            data-testid="availability-toggle"
          >
            {!onboardingCompleted
              ? 'Completa activación'
              : isBlockedByBank
                ? 'Completar banco en Perfil'
                : isToggling
                  ? 'Actualizando...'
                  : available
                    ? 'Pausar disponibilidad'
                    : 'Activar disponibilidad'}
          </button>
        </div>

        <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, margin: 0, textAlign: 'center', lineHeight: 1.4 }}>
          {!onboardingCompleted
            ? 'Completa activación para empezar a recibir solicitudes.'
            : !bankDataComplete
              ? 'Completa banco en Perfil para poder conectarte.'
              : available
                ? 'Estás visible para nuevas solicitudes.'
                : 'Puedes activarte cuando quieras desde Inicio o Perfil.'}
        </p>
      </div>

      {showBankWarningModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.78)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200,
            padding: 24,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 360,
              background: '#2A2A2A',
              border: '1px solid rgba(236, 104, 25, 0.45)',
              borderRadius: 14,
              padding: 20,
            }}
          >
            <h3 style={{ color: '#fff', fontSize: 17, margin: '0 0 8px' }}>Completa datos bancarios</h3>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 1.5, margin: '0 0 16px' }}>
              Para conectarte y recibir solicitudes, primero debes configurar tus datos bancarios.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowBankWarningModal(false)}
                style={{
                  flex: 1,
                  padding: 11,
                  borderRadius: 20,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'transparent',
                  color: '#fff',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Ahora no
              </button>
              <button
                onClick={() => {
                  setShowBankWarningModal(false);
                  navigate('/provider/profile/banco');
                }}
                style={{
                  flex: 1,
                  padding: 11,
                  borderRadius: 20,
                  border: 'none',
                  background: '#EC6819',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Ir a banco
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProviderHomeScreen;
