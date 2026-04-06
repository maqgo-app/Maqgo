import { describe, it, expect } from 'vitest';
import { getCartolaWeekInMonth, formatCartolaLabel } from './weekCartola';

describe('weekCartola', () => {
  it('Marzo 2025: primer lunes 3 → semana 1', () => {
    const r = getCartolaWeekInMonth('2025-03-03');
    expect(r.index).toBe(1);
    expect(r.monthLabel).toBe('Marzo');
  });

  it('Marzo 2025: segundo lunes 10 → semana 2', () => {
    const r = getCartolaWeekInMonth('2025-03-10');
    expect(r.index).toBe(2);
  });

  it('formatCartolaLabel incluye rango', () => {
    const s = formatCartolaLabel('2025-03-10', {
      week_start_date: '2025-03-10',
      week_end_date_inclusive: '2025-03-16',
    });
    expect(s).toContain('Marzo 2025');
    expect(s).toContain('Semana 2');
    expect(s).toContain('2025-03-10');
  });
});
