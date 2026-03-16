import React, { useState, useEffect } from 'react';

/**
 * Banner que se muestra cuando el usuario está sin conexión a internet.
 * Usa navigator.onLine y los eventos online/offline.
 */
function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: '#ff6b6b',
        color: '#fff',
        padding: '12px 16px',
        textAlign: 'center',
        fontSize: 14,
        fontWeight: 600,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
      }}
    >
      Sin conexión. Revisa tu internet e intenta de nuevo.
    </div>
  );
}

export default OfflineBanner;
