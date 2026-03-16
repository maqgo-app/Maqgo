import React from 'react';

/**
 * Input base MAQGO.
 * Wrapper sobre input nativo con clase maqgo-input.
 * @param {string} error - mensaje de error (muestra borde rojo y texto)
 * @param {string} label - etiqueta opcional
 */
function MaqgoInput({
  label,
  error,
  className = '',
  style = {},
  'aria-label': ariaLabel,
  ...rest
}) {
  const inputClass = ['maqgo-input', className].filter(Boolean).join(' ');
  const hasError = !!error;

  return (
    <div style={{ marginBottom: 12 }}>
      {label && (
        <label
          style={{
            color: 'rgba(255,255,255,0.95)',
            fontSize: 13,
            marginBottom: 6,
            display: 'block',
            fontFamily: "'Inter', sans-serif"
          }}
        >
          {label}
        </label>
      )}
      <input
        className={inputClass}
        style={{
          ...style,
          ...(hasError ? { borderColor: 'var(--maqgo-error, #E53935)' } : {})
        }}
        aria-label={ariaLabel || label}
        aria-invalid={hasError}
        aria-describedby={hasError ? 'input-error' : undefined}
        {...rest}
      />
      {hasError && (
        <p
          id="input-error"
          style={{
            color: 'var(--maqgo-error, #E53935)',
            fontSize: 12,
            marginTop: 4,
            marginBottom: 0
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

export default MaqgoInput;
