/**
 * Etiqueta estilo cartola / control interno: mes + "semana N del mes"
 * según cuántos lunes hubo en ese mes hasta la fecha del lunes ancla (ISO).
 * No cambia el modelo de datos: solo lectura humana junto a week_start.
 */

const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/**
 * @param {string} mondayIso YYYY-MM-DD (lunes normalizado)
 * @returns {{ index: number, monthLabel: string, year: number }}
 */
export function getCartolaWeekInMonth(mondayIso) {
  if (!mondayIso || typeof mondayIso !== 'string') {
    return { index: 0, monthLabel: '', year: 0 };
  }
  const [y, m, d] = mondayIso.split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) return { index: 0, monthLabel: '', year: 0 };

  let mondaysCount = 0;
  for (let day = 1; day <= d; day += 1) {
    const dt = new Date(y, m - 1, day, 12, 0, 0);
    if (dt.getDay() === 1) mondaysCount += 1;
  }
  return {
    index: mondaysCount,
    monthLabel: MESES_ES[m - 1] || '',
    year: y,
  };
}

/**
 * Texto una línea para UI.
 * @param {string} mondayIso
 * @param {{ week_start_date?: string, week_end_date_inclusive?: string }} [meta]
 */
export function formatCartolaLabel(mondayIso, meta) {
  const { index, monthLabel, year } = getCartolaWeekInMonth(mondayIso);
  if (!index || !monthLabel) return '';
  const from = meta?.week_start_date || mondayIso;
  const to = meta?.week_end_date_inclusive || '';
  const rango = to ? `${from} → ${to}` : from;
  return `${monthLabel} ${year} · Semana ${index} del mes · ${rango} (lun–dom)`;
}
