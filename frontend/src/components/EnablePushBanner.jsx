import React, { useEffect, useMemo, useState } from 'react';
import { requestPushPermissionAndSubscribe } from '../utils/pushNotifications';

export default function EnablePushBanner({ user }) {
  const [hidden, setHidden] = useState(true);
  const canUse = useMemo(() => {
    try {
      if (typeof window === 'undefined') return false;
      if (!('serviceWorker' in navigator)) return false;
      if (!('PushManager' in window)) return false;
      if (typeof Notification === 'undefined') return false;
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setHidden(true);
      return;
    }
    if (!canUse) {
      setHidden(true);
      return;
    }
    try {
      const dismissed = localStorage.getItem('pushBannerDismissed') === '1';
      if (dismissed) {
        setHidden(true);
        return;
      }
      const perm = Notification.permission;
      if (perm === 'granted') {
        setHidden(true);
        return;
      }
      setHidden(false);
    } catch {
      setHidden(true);
    }
  }, [user?.id, canUse]);

  if (hidden) return null;

  const onDismiss = () => {
    try {
      localStorage.setItem('pushBannerDismissed', '1');
    } catch {
      void 0;
    }
    setHidden(true);
  };

  const onEnable = async () => {
    const res = await requestPushPermissionAndSubscribe();
    if (res?.success) {
      onDismiss();
      return;
    }
    if (res?.denied) {
      onDismiss();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 86,
        zIndex: 9999,
        background: 'rgba(16,16,16,0.92)',
        border: '1px solid rgba(236,104,25,0.35)',
        borderRadius: 14,
        padding: 12,
        color: '#fff',
        backdropFilter: 'blur(10px)',
      }}
      role="status"
      aria-label="Activar avisos"
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Activa avisos en tiempo real</div>
      <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 10 }}>
        Te avisamos al instante si cambia el estado del servicio, incluso con la app cerrada.
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onEnable}
          style={{
            flex: 1,
            background: '#EC6819',
            border: 'none',
            borderRadius: 12,
            padding: '10px 12px',
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Activar
        </button>
        <button
          onClick={onDismiss}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: 12,
            padding: '10px 12px',
            color: 'rgba(255,255,255,0.9)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}

