import React from 'react';

/**
 * PATRÓN TELÉFONO: prefijo +56 + un solo campo (no cajas tipo OTP). OTP = OtpSixDigitsInput — no mezclar.
 * Celular Chile: prefijo +56 fijo en la misma caja; el usuario ingresa 9 dígitos (9xxxxxxx).
 */
function PhoneNationalInput({
  id,
  name,
  value,
  onDigitsChange,
  placeholder = '9 1234 5678',
  maxLength = 9,
  autoComplete = 'tel-national',
  inputMode = 'tel',
  'data-testid': dataTestId,
  inputRef,
  className = '',
  ariaLabel,
  containerStyle,
}) {
  return (
    <div className={`maqgo-phone-row${className ? ` ${className}` : ''}`} style={containerStyle}>
      <span className="maqgo-phone-prefix" aria-hidden="true">
        +56
      </span>
      <input
        ref={inputRef}
        id={id}
        name={name}
        className="maqgo-phone-input"
        type="tel"
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        maxLength={maxLength}
        value={value}
        onChange={(e) => {
          const digits = String(e.target.value || '')
            .replace(/\D/g, '')
            .slice(0, maxLength);
          onDigitsChange(digits);
        }}
        data-testid={dataTestId}
        aria-label={ariaLabel}
      />
    </div>
  );
}

export default PhoneNationalInput;
