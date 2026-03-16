import React from 'react';

/**
 * Botón base MAQGO.
 * Usa clases existentes para no romper estilos. Props para variantes futuras.
 * @param {string} variant - 'primary' | 'secondary' | 'ghost'
 * @param {boolean} disabled
 * @param {boolean} loading
 * @param {string} className - clases adicionales
 */
function MaqgoButton({
  children,
  variant = 'primary',
  disabled = false,
  loading = false,
  className = '',
  style = {},
  onClick,
  type = 'button',
  'aria-label': ariaLabel,
  ...rest
}) {
  const baseClass = variant === 'primary' ? 'maqgo-btn-primary' : '';
  const classes = [baseClass, className].filter(Boolean).join(' ');

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      onClick={onClick}
      style={style}
      aria-label={ariaLabel}
      aria-busy={loading}
      {...rest}
    >
      {loading ? (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span
            style={{
              width: 16,
              height: 16,
              border: '2px solid rgba(255,255,255,0.4)',
              borderTopColor: '#fff',
              borderRadius: '50%',
              animation: 'maqgo-spin 0.8s linear infinite'
            }}
          />
          Cargando...
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export default MaqgoButton;
