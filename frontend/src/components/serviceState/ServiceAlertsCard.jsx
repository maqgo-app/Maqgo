import React from 'react';
import MaqgoCard from '../base/MaqgoCard';

function toneToColor(tone) {
  if (tone === 'success') return '#4CAF50';
  if (tone === 'warn') return '#FFC107';
  if (tone === 'danger') return '#F44336';
  return '#90BDD3';
}

function ServiceAlertsCard({ alerts = [] }) {
  return (
    <MaqgoCard style={{ borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>
          Avisos
        </div>
        <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: 12, fontWeight: 600 }}>
          Fuente de verdad
        </div>
      </div>

      {alerts.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {alerts.map((a, idx) => {
            const c = toneToColor(a.tone);
            return (
              <div
                key={`${a.title}-${idx}`}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '12px 12px',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)'
                }}
              >
                <div style={{ width: 4, borderRadius: 999, background: c, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ color: '#fff', fontSize: 13, fontWeight: 800, lineHeight: 1.2 }}>{a.title}</div>
                    {a.rightSlot}
                  </div>
                  {a.description ? (
                    <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: 13, marginTop: 4, lineHeight: 1.35 }}>
                      {a.description}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{
          padding: 12,
          borderRadius: 12,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.82)',
          fontSize: 13,
          lineHeight: 1.35
        }}>
          Sin avisos recientes.
        </div>
      )}

      <div style={{ marginTop: 12, color: 'rgba(255,255,255,0.62)', fontSize: 12, lineHeight: 1.35 }}>
        El estado y los eventos del servicio se registran en Avisos.
      </div>
    </MaqgoCard>
  );
}

export default ServiceAlertsCard;

