import { describe, it, expect } from 'vitest';
import { normalizeBackendBase } from './apiNormalize.js';

describe('normalizeBackendBase', () => {
  it('quita /api final para no duplicar prefijo en rutas', () => {
    expect(normalizeBackendBase('https://api.maqgo.cl/api')).toBe('https://api.maqgo.cl');
    expect(normalizeBackendBase('https://api.maqgo.cl/api/')).toBe('https://api.maqgo.cl');
  });
  it('mantiene host sin /api', () => {
    expect(normalizeBackendBase('https://api.maqgo.cl')).toBe('https://api.maqgo.cl');
  });
});
