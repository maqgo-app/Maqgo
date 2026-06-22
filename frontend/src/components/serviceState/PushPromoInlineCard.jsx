import React, { useEffect, useMemo, useState } from 'react';
import MaqgoCard from '../base/MaqgoCard';
import { requestPushPermissionAndSubscribe } from '../../utils/pushNotifications';

function PushPromoInlineCard({ message, testId }) {
  const canShow = useMemo(() => {
    if (typeof window === 'undefined') return false;
    if (typeof Notification === 'undefined') return false;
    if (!('serviceWorker' in navigator)) return false;
    if (!('PushManager' in window)) return false;
    return Notification.permission === 'default';
  }, []);

  const [visible, setVisible] = useState(canShow);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!canShow) return;
    const id = window.setInterval(() => {
      try {
        if (Notification.permission !== 'default') setVisible(false);
      } catch {
        void 0;
      }
    }, 1500);
    return () => window.clearInterval(id);
  }, [canShow]);

  if (!visible) return null;

  const onEnable = async () => {
    setLoading(true);
    try {
      await requestPushPermissionAndSubscribe();
    } finally {
      setLoading(false);
      try {
        if (Notification.permission !== 'default') setVisible(false);
      } catch {
        void 0;
      }
    }
  };

  return (
    <MaqgoCard style={{ borderRadius: 14, padding: 14, background: 'rgba(144, 189, 211, 0.12)', border: '1px solid rgba(144, 189, 211, 0.22)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 1.35 }}>
          {message}
        </div>
        <button
          type="button"
          onClick={onEnable}
          disabled={loading}
          data-testid={testId}
          style={{
            height: 34,
            padding: '0 12px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.16)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 900,
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.7 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Activando…' : 'Activar Push'}
        </button>
      </div>
    </MaqgoCard>
  );
}

export default PushPromoInlineCard;

