import { describe, it, expect } from 'vitest';
import { getActivationErrorMessage, ACTIVATION_UNDETERMINED_MESSAGE } from './activationErrors';

describe('getActivationErrorMessage', () => {
  it('prioriza detail string del backend', () => {
    expect(
      getActivationErrorMessage({
        response: { status: 404, data: { detail: 'Código inexistente' } },
      })
    ).toBe('Código inexistente');
  });

  it('soporta detail FastAPI array (422)', () => {
    expect(
      getActivationErrorMessage({
        response: {
          status: 422,
          data: { detail: [{ msg: 'Field required' }] },
        },
      })
    ).toBe('Field required');
  });

  it('sin response no inventa causa', () => {
    expect(getActivationErrorMessage({ request: {} })).toBe(ACTIVATION_UNDETERMINED_MESSAGE);
  });

  it('timeout no inventa causa', () => {
    expect(getActivationErrorMessage({ code: 'ECONNABORTED' })).toBe(ACTIVATION_UNDETERMINED_MESSAGE);
  });

  it('500 con texto genérico no lo filtra como causa', () => {
    expect(
      getActivationErrorMessage({
        response: { status: 500, data: 'Internal Server Error' },
      })
    ).toBe(ACTIVATION_UNDETERMINED_MESSAGE);
  });

  it('500 con Error interno: preserva detail', () => {
    expect(
      getActivationErrorMessage({
        response: { status: 500, data: { detail: 'Error interno: invitación con expiración inválida' } },
      })
    ).toBe('Error interno: invitación con expiración inválida');
  });

  it('mensaje legacy de causa indeterminada se normaliza', () => {
    expect(
      getActivationErrorMessage({
        response: {
          status: 500,
          data: {
            detail:
              'No fue posible determinar la causa del error. Inténtalo nuevamente o contacta a soporte.',
          },
        },
      })
    ).toBe(ACTIVATION_UNDETERMINED_MESSAGE);
  });
});
