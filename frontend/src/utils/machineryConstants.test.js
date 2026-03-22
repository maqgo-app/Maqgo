import { describe, it, expect } from 'vitest';
import {
  MACHINERY_PER_SERVICE,
  MACHINERY_NO_TRANSPORT,
  MACHINERY_PER_HOUR,
} from './machineryConstants.js';

describe('machineryConstants', () => {
  it('por-viaje y sin traslado comparten la misma lista (referencia)', () => {
    expect(MACHINERY_NO_TRANSPORT).toBe(MACHINERY_PER_SERVICE);
    expect(MACHINERY_PER_SERVICE).toHaveLength(3);
  });

  it('por hora no se solapa con por servicio', () => {
    const overlap = MACHINERY_PER_HOUR.filter((id) => MACHINERY_PER_SERVICE.includes(id));
    expect(overlap).toEqual([]);
  });
});
