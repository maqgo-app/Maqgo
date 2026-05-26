import React, { useEffect, useMemo, useState } from 'react';

function isStandalone() {
  try {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.navigator && window.navigator.standalone) return true;
    return false;
  } catch {
    return false;
  }
}

function isLikelyMobile() {
  try {
    const ua = String(navigator.userAgent || '').toLowerCase();
    return /iphone|ipad|ipod|android/.test(ua);
  } catch {
    return false;
  }
}

function isIOS() {
  try {
    const ua = String(navigator.userAgent || '').toLowerCase();
    return /iphone|ipad|ipod/.test(ua);
  } catch {
    return false;
  }
}

export default function InstallPwaBanner({ bottomOffset = 0 }) {
  const [hidden, setHidden] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  const canShow = useMemo(() => {
    if (!isLikelyMobile()) return false;
    if (isStandalone()) return false;
    return true;
  }, []);

  useEffect(() => {
    if (!canShow) {
      setHidden(true);
      return;
    }
    try {
      const dismissed = localStorage.getItem('pwaInstallDismissed') === '1';
      if (dismissed) {
        setHidden(true);
        return;
      }
      setHidden(false);
    } catch {
      setHidden(true);
    }
  }, [canShow]);

  useEffect(() => {
    if (!canShow) return;
    const handler = (e) => {
      try {
        e.preventDefault();
      } catch {
        void 0;
      }
      setDeferredPrompt(e);
      setHidden(false);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [canShow]);

  useEffect(() => {
    if (!canShow) return;
    if (isIOS()) {
      setHidden(false);
    }
  }, [canShow]);

  if (hidden) return null;

  const onDismiss = () => {
    try {
      localStorage.setItem('pwaInstallDismissed', '1');
    } catch {
      void 0;
    }
    setHidden(true);
  };

  const onInstall = async () => {
    if (!deferredPrompt) {
      onDismiss();
      return;
    }
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch {
      void 0;
    }
    setDeferredPrompt(null);
    onDismiss();
  };

  const ios = isIOS();
  const hasPrompt = Boolean(deferredPrompt);

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 24px)',
        maxWidth: 430,
        bottom: 146 + (Number(bottomOffset) || 0),
        zIndex: 'var(--maqgo-z-fixed-bar)',
        background: 'rgba(16,16,16,0.92)',
        border: '1px solid rgba(236,104,25,0.35)',
        borderRadius: 14,
        padding: 12,
        color: '#fff',
        backdropFilter: 'blur(10px)',
      }}
      role="status"
      aria-label="Instalar MAQGO"
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Instala MAQGO en tu teléfono</div>
      <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 10 }}>
        Se abre más rápido y podrás recibir avisos del servicio como una app.
      </div>
      {ios && (
        <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 10 }}>
          En iPhone: Compartir → Agregar a pantalla de inicio.
        </div>
      )}
      {!ios && !hasPrompt && (
        <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 10 }}>
          En Android: menú del navegador → Instalar app.
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        {hasPrompt ? (
          <button
            onClick={onInstall}
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
            Instalar
          </button>
        ) : (
          <button
            onClick={onDismiss}
            style={{
              flex: 1,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 12,
              padding: '10px 12px',
              color: 'rgba(255,255,255,0.9)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Entendido
          </button>
        )}
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
