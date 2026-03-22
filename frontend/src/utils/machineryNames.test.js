import { describe, it, expect } from 'vitest';
import { getMachineryId, isPerTripMachineryType } from './machineryNames.js';

describe('machineryNames', () => {
  describe('getMachineryId', () => {
    it('normaliza id canónico', () => {
      expect(getMachineryId('camion_pluma')).toBe('camion_pluma');
    });

    it('resuelve nombre visible a id', () => {
      expect(getMachineryId('Camión Pluma (Hiab)')).toBe('camion_pluma');
      expect(getMachineryId('Camión Tolva')).toBe('camion_tolva');
    });
  });

  describe('isPerTripMachineryType', () => {
    it('true para pluma/aljibe/tolva por id o label', () => {
      expect(isPerTripMachineryType('camion_aljibe')).toBe(true);
      expect(isPerTripMachineryType('Camión Aljibe')).toBe(true);
    });

    it('false para maquinaria por hora', () => {
      expect(isPerTripMachineryType('retroexcavadora')).toBe(false);
      expect(isPerTripMachineryType('Retroexcavadora')).toBe(false);
    });
  });
});
