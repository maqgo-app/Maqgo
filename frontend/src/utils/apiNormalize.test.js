import { describe, it, expect } from 'vitest';
import { normalizeBackendBase } from './apiNormalize.js';

describe('normalizeBackendBase', () => {
  it('quita /api final para no duplicar prefijo en rutas', () => {
    expect(normalizeBackendBase('https://api2.maqgo.cl/api')).toBe('https://api2.maqgo.cl');
    expect(normalizeBackendBase('https://api2.maqgo.cl/api/')).toBe('https://api2.maqgo.cl');
  });
  it('mantiene host sin /api', () => {
    expect(normalizeBackendBase('https://api2.maqgo.cl')).toBe('https://api2.maqgo.cl');
  });
});
