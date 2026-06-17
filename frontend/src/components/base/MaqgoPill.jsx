import React from 'react';

export default function MaqgoPill({
  children,
  align = 'center',
  tone = 'neutral',
  style = {},
  ...rest
}) {
  const colors =
    tone === 'info'
      ? {
          background: 'rgba(59, 130, 246, 0.10)',
          border: '1px solid rgba(59, 130, 246, 0.18)',
          color: 'rgba(255,255,255,0.92)',
        }
      : {
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.10)',
          color: 'rgba(255,255,255,0.86)',
        };

  return (
    <div style={{ display: 'flex', justifyContent: align === 'left' ? 'flex-start' : 'center' }}>
      <div
        style={{
          borderRadius: 999,
          padding: '9px 14px',
          maxWidth: '100%',
          ...colors,
          ...style,
        }}
        {...rest}
      >
        <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.25, textAlign: align === 'left' ? 'left' : 'center' }}>{children}</div>
      </div>
    </div>
  );
}

