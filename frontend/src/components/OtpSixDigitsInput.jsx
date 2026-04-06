/**
 * STABLE MODULE — NO MODIFICAR SIN REVISIÓN DE PRODUCCIÓN
 */
import React, { useCallback, useEffect, useRef } from 'react';

/**
 * PATRÓN OTP: 6 cajas separadas. Nunca usar este layout para el número de teléfono (+56 va en LoginPhoneChileInput / PhoneNationalInput).
 *
 * Seis celdas OTP (tipo Uber): auto-foco, avance, backspace, pegado, onComplete opcional.
 * Estado canónico: un string de hasta 6 dígitos vía value / onChange (sin estado por celda en el padre).
 *
 * Consumidores:
 * - LoginScreen (flujo /login, paso OTP)
 * - LoginScreen, ForgotPasswordScreen, ProviderRegisterScreen, etc.
 */

function normalizeDigits(raw) {
  return String(raw ?? '').replace(/\D/g, '').slice(0, 6);
}

function OtpSixDigitsInput({
  id,
  name = 'one-time-code',
  value,
  onChange,
  onComplete,
  inputRef,
  placeholder: _placeholderIgnored = '000000',
  autoComplete = 'one-time-code',
  className = '',
  'data-testid': dataTestId = 'otp-input',
  disabled,
  onFocus,
  onBlur,
  'aria-label': ariaLabel,
}) {
  const cellRefs = useRef([]);
  const lastCompleteRef = useRef('');

  const code = normalizeDigits(value);

  const focus = useCallback((index) => {
    const el = cellRefs.current[index];
    if (el && !disabled) {
      el.focus();
      try {
        el.setSelectionRange(0, 1);
      } catch {
        /* noop */
      }
    }
  }, [disabled]);

  const setCellRef = useCallback(
    (index) => (el) => {
      cellRefs.current[index] = el;
      if (index === 0 && inputRef) {
        if (typeof inputRef === 'function') inputRef(el);
        else inputRef.current = el;
      }
    },
    [inputRef]
  );

  const commit = useCallback(
    (next) => {
      const n = normalizeDigits(next);
      onChange(n);
      if (n.length < 6) {
        lastCompleteRef.current = '';
      }
      if (n.length === 6 && typeof onComplete === 'function' && lastCompleteRef.current !== n) {
        lastCompleteRef.current = n;
        queueMicrotask(() => onComplete(n));
      }
    },
    [onChange, onComplete]
  );

  const handlePaste = useCallback(
    (e) => {
      e.preventDefault();
      const p = normalizeDigits(e.clipboardData.getData('text'));
      if (!p) return;
      commit(p);
      focus(Math.min(Math.max(p.length, 1), 5));
    },
    [commit, focus]
  );

  useEffect(() => {
    if (disabled) return;
    const t = requestAnimationFrame(() => focus(0));
    return () => cancelAnimationFrame(t);
  }, [disabled, focus]);

  const handleCellChange = useCallback(
    (index) => (e) => {
      const raw = e.target.value;
      const digitsOnly = normalizeDigits(raw);

      /* Web OTP / autofill puede volcar varios dígitos en una celda */
      if (digitsOnly.length > 1) {
        commit(digitsOnly);
        focus(Math.min(Math.max(digitsOnly.length - 1, 0), 5));
        return;
      }

      const d = digitsOnly.slice(-1);

      if (raw === '' || digitsOnly === '') {
        const next = code.slice(0, index) + code.slice(index + 1);
        commit(next);
        return;
      }

      if (!d) return;

      const next = (code.slice(0, index) + d + code.slice(index + 1)).slice(0, 6);
      commit(next);
      if (index < 5 && next.length > index) {
        focus(index + 1);
      }
    },
    [code, commit, focus]
  );

  const handleKeyDown = useCallback(
    (index) => (e) => {
      if (e.key === 'Backspace') {
        if (code[index]) {
          e.preventDefault();
          const next = code.slice(0, index) + code.slice(index + 1);
          commit(next);
          return;
        }
        if (index > 0) {
          e.preventDefault();
          focus(index - 1);
        }
      }
    },
    [code, commit, focus]
  );

  return (
    <div
      className={`maqgo-otp-six-wrap ${className}`.trim()}
      role="group"
      onPaste={handlePaste}
      data-testid={dataTestId}
      aria-label={ariaLabel}
    >
      {Array.from({ length: 6 }, (_, i) => (
        <input
          key={i}
          ref={setCellRef(i)}
          id={i === 0 ? id : `${id}-${i}`}
          name={i === 0 ? name : `${name}-${i}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? autoComplete : 'off'}
          maxLength={1}
          value={code[i] ?? ''}
          onChange={handleCellChange(i)}
          onKeyDown={handleKeyDown(i)}
          className="maqgo-otp-input maqgo-otp-cell"
          data-testid={`${dataTestId}-${i}`}
          disabled={disabled}
          onFocus={onFocus}
          onBlur={onBlur}
          spellCheck={false}
        />
      ))}
    </div>
  );
}

export default OtpSixDigitsInput;
