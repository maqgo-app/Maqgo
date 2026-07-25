import React from 'react';
import { Link } from 'react-router-dom';
import { ADMIN_SHELL_THEME } from './adminShellConfig';

export function AdminSurface({ title, subtitle, right, children }) {
  const theme = ADMIN_SHELL_THEME;
  return (
    <section
      style={{
        border: `1px solid ${theme.border}`,
        background: theme.panelBg,
        borderRadius: 18,
        padding: 18,
      }}
    >
      {(title || subtitle || right) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            {title ? <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-0.01em' }}>{title}</div> : null}
            {subtitle ? (
              <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5, color: theme.textMuted, maxWidth: 860 }}>{subtitle}</div>
            ) : null}
          </div>
          {right}
        </div>
      )}
      <div style={{ marginTop: title || subtitle || right ? 14 : 0 }}>{children}</div>
    </section>
  );
}

export function AdminStatChip({ label, value, tone = 'neutral' }) {
  const theme = ADMIN_SHELL_THEME;
  const tones = {
    neutral: {
      color: 'rgba(255,255,255,0.88)',
      bg: 'rgba(255,255,255,0.05)',
      border: theme.border,
    },
    warning: {
      color: '#FFE3B8',
      bg: 'rgba(217,161,90,0.16)',
      border: 'rgba(217,161,90,0.25)',
    },
    success: {
      color: '#CFF3D1',
      bg: 'rgba(102,187,106,0.16)',
      border: 'rgba(102,187,106,0.25)',
    },
    brand: {
      color: '#fff',
      bg: 'rgba(236,104,25,0.18)',
      border: 'rgba(236,104,25,0.30)',
    },
  };
  const style = tones[tone] || tones.neutral;
  return (
    <div
      style={{
        borderRadius: 14,
        border: `1px solid ${style.border}`,
        background: style.bg,
        padding: '12px 14px',
        minWidth: 140,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.45, color: 'rgba(255,255,255,0.55)' }}>
        {label}
      </div>
      <div style={{ marginTop: 8, fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em', color: style.color }}>{value}</div>
    </div>
  );
}

export function AdminActionLink({ to, label, tone = 'secondary' }) {
  const theme = ADMIN_SHELL_THEME;
  const style =
    tone === 'primary'
      ? {
          background: theme.brand,
          border: '1px solid transparent',
          color: '#fff',
        }
      : {
          background: 'transparent',
          border: `1px solid ${theme.borderStrong}`,
          color: '#fff',
        };
  return (
    <Link
      to={to}
      style={{
        ...style,
        textDecoration: 'none',
        padding: '10px 14px',
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 900,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {label}
    </Link>
  );
}

export function AdminDomainCard({ title, subtitle, bullets = [], to, actionLabel = 'Abrir dominio' }) {
  const theme = ADMIN_SHELL_THEME;
  return (
    <div
      style={{
        border: `1px solid ${theme.border}`,
        background: theme.panelBgSoft,
        borderRadius: 16,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minWidth: 0,
      }}
    >
      <div>
        <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-0.01em' }}>{title}</div>
        <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.45, color: theme.textMuted }}>{subtitle}</div>
      </div>
      {bullets.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {bullets.map((item) => (
            <div key={`${title}-${item}`} style={{ fontSize: 12, lineHeight: 1.45, color: 'rgba(255,255,255,0.80)' }}>
              {item}
            </div>
          ))}
        </div>
      ) : null}
      {to ? <AdminActionLink to={to} label={actionLabel} /> : null}
    </div>
  );
}
