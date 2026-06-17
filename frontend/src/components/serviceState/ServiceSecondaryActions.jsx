import React from 'react';
import MaqgoButton from '../base/MaqgoButton';

function ServiceSecondaryActions({ actions = [] }) {
  if (!actions.length) return null;

  return (
    <div className="w-full" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {actions.map((a) => {
        const isPrimary = a.variant === 'primary';
        const style =
          a.variant === 'ghost'
            ? {
                width: '100%',
                padding: 14,
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.16)',
                borderRadius: 14,
                color: 'rgba(255,255,255,0.95)',
                fontSize: 14,
                fontWeight: 700,
              }
            : a.variant === 'outline'
              ? {
                  width: '100%',
                  padding: 14,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.16)',
                  borderRadius: 14,
                  color: 'rgba(255,255,255,0.95)',
                  fontSize: 14,
                  fontWeight: 800,
                }
              : undefined;

        return isPrimary ? (
          <MaqgoButton
            key={a.key || a.label}
            variant="primary"
            onClick={a.onClick}
            disabled={a.disabled}
            loading={a.loading}
            aria-label={a.ariaLabel}
            data-testid={a.testId}
          >
            {a.label}
          </MaqgoButton>
        ) : (
          <button
            key={a.key || a.label}
            type="button"
            onClick={a.onClick}
            disabled={a.disabled}
            aria-label={a.ariaLabel || a.label}
            data-testid={a.testId}
            style={{
              cursor: a.disabled ? 'not-allowed' : 'pointer',
              opacity: a.disabled ? 0.6 : 1,
              ...(style || {})
            }}
          >
            {a.label}
          </button>
        );
      })}
    </div>
  );
}

export default ServiceSecondaryActions;
