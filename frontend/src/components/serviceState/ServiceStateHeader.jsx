import React from 'react';

function toneToStyles(tone) {
  if (tone === 'success') return { bg: 'rgba(76, 175, 80, 0.12)', border: 'rgba(76, 175, 80, 0.22)', fg: '#4CAF50' };
  if (tone === 'warn') return { bg: 'rgba(255, 193, 7, 0.12)', border: 'rgba(255, 193, 7, 0.22)', fg: '#FFC107' };
  if (tone === 'danger') return { bg: 'rgba(244, 67, 54, 0.12)', border: 'rgba(244, 67, 54, 0.22)', fg: '#F44336' };
  return { bg: 'rgba(144, 189, 211, 0.14)', border: 'rgba(144, 189, 211, 0.22)', fg: '#90BDD3' };
}

function ServiceStateHeader({
  icon,
  title,
  subtitle,
  badgeLabel,
  badgeTone = 'info',
  meta = [],
}) {
  const badge = badgeLabel ? toneToStyles(badgeTone) : null;
  return (
    <div className="w-full flex flex-col items-center text-center" style={{ paddingTop: 8, paddingBottom: 4 }}>
      <div
        className="flex items-center justify-center"
        style={{
          width: 56,
          height: 56,
          borderRadius: 999,
          background: badge ? badge.bg : 'rgba(255,255,255,0.06)',
          border: `1px solid ${badge ? badge.border : 'rgba(255,255,255,0.10)'}`,
          color: badge ? badge.fg : 'rgba(255,255,255,0.90)'
        }}
      >
        {icon}
      </div>

      <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 800, margin: '12px 0 6px' }}>{title}</h1>

      {subtitle ? (
        <p style={{ color: 'rgba(255,255,255,0.90)', fontSize: 14, margin: 0, lineHeight: 1.4 }}>{subtitle}</p>
      ) : null}

      {badge ? (
        <div style={{ marginTop: 10 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 26,
              padding: '0 12px',
              borderRadius: 999,
              background: badge.bg,
              border: `1px solid ${badge.border}`,
              color: badge.fg,
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0.6,
              textTransform: 'uppercase'
            }}
          >
            {badgeLabel}
          </span>
        </div>
      ) : null}

      {meta.length ? (
        <div className="flex flex-wrap items-center justify-center" style={{ gap: 8, marginTop: 10 }}>
          {meta.map((m) => (
            <span
              key={`${m.label}-${m.value}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 24,
                padding: '0 10px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.10)',
                color: 'rgba(255,255,255,0.92)',
                fontSize: 12,
                fontWeight: 700
              }}
            >
              {m.label}: {m.value}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default ServiceStateHeader;

