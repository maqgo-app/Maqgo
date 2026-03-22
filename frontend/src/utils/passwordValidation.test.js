import { describe, it, expect } from 'vitest';
import { validatePassword, getPasswordHint, PASSWORD_RULES } from './passwordValidation';

describe('PASSWORD_RULES', () => {
  it('8–12 caracteres', () => {
    expect(PASSWORD_RULES.minLength).toBe(8);
    expect(PASSWORD_RULES.maxLength).toBe(12);
  });
});

describe('validatePassword', () => {
  const hint = getPasswordHint(true);

  it('acepta 8 caracteres con letra y número', () => {
    expect(validatePassword('abc12xyz', hint)).toBe('');
  });

  it('acepta 12 caracteres con letra y número', () => {
    expect(validatePassword('abcdef12ABCD', hint)).toBe('');
  });

  it('rechaza menos de 8', () => {
    expect(validatePassword('ab1', hint)).toBe(hint);
  });

  it('rechaza más de 12', () => {
    expect(validatePassword('abcdefghijklm1', hint)).toBe(hint);
  });

  it('rechaza sin número', () => {
    expect(validatePassword('abcdefgh', hint)).toBe(hint);
  });

  it('rechaza sin letra', () => {
    expect(validatePassword('12345678', hint)).toBe(hint);
  });
});
