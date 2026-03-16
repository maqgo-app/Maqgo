import React, { useState, createContext, useContext } from 'react';

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      success: (msg) => console.log('✅', msg),
      error: (msg) => alert(msg),
      warning: (msg) => alert(msg),
      info: (msg) => console.log('ℹ️', msg)
    };
  }
  return context;
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = (message, type = 'info', duration = 3000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  };

  const toast = {
    success: (msg) => showToast(msg, 'success'),
    error: (msg) => showToast(msg, 'error'),
    warning: (msg) => showToast(msg, 'warning'),
    info: (msg) => showToast(msg, 'info')
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts }) {
  if (toasts.length === 0) return null;
  const getColors = (type) => {
    switch (type) {
      case 'success': return { bg: '#90BDD3', icon: '✓' };
      case 'error': return { bg: '#E53935', icon: '✕' };
      case 'warning': return { bg: '#EC6819', icon: '!' };
      default: return { bg: '#363636', icon: 'ℹ' };
    }
  };
  return (
    <div
      role="region"
      aria-label="Notificaciones"
      style={{
        position: 'fixed',
        top: 'max(20px, env(safe-area-inset-top, 0px) + 12px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        width: '90%',
        maxWidth: 360
      }}
    >
      {toasts.map(t => {
        const { bg, icon } = getColors(t.type);
        return (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="maqgo-toast-item"
            style={{
              background: bg,
              color: '#fff',
              padding: '14px 18px',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
            }}
          >
            <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }} aria-hidden="true">{icon}</span>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}

export default ToastProvider;
