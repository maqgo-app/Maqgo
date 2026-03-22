import { describe, it, expect } from 'vitest';
import { getHttpErrorMessage } from './httpErrors';

describe('getHttpErrorMessage', () => {
  it('timeout axios', () => {
    expect(getHttpErrorMessage({ code: 'ECONNABORTED' })).toMatch(/tardó demasiado/i);
  });

  it('401 con mensaje custom', () => {
    expect(
      getHttpErrorMessage(
        { response: { status: 401, data: {} } },
        { statusMessages: { 401: 'Correo o contraseña incorrectos' } }
      )
    ).toBe('Correo o contraseña incorrectos');
  });

  it('prioriza detail string', () => {
    expect(
      getHttpErrorMessage({
        response: { status: 400, data: { detail: 'Celular inválido' } }
      })
    ).toBe('Celular inválido');
  });

  it('sin response = red', () => {
    expect(getHttpErrorMessage({ request: {} })).toMatch(/internet/i);
  });

  it('AbortError', () => {
    expect(getHttpErrorMessage({ name: 'AbortError' })).toMatch(/tardó demasiado/i);
  });
});
