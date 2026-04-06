/**
 * Nombres completos de maquinaria para mostrar en la app.
 * Siempre primera letra en mayúscula.
 */

import { MACHINERY_PER_SERVICE } from './machineryConstants';

/**
 * Nombres canónicos de maquinaria. Fuente única de verdad.
 * Usar: import { MACHINERY_NAMES } from '../../utils/machineryNames';
 */
export const MACHINERY_NAMES = {
  retroexcavadora: 'Retroexcavadora',
  camion_tolva: 'Camión Tolva',
  excavadora: 'Excavadora Hidráulica',
  excavadora_hidraulica: 'Excavadora Hidráulica',
  bulldozer: 'Bulldozer',
  motoniveladora: 'Motoniveladora',
  grua: 'Grúa Móvil',
  camion_pluma: 'Camión Pluma (Hiab)',
  compactadora: 'Compactadora / Rodillo',
  camion_aljibe: 'Camión Aljibe',
  minicargador: 'Minicargador',
  rodillo: 'Rodillo Compactador'
};

/** Descripción mínima por maquinaria (una línea) para la pantalla de selección */
export const MACHINERY_DESCRIPTIONS = {
  retroexcavadora: 'Excavación, zanjas y movimiento de tierra',
  camion_tolva: 'Transporte y descarga de áridos o escombros',
  excavadora: 'Excavación profunda y demolición',
  excavadora_hidraulica: 'Excavación profunda y demolición',
  bulldozer: 'Nivelación y empuje de grandes volúmenes',
  motoniveladora: 'Nivelación de superficies y caminos',
  grua: 'Izaje y carga de materiales',
  camion_pluma: 'Carga y descarga con grúa (Hiab)',
  compactadora: 'Compactación de suelo y asfalto',
  camion_aljibe: 'Transporte de agua para riego u obras',
  minicargador: 'Carga y movimiento en espacios reducidos',
  rodillo: 'Compactación de suelo y asfalto'
};

/**
 * Dato clave por maquinaria (ref. plataformas top: Cat, Komatsu, etc.)
 * Se muestra en la pantalla siguiente a la selección de maquinaria.
 * Tolva: m³ (selector aparte). Aljibe: litros. Pluma: ton·m. Rodillo/compactadora: peso y ancho tambor.
 */
export const MACHINERY_KEY_SPEC = {
  retroexcavadora: 'Balde ref.: 0,3–0,6 m³',
  camion_tolva: 'Capacidad ref.: 12–20 m³ (elige abajo)',
  excavadora: 'Peso ref.: 20–30 ton',
  excavadora_hidraulica: 'Peso ref.: 20–30 ton',
  bulldozer: 'Potencia ref.: 160–220 HP',
  motoniveladora: 'Ancho hoja ref.: 3–4 m',
  grua: 'Capacidad izaje ref.: 25–35 ton',
  camion_pluma: 'Capacidad pluma ref.: 8–12 ton·m',
  compactadora: 'Peso ref.: 3–8 ton · Ancho tambor ref.: 1,5–2 m',
  camion_aljibe: 'Capacidad ref.: 10.000 litros',
  minicargador: 'Balde ref.: 0,3–0,5 m³',
  rodillo: 'Peso ref.: 3–8 ton · Ancho tambor ref.: 1,5–2 m'
};

/**
 * Obtiene el nombre completo de la maquinaria para mostrar.
 * @param {string} machineryType - ID (retroexcavadora, excavadora, etc.) o nombre ya formateado
 * @returns {string} Nombre completo con primera letra en mayúscula
 */
