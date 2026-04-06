import React, { useState, useRef, createContext, useContext, useCallback, useMemo } from 'react';
import { Z_INDEX } from '../constants/zIndex';

const ToastContext = createContext();

/** Segundo arg de toast.* : número = ms, string = replaceId; si primero es ms, tercero = replaceId. */
function resolveDurationAndReplaceId(arg2, arg3) {
  const DEFAULT_MS = 3000;
  if (typeof arg2 === 'number' && Number.isFinite(arg2) && arg2 > 0) {
    return { duration: arg2, replaceId: typeof arg3 === 'string' ? arg3 : null };
  }
  return { duration: DEFAULT_MS, replaceId: typeof arg2 === 'string' ? arg2 : null };
}

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      success: () => {},
      error: (msg) => alert(msg),
      warning: (msg) => alert(msg),
      info: () => {},
      dismissAll: () => {},
    };
  }
  return context;
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const toastIdSeqRef = useRef(0);
  const hideTimeoutIdsRef = useRef(new Set());

  const dismissAll = useCallback(() => {
    hideTimeoutIdsRef.current.forEach((tid) => clearTimeout(tid));
    hideTimeoutIdsRef.current.clear();
    setToasts([]);
  }, []);

  /**
   * Referencias estables: si el objeto `toast` se recreara en cada render, cualquier
   * useCallback(..., [toast]) en pantallas hijas cambiaría en cada toast mostrado y
   * useEffect([...]) volvería a disparar fetches en bucle (ej. Marketing & CAC).
   *
   * Segundo argumento de success/warning/error/info:
   * - número → duración en ms (tercero opcional: replaceId string)
   * - string → replaceId (duración default 3000)
   */
  const showToast = useCallback((message, type = 'info', duration = 3000, replaceId = null) => {
    const id = ++toastIdSeqRef.current;
    setToasts((prev) => {
      const filtered = replaceId ? prev.filter((t) => t.replaceId !== replaceId) : prev;
      return [...filtered, { id, message, type, replaceId }];
    });
    const tid = setTimeout(() => {
      hideTimeoutIdsRef.current.delete(tid);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
    hideTimeoutIdsRef.current.add(tid);
  }, []);

  const toast = useMemo(
    () => ({
      success: (msg, arg2, arg3) => {
        const { duration, replaceId } = resolveDurationAndReplaceId(arg2, arg3);
        return showToast(msg, 'success', duration, replaceId);
      },
      error: (msg, arg2, arg3) => {
        const { duration, replaceId } = resolveDurationAndReplaceId(arg2, arg3);
        return showToast(msg, 'error', duration, replaceId);
      },
      warning: (msg, arg2, arg3) => {
        const { duration, replaceId } = resolveDurationAndReplaceId(arg2, arg3);
        return showToast(msg, 'warning', duration, replaceId);
      },
      info: (msg, arg2, arg3) => {
        const { duration, replaceId } = resolveDurationAndReplaceId(arg2, arg3);
        return showToast(msg, 'info', duration, replaceId);
      },
      dismissAll,
    }),
    [showToast, dismissAll],
  );

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
        /* Debajo de cabeceras con “volver” (evita tapar el botón atrás) */
        top: 'max(52px, env(safe-area-inset-top, 0px) + 40px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: Z_INDEX.modal,
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
