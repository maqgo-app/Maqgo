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

  it('502 con cuerpo HTML (proxy) no muestra HTML al usuario', () => {
    expect(
      getHttpErrorMessage({
        response: {
          status: 502,
          data: '<!DOCTYPE html><html><body>Bad Gateway</body></html>'
        }
      })
    ).toMatch(/servicio|internet|minutos/i);
  });

  it('404 detail genérico Not Found (FastAPI) → mensaje en español', () => {
    expect(
      getHttpErrorMessage({
        response: { status: 404, data: { detail: 'Not Found' } }
      })
    ).toMatch(/no encontramos/i);
  });

  it('sin response = red', () => {
    expect(getHttpErrorMessage({ request: {} })).toMatch(/internet/i);
  });

  it('sin response con networkUnavailableMessage custom', () => {
    expect(
      getHttpErrorMessage(
        { request: {} },
        { networkUnavailableMessage: 'Mensaje de alta específico.' }
      )
    ).toBe('Mensaje de alta específico.');
  });

  it('AbortError', () => {
    expect(getHttpErrorMessage({ name: 'AbortError' })).toMatch(/tardó demasiado/i);
  });
});