export function getMachineryDisplayName(machineryType) {
  if (!machineryType) return 'Maquinaria';
  const key = (machineryType || '').toLowerCase().replace(/\s+/g, '_').replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u');
  if (MACHINERY_NAMES[key]) return MACHINERY_NAMES[key];
  return machineryType.split(/[\s_]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/** Dato clave para mostrar en la pantalla siguiente a selección de maquinaria; null si no hay. */
export function getMachineryKeySpec(machineryType) {
  if (!machineryType) return null;
  const key = (machineryType || '').toLowerCase().replace(/\s+/g, '_').replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u');
  return MACHINERY_KEY_SPEC[key] || null;
}

/**
 * Maqgo define el concepto (nombre + unidad) por tipo; el proveedor solo elige el valor en el combo.
 * Opciones acotadas a estándar de maquinaria pesada (no 3/4, no equipos livianos).
 * providerLabel = texto que ve el proveedor/cliente. unit / unitDisplay = unidad en opciones.
 */
export const MACHINERY_CAPACITY_OPTIONS = {
  camion_tolva: { options: [12, 14, 16, 18, 20], unit: 'm³', unitDisplay: 'm³', providerLabel: 'Capacidad de carga', clientStorageKey: 'clientRequiredM3List', providerField: 'capacityM3' }, // desde 12 m³ (tolva pesada; <12 = 3/4)
  camion_aljibe: { options: [8000, 10000, 12000, 15000], unit: 'litros', unitDisplay: 'L', providerLabel: 'Capacidad de estanque', clientStorageKey: 'clientRequiredLitersList', providerField: 'capacityLiters' }, // aljibe industrial
  camion_pluma: { options: [8, 10, 12, 15, 18], unit: 'ton·m', unitDisplay: 'ton·m', providerLabel: 'Capacidad pluma', clientStorageKey: 'clientRequiredTonMList', providerField: 'capacityTonM' }, // pluma pesada
  retroexcavadora: { options: [0.4, 0.5, 0.6], unit: 'm³ balde', unitDisplay: 'm³', providerLabel: 'Capacidad de balde', clientStorageKey: 'clientRequiredBucketM3List', providerField: 'bucketM3' }, // retro estándar
  excavadora: { options: [20, 25, 30, 35], unit: 'ton', unitDisplay: 'ton', providerLabel: 'Peso operativo', clientStorageKey: 'clientRequiredWeightTonList', providerField: 'weightTon' },
  excavadora_hidraulica: { options: [20, 25, 30, 35], unit: 'ton', unitDisplay: 'ton', providerLabel: 'Peso operativo', clientStorageKey: 'clientRequiredWeightTonList', providerField: 'weightTon' },
  bulldozer: { options: [180, 200, 220, 250], unit: 'HP', unitDisplay: 'HP', providerLabel: 'Potencia', clientStorageKey: 'clientRequiredPowerHpList', providerField: 'powerHp' }, // dozer pesado (no compacto)
  motoniveladora: { options: [3, 3.5, 4], unit: 'm hoja', unitDisplay: 'm', providerLabel: 'Ancho de hoja', clientStorageKey: 'clientRequiredBladeMList', providerField: 'bladeWidthM' },
  grua: { options: [25, 30, 35, 40], unit: 'ton', unitDisplay: 'ton', providerLabel: 'Capacidad de izaje', clientStorageKey: 'clientRequiredCraneTonList', providerField: 'craneTon' },
  compactadora: { options: [5, 6, 8, 10], unit: 'ton', unitDisplay: 'ton', providerLabel: 'Peso del equipo', clientStorageKey: 'clientRequiredRollerTonList', providerField: 'rollerTon' }, // rodillo pesado
  rodillo: { options: [5, 6, 8, 10], unit: 'ton', unitDisplay: 'ton', providerLabel: 'Peso del equipo', clientStorageKey: 'clientRequiredRollerTonList', providerField: 'rollerTon' },
  minicargador: { options: [0.4, 0.5], unit: 'm³ balde', unitDisplay: 'm³', providerLabel: 'Capacidad de balde', clientStorageKey: 'clientRequiredMiniloaderBucketList', providerField: 'bucketM3' } // estándar; 0.3 = equipo muy liviano
};

/** Normaliza clave de tipo (minúsculas, sin espacios, sin acentos) para buscar en MACHINERY_CAPACITY_OPTIONS. */
export function normalizeMachineryKey(machineryType) {
  if (!machineryType) return '';
  return (machineryType + '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Obtiene el id canónico (ej. camion_pluma) desde nombre para mostrar o id. Para usar con MACHINERY_PER_TRIP. */
export function getMachineryId(displayOrId) {
  if (!displayOrId) return '';
  const n = normalizeMachineryKey(displayOrId);
  if (MACHINERY_NAMES[n]) return n;
  const entry = Object.entries(MACHINERY_NAMES).find(([, v]) => v === displayOrId);
  return entry ? entry[0] : n;
}

/** true si la maquinaria corresponde a cobro por viaje (id o nombre visible). Lista: machineryConstants.MACHINERY_PER_SERVICE. */
export function isPerTripMachineryType(displayOrId) {
  const id = getMachineryId(displayOrId);
  return Boolean(id && MACHINERY_PER_SERVICE.includes(id));
}

/** Devuelve la config de capacidad para un tipo de maquinaria, o null. */
export function getMachineryCapacityOptions(machineryType) {
  const key = normalizeMachineryKey(machineryType);
  if (!key) return null;
  return MACHINERY_CAPACITY_OPTIONS[key] || null;
}

/** Etiqueta para el proveedor/cliente: concepto por tipo + unidad (ej. "Capacidad de estanque (litros)"). */
export function getProviderSpecLabel(machineryType) {
  const opts = getMachineryCapacityOptions(machineryType);
  if (!opts) return null;
  const label = opts.providerLabel || 'Especificación';
  const unit = opts.unit || opts.unitDisplay;
  return unit ? `${label} (${unit})` : label;
}

/** Solo el nombre del campo, sin unidad (ej. "Capacidad de estanque"). */
export function getProviderSpecLabelShort(machineryType) {
  const opts = getMachineryCapacityOptions(machineryType);
  return opts?.providerLabel || null;
}

/** Mapeo providerField (camelCase) -> posibles keys en objeto provider (API snake_case o camelCase). */
const PROVIDER_FIELD_TO_KEYS = {
  capacityM3: ['capacity_m3', 'capacityM3'],
  capacityLiters: ['capacity_liters', 'capacityLiters'],
  capacityTonM: ['capacity_ton_m', 'capacityTonM'],
  bucketM3: ['bucket_m3', 'bucketM3'],
  weightTon: ['weight_ton', 'weightTon'],
  powerHp: ['power_hp', 'powerHp'],
  bladeWidthM: ['blade_width_m', 'bladeWidthM'],
  craneTon: ['crane_ton', 'craneTon'],
  rollerTon: ['roller_ton', 'rollerTon']
};

/**
 * Valor formateado para mostrar en listados (ej. "10.000 L", "12 m³").
 * unit = opts.unit del tipo de maquinaria.
 */
function formatSpecValue(value, unit) {
  if (value == null || value === '') return '';
  const v = Number(value);
  if (Number.isNaN(v)) return String(value);
  if (unit === 'litros') return v >= 1000 ? `${(v / 1000).toFixed(0)}.000 L` : `${v} L`;
  if (unit === 'm³ balde' || unit === 'm³') return `${String(v).replace('.', ',')} m³`;
  if (unit === 'ton·m') return `${v} ton·m`;
  if (unit === 'ton') return `${v} ton`;
  if (unit === 'HP') return `${v} HP`;
  if (unit === 'm hoja' || unit === 'm') return `${v} m`;
  return `${v} ${unit || ''}`.trim();
}

/**
 * Etiqueta de chip en selección de maquinaria (P2). Debe coincidir con
 * getProviderSpecDisplay(...).valueFormatted para que el filtro en ProviderOptions funcione.
 */
export function formatMachineryCapacityChipLabel(machineryType, numericValue) {
  const opts = getMachineryCapacityOptions(machineryType);
  if (!opts) return String(numericValue);
  return formatSpecValue(numericValue, opts.unit || opts.unitDisplay);
}

/**
 * Para la pantalla "Elige tus proveedores": devuelve { label, valueFormatted } del dato que distingue
 * esta máquina (ej. "Capacidad de estanque", "10.000 L"). valueFormatted puede ser "—" si no hay valor.
 */
export function getProviderSpecDisplay(machineryType, provider) {
  const opts = getMachineryCapacityOptions(machineryType);
  if (!opts || !opts.providerField) return null;
  const keys = PROVIDER_FIELD_TO_KEYS[opts.providerField];
  if (!keys) return null;
  let value = undefined;
  for (const k of keys) {
    if (provider[k] != null && provider[k] !== '') { value = provider[k]; break; }
  }
  if (value == null && provider.machineData) {
    const md = provider.machineData;
    const camel = opts.providerField;
    const snake = keys[0];
    if (md[camel] != null && md[camel] !== '') value = md[camel];
    else if (md[snake] != null && md[snake] !== '') value = md[snake];
  }
  const valueFormatted = (value != null && value !== '')
    ? formatSpecValue(value, opts.unit || opts.unitDisplay)
    : '—';
  return { label: opts.providerLabel, valueFormatted };
}

/** Claves únicas de listas de capacidad en localStorage (todas las entradas de MACHINERY_CAPACITY_OPTIONS). */
export function getAllClientCapacityStorageKeys() {
  const keys = new Set();
  Object.values(MACHINERY_CAPACITY_OPTIONS).forEach((o) => {
    if (o.clientStorageKey) keys.add(o.clientStorageKey);
  });
  return [...keys];
}

/** Limpia listas de capacidad y el resumen de especificación (p. ej. al cambiar tipo de maquinaria). */
export function clearAllClientCapacityListsAndSpec() {
  getAllClientCapacityStorageKeys().forEach((k) => localStorage.removeItem(k));
  localStorage.removeItem('selectedMachinerySpec');
}

/**
 * Persiste capacidad(es) para el tipo actual: lista JSON en clientStorageKey y selectedMachinerySpec unido por " · ".
 * Lista vacía = sin filtro por capacidad (ranking precio/cercanía en proveedores).
 */
export function persistClientCapacitySelection(machineryId, nums) {
  clearAllClientCapacityListsAndSpec();
  const cap = getMachineryCapacityOptions(machineryId);
  if (!cap?.clientStorageKey) return;
  const sorted = [...nums]
    .map((n) => Number(n))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  if (sorted.length > 0) {
    localStorage.setItem(cap.clientStorageKey, JSON.stringify(sorted));
    const labels = sorted.map((n) => formatMachineryCapacityChipLabel(machineryId, n));
    localStorage.setItem('selectedMachinerySpec', labels.join(' · '));
  }
}
