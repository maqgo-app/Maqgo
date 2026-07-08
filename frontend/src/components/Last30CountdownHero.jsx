import React, { useMemo } from 'react';

function clamp01(n) {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function formatTime(seconds) {
  const s = Math.max(0, Number(seconds || 0));
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
}

export default function Last30CountdownHero({ remainingSeconds, loading }) {
  const remaining = Math.max(0, Number(remainingSeconds || 0));
  const progress = clamp01(remaining / (30 * 60));
  const isCritical = remaining > 0 && remaining <= 5 * 60;

  const ring = useMemo(() => {
    const r = 92;
    const c = 2 * Math.PI * r;
    const dashOffset = c * (1 - progress);
    return { r, c, dashOffset };
  }, [progress]);

  return (
    <div
      style={{
        background: 'rgba(255, 193, 7, 0.14)',
        border: isCritical ? '2px solid rgba(255, 193, 7, 0.72)' : '1px solid rgba(255, 193, 7, 0.35)',
        borderRadius: 16,
        padding: 18,
        width: '100%',
        marginBottom: 16,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        boxShadow: isCritical ? '0 0 0 6px rgba(255, 193, 7, 0.10)' : 'none',
        animation: isCritical ? 'maqgoLast30Pulse 1.8s ease-in-out infinite' : 'none',
      }}
    >
      <div style={{ color: '#ffc107', fontWeight: 900, letterSpacing: 0.2 }}>Tiempo restante</div>

      <div style={{ position: 'relative', width: 220, height: 220, display: 'grid', placeItems: 'center' }}>
        <svg width="220" height="220" viewBox="0 0 220 220" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="110" cy="110" r={ring.r} fill="none" stroke="rgba(255, 193, 7, 0.20)" strokeWidth="10" />
          <circle
            cx="110"
            cy="110"
            r={ring.r}
            fill="none"
            stroke="#ffc107"
            strokeWidth="10"
            strokeDasharray={ring.c}
            strokeDashoffset={ring.dashOffset}
            strokeLinecap="round"
          />
        </svg>

        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transform: 'rotate(0deg)',
          }}
        >
          <div style={{ color: '#fff', fontSize: 46, fontWeight: 950, letterSpacing: 1 }}>
            {loading ? '--:--' : formatTime(remaining)}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: 700 }}>
            {loading ? 'Cargando…' : isCritical ? 'Últimos minutos' : 'Cuenta regresiva'}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes maqgoLast30Pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.01); }
        }
      `}</style>
    </div>
  );
}

