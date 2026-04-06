import { describe, it, expect } from 'vitest';
import {
  parseAndSortDates,
  getDateRangeShort,
  getPerTripDateLabel,
  getPerTripCountLabel,
} from './bookingDates.js';

describe('bookingDates', () => {
  it('parseAndSortDates ordena strings YYYY-MM-DD', () => {
    const dates = parseAndSortDates(['2025-03-14', '2025-03-12', '2025-03-13']);
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual([
      '2025-03-12',
      '2025-03-13',
      '2025-03-14',
    ]);
  });

  it('getPerTripDateLabel: varios días incluye viajes 1 por día', () => {
    const label = getPerTripDateLabel(['2025-03-12', '2025-03-13', '2025-03-14'], '', {
      includeYear: true,
    });
    expect(label).toContain('3 viajes (1 por día)');
    expect(label).toMatch(/–|—/);
  });

  it('getPerTripCountLabel', () => {
    expect(getPerTripCountLabel(['a', 'b'], 2)).toMatch(/1 por día/);
    expect(getPerTripCountLabel([], 1)).toBe('Valor viaje');
  });

  it('getDateRangeShort una fecha', () => {
    const s = getDateRangeShort(['2025-06-01'], '', { includeYear: true });
    expect(s.length).toBeGreaterThan(0);
  });
});
