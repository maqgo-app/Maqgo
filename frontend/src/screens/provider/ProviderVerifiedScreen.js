import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MaqgoLogo from '../../components/MaqgoLogo';

import BACKEND_URL, { hasPersistedSessionCredentials } from '../../utils/api';
import { getObject } from '../../utils/safeStorage';
import { establishSession, persistLoginSessionMetadata } from '../../utils/sessionPersistence';
import { useAuth } from '../../context/authHooks';
import { getProviderOnboardingNextPath } from '../../utils/providerOnboardingStatus';

const JSON_POST_TIMEOUT = {
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
};

/** Evita “Preparando tu cuenta…” infinito si una petición cuelga sin responder. */
const ESTABLISH_SESSION_MAX_MS = 35000;
const REFRESH_USER_MAX_MS = 25000;

/**
 * Pantalla P2.1 - Número Verificado Proveedor
 * Debe completar sesión (token + RBAC en localStorage) antes de /provider/data.
 * Cliente/proveedor/operator usan SMS OTP; no depender de login por correo/contraseña.
 */
function ProviderVerifiedScreen({ setUserRole, setUserId }) {
  const navigate = useNavigate();
  const { refreshUserData } = useAuth();
  const [phase, setPhase] = useState('working'); // working | done | error
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;

    const applyProviderSession = ({
      id,
      token,
      roles,
      effectiveRole,
      provider_role,
      owner_id,
      phone,
    }) => {
      establishSession({ id, token });
      persistLoginSessionMetadata({
        id,
        token,
        role: effectiveRole || 'provider',
        roles: Array.isArray(roles) ? roles : ['provider'],
        provider_role,
        owner_id,
        phone,
      });
      setUserRole?.(effectiveRole || 'provider');
      setUserId?.(id);
      localStorage.setItem('providerCameFromWelcome', 'true');
    };

    const establishSession = async () => {
      const data = getObject('registerData', {});
      const existingId = localStorage.getItem('userId');
      const otpToken = localStorage.getItem('token') || localStorage.getItem('authToken');

      try {
        const res = await axios.post(
          `${BACKEND_URL}/api/users`,
          {
            role: 'provider',
            name: `${data.nombre || 'Proveedor'} ${data.apellido || ''}`.trim(),
            email: data.email || `provider_${Date.now()}@maqgo.cl`,
          },
          JSON_POST_TIMEOUT
        );
        const roles = Array.isArray(res.data?.roles) ? res.data.roles : ['provider'];
        applyProviderSession({
          id: res.data.id,
          token: res.data.token,
          roles,
          effectiveRole: 'provider',
          provider_role: res.data.provider_role,
          owner_id: res.data.owner_id,
          phone: res.data.phone,
        });
        return true;
      } catch {
        if (existingId && String(existingId).startsWith('user_') && otpToken) {
          applyProviderSession({
            id: existingId,
            token: otpToken,
            roles: ['provider'],
            effectiveRole: 'provider',
            provider_role: 'super_master',
            owner_id: null,
            phone: null,
          });
          return true;
        }
        if (existingId && String(existingId).startsWith('user_')) {
          applyProviderSession({
            id: existingId,
            token: null,
            roles: ['provider'],
            effectiveRole: 'provider',
            provider_role: 'super_master',
            owner_id: null,
            phone: null,
          });
          return false;
        }
        return false;
      }
    };

    const run = async () => {
      try {
        let ok;
        try {
          ok = await Promise.race([
            establishSession(),
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error('ESTABLISH_TIMEOUT')), ESTABLISH_SESSION_MAX_MS);
            }),
          ]);
        } catch (e) {
          if (e?.message === 'ESTABLISH_TIMEOUT') {
            if (!cancelled) {
              setPhase('error');
              setErrorMsg(
                'La activación de tu cuenta tardó demasiado. Revisa tu conexión, recarga la página o vuelve a iniciar sesión para continuar.'
              );
            }
            return;
          }
          throw e;
        }
        if (cancelled) return;
        if (!ok || !hasPersistedSessionCredentials()) {
          setPhase('error');
          setErrorMsg(
            'No pudimos activar tu sesión. Vuelve a iniciar sesión para continuar el registro.'
          );
          return;
        }
        try {
          await Promise.race([
            refreshUserData(),
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error('REFRESH_TIMEOUT')), REFRESH_USER_MAX_MS);
            }),
          ]);
        } catch (e) {
          if (e?.message === 'REFRESH_TIMEOUT') {
            if (!cancelled) {
              setPhase('error');
              setErrorMsg(
                'Tu sesión quedó creada pero no pudimos sincronizar datos. Recarga la página o vuelve a iniciar sesión.'
              );
            }
            return;
          }
          throw e;
        }
        if (cancelled) return;
        setPhase('done');
        navigate(getProviderOnboardingNextPath(), { replace: true });
      } catch {
        if (!cancelled) {
          setPhase('error');
          setErrorMsg('Algo salió mal al preparar tu cuenta. Intenta de nuevo o inicia sesión.');
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate, setUserRole, setUserId, refreshUserData]);

  const sessionOk = hasPersistedSessionCredentials();

  return (
    <div className="maqgo-app maqgo-provider-funnel">
      <div className="maqgo-screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div
          style={{
            position: 'absolute',
            top: 55,
            left: 0,
            right: 0,
          }}
        >
          <MaqgoLogo size="small" />
        </div>

        <div className="maqgo-success-icon">
          <svg width="55" height="55" viewBox="0 0 55 55" fill="none">
            <path
              d="M14 27L23 36L41 18"
              stroke="#fff"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1
          style={{
            color: '#fff',
            fontSize: 26,
            fontWeight: 700,
            textAlign: 'center',
            marginBottom: 10,
          }}
        >
          ¡Número verificado con éxito!
        </h1>

        <p
          style={{
            color: 'rgba(255,255,255,0.9)',
            fontSize: 15,
            textAlign: 'center',
            marginBottom: 24,
          }}
        >
          Te llevamos a tu panel de proveedor; desde ahí puedes completar el registro paso a paso.
        </p>

        {phase === 'working' && (
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, marginBottom: 24 }}>
            Preparando tu cuenta…
          </p>
        )}

        {phase === 'error' && (
          <p
            style={{
              color: '#ffb4b4',
              fontSize: 14,
              textAlign: 'center',
              marginBottom: 24,
              maxWidth: 320,
            }}
          >
            {errorMsg}
          </p>
        )}

        <button
          type="button"
          className="maqgo-btn-primary"
          onClick={() => navigate(getProviderOnboardingNextPath(), { replace: true })}
          disabled={!sessionOk}
          style={{ width: '100%', maxWidth: 320, opacity: sessionOk ? 1 : 0.5 }}
        >
          CONTINUAR
        </button>

        {phase === 'error' && (
          <button
            type="button"
            className="maqgo-btn-primary"
            onClick={() => {
              navigate('/provider/register', {
                replace: true,
                state: { redirect: getProviderOnboardingNextPath() },
              });
            }}
            style={{
              width: '100%',
              maxWidth: 320,
              marginTop: 12,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.35)',
            }}
          >
            Ir a registro proveedor
          </button>
        )}
      </div>
    </div>
  );
}

export default ProviderVerifiedScreen;
