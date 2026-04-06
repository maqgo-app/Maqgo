import { describe, it, expect, beforeEach } from 'vitest';
import {
  getMachineryId,
  isPerTripMachineryType,
  clearAllClientCapacityListsAndSpec,
  persistClientCapacitySelection,
} from './machineryNames.js';

function createMemoryLocalStorage() {
  let store = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
}

describe('machineryNames', () => {
  beforeEach(() => {
    globalThis.localStorage = createMemoryLocalStorage();
  });

  describe('persistClientCapacitySelection / clearAllClientCapacityListsAndSpec', () => {
    it('persiste lista y selectedMachinerySpec para compactadora (multi)', () => {
      persistClientCapacitySelection('compactadora', [5, 8]);
      expect(JSON.parse(localStorage.getItem('clientRequiredRollerTonList'))).toEqual([5, 8]);
      expect(localStorage.getItem('selectedMachinerySpec')).toMatch(/5/);
      expect(localStorage.getItem('selectedMachinerySpec')).toMatch(/8/);
    });

    it('lista vacía elimina clave y resumen (mejores opciones sin filtro)', () => {
      localStorage.setItem('clientRequiredRollerTonList', '[6]');
      localStorage.setItem('selectedMachinerySpec', '6 ton');
      persistClientCapacitySelection('compactadora', []);
      expect(localStorage.getItem('clientRequiredRollerTonList')).toBeNull();
      expect(localStorage.getItem('selectedMachinerySpec')).toBeNull();
    });

    it('clearAllClientCapacityListsAndSpec limpia todas las claves de capacidad', () => {
      localStorage.setItem('clientRequiredRollerTonList', '[10]');
      localStorage.setItem('clientRequiredM3List', '[12]');
      clearAllClientCapacityListsAndSpec();
      expect(localStorage.getItem('clientRequiredRollerTonList')).toBeNull();
      expect(localStorage.getItem('clientRequiredM3List')).toBeNull();
      expect(localStorage.getItem('selectedMachinerySpec')).toBeNull();
    });
  });

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
