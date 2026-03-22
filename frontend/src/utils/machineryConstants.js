/**
 * Constantes de tipos de maquinaria (listas canónicas).
 * Alineadas con backend/pricing/constants.py — sin imports para evitar ciclos entre pricing ↔ machineryNames.
 */

export const MACHINERY_PER_HOUR = [
  'retroexcavadora', 'excavadora', 'bulldozer', 'motoniveladora',
  'compactadora', 'minicargador', 'grua',
];

/** Cobro por servicio/viaje (pluma, aljibe, tolva). */
export const MACHINERY_PER_SERVICE = [
  'camion_pluma', 'camion_aljibe', 'camion_tolva',
];

export const MACHINERY_NEEDS_TRANSPORT = [
  'retroexcavadora', 'excavadora', 'bulldozer', 'motoniveladora',
  'compactadora', 'minicargador', 'grua',
];

/** Misma regla que backend: sin fee de traslado para estos tipos. */
export const MACHINERY_NO_TRANSPORT = MACHINERY_PER_SERVICE;
