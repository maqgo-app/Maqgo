import React, { useId, useState } from 'react';

/** Iconos inline (sin dependencia); aria-hidden en SVG */
function IconEye({ hidden }) {
  if (hidden) {
    return (
      <svg
        width={22}
        height={22}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d="M3 3l18 18M10.58 10.58a3 3 0 104.24 4.24M9.88 9.88A10.94 10.94 0 0112 9c7 0 11 8 11 8a18.47 18.47 0 01-4.07 5.12M6.62 6.62A18.47 18.47 0 013 12s4 8 11 8a10.94 10.94 0 004.52-1"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/**
 * Campo contraseña con toggle mostrar/ocultar (patrón estándar: Google, Apple ID, bancos).
 * - Por defecto oculto; el usuario elige ver (ojo) para comprobar lo escrito.
 * - Accesibilidad: aria-pressed, botón type="button". Si hay <label htmlFor={id}>, no pasar ariaLabel.
 */
function PasswordField({
  value,
  onChange,
  placeholder = 'Contraseña',
  autoComplete = 'current-password',
  name,
  'data-testid': dataTestId,
  id,
  ariaLabel,
  className = 'maqgo-input',
  style,
  inputStyle,
  error = false,
  minLength,
  maxLength
}) {
  const [visible, setVisible] = useState(false);
  const reactId = useId();
  const inputId = id || `password-field-${reactId}`;

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        padding: 0,
        overflow: 'hidden',
        borderColor: error ? '#f44336' : undefined,
        ...style
      }}
    >
      <input
        id={inputId}
        name={name}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        data-testid={dataTestId}
        {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
        spellCheck={false}
        autoCapitalize="off"
        {...(minLength != null ? { minLength } : {})}
        {...(maxLength != null ? { maxLength } : {})}
        style={{
          flex: 1,
          padding: '14px 12px',
          background: 'transparent',
          border: 'none',
          color: '#fff',
          fontSize: 15,
          outline: 'none',
          minWidth: 0,
          ...inputStyle
        }}
      />
      <button
        type="button"
        className="maqgo-password-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        aria-controls={inputId}
        style={{
          border: 'none',
          background: 'transparent',
          color: '#90BDD3',
          cursor: 'pointer',
          padding: '12px 14px',
          minWidth: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        <IconEye hidden={visible} />
      </button>
    </div>
  );
}

export default PasswordField;
