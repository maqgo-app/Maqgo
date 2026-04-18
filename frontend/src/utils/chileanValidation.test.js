import { describe, it, expect } from 'vitest';
import {
  RUT_MAX_LENGTH,
  RUT_MIN_LENGTH,
  validateEmail,
  validateCelularChile,
  sanitizeRutInput,
  validateRut,
  formatRut,
  searchComunas,
  getRegionForComuna,
} from './chileanValidation';

describe('chileanValidation', () => {
  describe('validateEmail', () => {
    it('valida email correcto y rechaza vacíos o inválidos', () => {
      expect(validateEmail('test@maqgo.cl')).toBe('');
      expect(validateEmail('   ')).toBe('El correo es requerido');
      expect(validateEmail('correo-invalido')).toBe('Por favor ingresa un correo válido');
    });
  });

  describe('validateCelularChile', () => {
    it('acepta formatos válidos chilenos', () => {
      expect(validateCelularChile('912345678')).toBe('');
      expect(validateCelularChile('9 1234 5678')).toBe('');
    });

    it('rechaza largo incorrecto y prefijo inválido', () => {
      expect(validateCelularChile('91234')).toBe('El celular debe tener 9 dígitos');
      expect(validateCelularChile('812345678')).toBe('El celular debe empezar con 9');
    });
  });

  describe('RUT', () => {
    it('expone límites de largo esperados', () => {
      expect(RUT_MIN_LENGTH).toBe(8);
      expect(RUT_MAX_LENGTH).toBe(9);
    });

    it('sanitizeRutInput limpia caracteres y limita el largo', () => {
      expect(sanitizeRutInput('12.345.678-k')).toBe('12345678K');
      expect(sanitizeRutInput('12.345.678-KXX999')).toBe('12345678K');
      expect(sanitizeRutInput(null)).toBe('');
    });

    it('validateRut acepta formatos válidos y rechaza inválidos', () => {
      expect(validateRut('12.345.678-5')).toBe(true);
      expect(validateRut('12345678-5')).toBe(true);
      expect(validateRut('12345678-K')).toBe(false);
      expect(validateRut('12.345.678-0')).toBe(false);
      expect(validateRut('abc')).toBe(false);
    });

    it('formatRut da formato estándar o vacío si no hay input', () => {
      expect(formatRut('123456785')).toBe('12.345.678-5');
      expect(formatRut('')).toBe('');
      expect(formatRut('k')).toBe('K');
    });
  });

  describe('comunas', () => {
    it('searchComunas retorna resultados acotados y tolera acentos', () => {
      const results = searchComunas('nunoa');
      expect(results).toContain('Ñuñoa');
      expect(searchComunas('sa', 3).length).toBeLessThanOrEqual(3);
      expect(searchComunas('x')).toEqual([]);
    });

    it('getRegionForComuna retorna región o null', () => {
      expect(getRegionForComuna('Providencia')).toBe('Región Metropolitana');
      expect(getRegionForComuna('Comuna Inexistente')).toBeNull();
    });
  });
});
