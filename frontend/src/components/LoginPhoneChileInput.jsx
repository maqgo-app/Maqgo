import React, { useCallback } from 'react';

/**
 * PATRÓN TELÉFONO (Chile): un solo input + prefijo +56 fijo. Nunca usar cajas separadas (eso es solo OTP).
 * Ver también: OtpSixDigitsInput.jsx (6 cajas) — no mezclar ambos patrones en la misma pantalla/paso.
 */
function sanitizeNationalDigits(raw) {
  let s = String(raw ?? '');
  s = s.replace(/\s/g, '');
  if (s.startsWith('+56')) {
    s = s.slice(3);
  } else if (s.startsWith('56') && s.length > 9) {
    s = s.slice(2);
  }
  return s.replace(/\D/g, '').slice(0, 9);
}

function LoginPhoneChileInput({
  id,
  name,
  value,
  onDigitsChange,
  'data-testid': dataTestId,
  ariaLabel = 'Número de celular sin prefijo',
}) {
  const handlePaste = useCallback(
    (e) => {
      e.preventDefault();
      const pasted = e.clipboardData?.getData('text') ?? '';
      onDigitsChange(sanitizeNationalDigits(pasted));
    },
    [onDigitsChange]
  );

  const handleChange = useCallback(
    (e) => {
      onDigitsChange(sanitizeNationalDigits(e.target.value));
    },
    [onDigitsChange]
  );

  return (
    <div
      className="maqgo-phone-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        borderRadius: 10,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.2)',
        background: 'rgba(0,0,0,0.25)',
      }}
    >
      <span
        className="maqgo-phone-prefix"
        aria-hidden="true"
        style={{
          flex: '0 0 auto',
          padding: '12px 10px 12px 14px',
          color: 'rgba(255,255,255,0.85)',
          fontSize: 16,
          fontWeight: 500,
          userSelect: 'none',
          borderRight: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        +56
      </span>
      <input
        id={id}
        name={name}
        className="maqgo-phone-input"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="912345678"
        maxLength={9}
        value={value}
        onChange={handleChange}
        onPaste={handlePaste}
        data-testid={dataTestId}
        aria-label={ariaLabel}
        style={{
          flex: 1,
          minWidth: 0,
          border: 'none',
          background: 'transparent',
          color: '#fff',
          fontSize: 16,
          padding: '12px 14px 12px 10px',
          outline: 'none',
        }}
      />
    </div>
  );
}

export default LoginPhoneChileInput;
