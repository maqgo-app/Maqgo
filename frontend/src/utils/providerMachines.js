/**
 * Utilidades para persistencia de máquinas del proveedor
 * Backend (/api/machines) es la fuente oficial.
 * providerMachines en localStorage queda como cache UI/offline.
 * Constantes de negocio (por viaje / traslado) desde pricing.js
 */

import { MACHINERY_NO_TRANSPORT, MACHINERY_PER_SERVICE } from './pricing';
import { getObject } from './safeStorage';
import { validateRut, sanitizeRutInput } from './chileanValidation';
import BACKEND_URL, { fetchWithAuth } from './api';

const LEGACY_STORAGE_KEY = 'providerMachines';

const MACHINERY_TYPES = [
  { id: 'retroexcavadora', name: 'Retroexcavadora' },
  { id: 'camion_tolva', name: 'Camión Tolva' },
  { id: 'excavadora', name: 'Excavadora Hidráulica' },
  { id: 'bulldozer', name: 'Bulldozer' },
  { id: 'motoniveladora', name: 'Motoniveladora' },
  { id: 'grua', name: 'Grúa Móvil' },
  { id: 'camion_pluma', name: 'Camión Pluma (Hiab)' },
  { id: 'compactadora', name: 'Compactadora / Rodillo' },
  { id: 'camion_aljibe', name: 'Camión Aljibe' },
  { id: 'minicargador', name: 'Minicargador' }
];

const NO_TRANSPORT_IDS = MACHINERY_NO_TRANSPORT;
const PER_SERVICE_IDS = MACHINERY_PER_SERVICE;
const PLACEHOLDER_OPERATOR_NAMES = new Set([
  'operador',
  'operator',
  'operador rc',
  'sin operador',
  'por asignar',
  'pendiente',
]);

function normalizeOperatorName(op = {}) {
  const fullName = String(op.name || `${op.nombre || ''} ${op.apellido || ''}`.trim()).trim();
  return fullName.replace(/\s+/g, ' ').trim();
}

const _RUT_CLEAN_REGEX = /[^0-9kK]/g;
const _RUT_VERIFY_SEQUENCE = [2, 3, 4, 5, 6, 7, 2, 3];
const _RUT_BODY_REGEX = /^\d{7,8}$/;

function _cleanRut(raw = '') {
  return sanitizeRutInput(String(raw || '')).toUpperCase();
}

function _isValidRut(raw = '') {
  return validateRut(String(raw || ''));
}

function buildOperatorStableId(op = {}, index = 0) {
  const directId = String(op.id || op.user_id || op.userId || op.operator_id || op.operatorId || '').trim();
  if (directId) return directId;
  const rawRut = String(op.rut || op.operator_rut || op.operatorRut || '').trim();
  if (rawRut && _isValidRut(rawRut)) return `op-rut-${_cleanRut(rawRut).toLowerCase()}`;
  const digits = String(op.phone || op.telefono || '').replace(/\D/g, '');
  if (digits) return `op-phone-${digits}`;
  return `op-${index}`;
}

const DEFAULT_MACHINES = [
  {
    id: 'mach_001',
    machineryType: 'retroexcavadora',
    type: 'Retroexcavadora',
    brand: 'Caterpillar 420F',
    model: '',
    year: '',
    licensePlate: '',
    pricePerHour: 80000,
    pricePerService: null,
    transportCost: 25000,
    available: true,
    operators: [
      { id: 'op-0', name: 'Juan Pérez', phone: '+56 9 1234 5678', online: true, lastSeen: new Date().toISOString() },
      { id: 'op-1', name: 'Pedro López', phone: '+56 9 8765 4321', online: false, lastSeen: new Date(Date.now() - 7200000).toISOString() }
    ]
  },
  {
    id: 'mach_002',
    machineryType: 'camion_aljibe',
    type: 'Camión Aljibe',
    brand: 'Mercedes-Benz Actros',
    model: '',
    year: '',
    licensePlate: '',
    pricePerHour: null,
    pricePerService: 260000,
    transportCost: 0,
    available: true,
    operators: [
      { id: 'op-2', name: 'María González', phone: '+56 9 5555 1234', online: true, lastSeen: new Date().toISOString() }
    ]
  },
  {
    id: 'mach_003',
    machineryType: 'excavadora',
    type: 'Excavadora',
    brand: 'Komatsu PC200',
    model: '',
    year: '',
    licensePlate: '',
    pricePerHour: 110000,
    pricePerService: null,
    transportCost: 35000,
    available: false,
    operators: []
  }
];

export function getMachines() {
  const key = storageKey();
  const raw = localStorage.getItem(key);
  if (!raw) {
    if (key !== LEGACY_STORAGE_KEY) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        localStorage.setItem(key, legacy);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        return getMachines();
      }
    }
    const restored = restoreFromOnboardingIfPossible();
    if (restored.length) return restored;
    const migrated = migrateFromLegacy();
    if (migrated.length) return migrated;
    // En pruebas reales, partir vacío (evita “maquinarias demo” que confunden).
    // Si en algún flujo se quiere demo explícito, debe sembrarse desde ese flujo, no aquí.
    const initial = [];
    saveMachines(initial);
    return initial;
  }
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    // Storage corrupto: preferir vacío a demo.
    list = [];
    localStorage.setItem(key, JSON.stringify(list));
    return list;
  }
  if (!Array.isArray(list)) {
    list = [];
    localStorage.setItem(key, JSON.stringify(list));
  }
  // Si una máquina quedó sin operadores por una sincronización parcial,
  // intentar rehidratar desde operatorsData del onboarding.
  list = backfillOperatorsFromOnboarding(list);
  if (Array.isArray(list) && list.length === 0) {
    const restored = restoreFromOnboardingIfPossible();
    if (restored.length) return restored;
  }
  return list;
}

export function resetMachines() {
  localStorage.removeItem(storageKey());
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  saveMachines([]);
  // Limpieza de legado para evitar re-hidrataciones extrañas.
  localStorage.removeItem('providerMachinePricing');
}

function currentProviderId() {
  return (localStorage.getItem('ownerId') || localStorage.getItem('userId') || '').trim();
}

function storageKey() {
  const pid = currentProviderId();
  return pid ? `${LEGACY_STORAGE_KEY}:${pid}` : LEGACY_STORAGE_KEY;
}

function restoreFromOnboardingIfPossible() {
  try {
    const machineData = getObject('machineData', {});
    const machinePricing = getObject('machinePricing', {});
    const operatorsData = getObject('operatorsData', []);
    const completed = localStorage.getItem('providerOnboardingCompleted') === 'true';
    if (!completed || !machineData?.machineryType) return [];

    const seeded = upsertOnboardingMachine(machineData, machinePricing, operatorsData);
    return Array.isArray(seeded) ? seeded : [];
  } catch {
    return [];
  }
}

function migrateFromLegacy() {
  const pricing = getObject('providerMachinePricing', {});
  if (Object.keys(pricing).length === 0) return [];

  const machines = JSON.parse(JSON.stringify(DEFAULT_MACHINES));
  machines.forEach(m => {
    const saved = pricing[m.id];
    if (saved) {
      if (saved.pricePerHour !== undefined) m.pricePerHour = saved.pricePerHour;
      if (saved.pricePerService !== undefined) m.pricePerService = saved.pricePerService;
      if (saved.transportCost !== undefined) m.transportCost = saved.transportCost;
    }
  });

  saveMachines(machines);
  localStorage.removeItem('providerMachinePricing');
  return machines;
}

export function saveMachines(machines) {
  localStorage.setItem(storageKey(), JSON.stringify(machines));
}

function assertMachineHasRealOperator(machine = {}) {
  const normalizedOperators = normalizeOperators(machine?.operators || []);
  if (normalizedOperators.length === 0) {
    throw new Error('Cada maquina debe tener al menos un operador real asignado');
  }
  return normalizedOperators;
}

function normalizeMachineForCache(machine = {}) {
  const machineryType = machine.machineryType || machine.machinery_type || 'retroexcavadora';
  const typeName = machine.type || MACHINERY_TYPES.find(m => m.id === machineryType)?.name || 'Maquinaria';
  return {
    ...machine,
    id: machine.id || machine.machine_id || `mach_${Date.now()}`,
    provider_id: machine.provider_id,
    machineryType,
    type: typeName,
    licensePlate: machine.licensePlate || machine.license_plate || '',
    available: machine.available !== false,
    published: machine.published !== false,
    primaryOperatorId: machine.primaryOperatorId || machine.primary_operator_id || '',
    operators: normalizeOperators(machine.operators),
  };
}

function upsertMachineInCache(machine) {
  const normalized = normalizeMachineForCache(machine);
  const machines = getMachines();
  const idx = machines.findIndex(m => String(m.id) === String(normalized.id));
  const next = idx >= 0
    ? machines.map(m => (String(m.id) === String(normalized.id) ? { ...m, ...normalized } : m))
    : [...machines, normalized];
  saveMachines(next);
  return normalized;
}

export async function fetchProviderMachinesFromApi(providerId = null) {
  const pid = String(providerId || '').trim();
  const url = pid ? `${BACKEND_URL}/api/machines?provider_id=${encodeURIComponent(pid)}` : `${BACKEND_URL}/api/machines`;
  const res = await fetchWithAuth(url, {}, 10000);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof json?.detail === 'string' ? json.detail : `No se pudieron cargar máquinas (${res.status})`);
  const machines = Array.isArray(json?.machines) ? json.machines.map(normalizeMachineForCache) : [];
  saveMachines(machines);
  return machines;
}

export async function createMachineInApi(machine, providerId = null) {
  assertMachineHasRealOperator(machine);
  const pid = String(providerId || '').trim();
  const res = await fetchWithAuth(`${BACKEND_URL}/api/machines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...machine, ...(pid ? { provider_id: pid } : {}) }),
  }, 12000);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof json?.detail === 'string' ? json.detail : `No se pudo guardar maquinaria (${res.status})`);
  return upsertMachineInCache(json.machine || machine);
}

export async function updateMachineInApi(machineId, updates) {
  if (Object.prototype.hasOwnProperty.call(updates || {}, 'operators')) {
    assertMachineHasRealOperator(updates);
  }
  const res = await fetchWithAuth(`${BACKEND_URL}/api/machines/${encodeURIComponent(machineId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  }, 12000);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof json?.detail === 'string' ? json.detail : `No se pudo actualizar maquinaria (${res.status})`);
  return upsertMachineInCache(json.machine || { id: machineId, ...updates });
}

export async function deleteMachineInApi(machineId) {
  const res = await fetchWithAuth(`${BACKEND_URL}/api/machines/${encodeURIComponent(machineId)}`, {
    method: 'DELETE',
  }, 12000);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof json?.detail === 'string' ? json.detail : `No se pudo eliminar maquinaria (${res.status})`);
  return removeMachine(machineId);
}

export function getMachineById(machineId) {
  return getMachines().find(m => m.id === machineId) || null;
}

export function updateMachine(machineId, updates) {
  const machines = getMachines();
  const idx = machines.findIndex(m => m.id === machineId);
  if (idx < 0) return machines;
  machines[idx] = { ...machines[idx], ...updates };
  saveMachines(machines);
  return machines;
}

export function addMachine(machine) {
  const machines = getMachines();
  const machineryType = machine.machineryType || 'retroexcavadora';
  const typeName = MACHINERY_TYPES.find(m => m.id === machineryType)?.name || 'Retroexcavadora';
  const isPerSvc = PER_SERVICE_IDS.includes(machineryType);
  const normalizedOperators = assertMachineHasRealOperator(machine);
  const newMachine = {
    id: machine.id || `mach_${Date.now()}`,
    machineryType,
    type: typeName,
    brand: machine.brand || 'Nueva máquina',
    model: machine.model || '',
    year: machine.year || '',
    licensePlate: machine.licensePlate || '',
    pricePerHour: isPerSvc ? null : (machine.pricePerHour ?? 80000),
    pricePerService: isPerSvc ? (machine.pricePerService ?? 260000) : null,
    transportCost: needsTransport(machineryType) ? (machine.transportCost ?? 25000) : 0,
    transportSameComuna: needsTransport(machineryType) ? (machine.transportSameComuna ?? machine.transportCost ?? 25000) : 0,
    transportSameRegion: needsTransport(machineryType) ? (machine.transportSameRegion ?? machine.transportCost ?? 35000) : 0,
    transportOtherRegion: needsTransport(machineryType) ? (machine.transportOtherRegion ?? machine.transportSameRegion ?? machine.transportCost ?? 50000) : 0,
    originAddress: machine.originAddress || '',
    originComuna: machine.originComuna || '',
    originRegion: machine.originRegion || '',
    originLat: machine.originLat ?? null,
    originLng: machine.originLng ?? null,
    originMode: machine.originMode || 'company_base',
    liveLocationMode: machine.liveLocationMode || 'base_only',
    telematicsProvider: machine.telematicsProvider || '',
    available: machine.available !== false,
    published: machine.published !== false,
    operators: normalizedOperators,
    ...(machineryType === 'camion_tolva' && machine.capacityM3 != null && { capacityM3: Number(machine.capacityM3) }),
    ...(machineryType === 'camion_aljibe' && machine.capacityLiters != null && { capacityLiters: Number(machine.capacityLiters) }),
    ...(machineryType === 'camion_pluma' && machine.capacityTonM != null && { capacityTonM: Number(machine.capacityTonM) }),
    ...((machineryType === 'retroexcavadora' || machineryType === 'minicargador') && machine.bucketM3 != null && { bucketM3: Number(machine.bucketM3) }),
    ...((machineryType === 'excavadora' || machineryType === 'excavadora_hidraulica') && machine.weightTon != null && { weightTon: Number(machine.weightTon) }),
    ...(machineryType === 'bulldozer' && machine.powerHp != null && { powerHp: Number(machine.powerHp) }),
    ...(machineryType === 'motoniveladora' && machine.bladeWidthM != null && { bladeWidthM: Number(machine.bladeWidthM) }),
    ...(machineryType === 'grua' && machine.craneTon != null && { craneTon: Number(machine.craneTon) }),
    ...((machineryType === 'compactadora' || machineryType === 'rodillo') && machine.rollerTon != null && { rollerTon: Number(machine.rollerTon) })
  };
  machines.push(newMachine);
  saveMachines(machines);
  return newMachine;
}

/**
 * Sincroniza la máquina creada en onboarding con "Mis Máquinas".
 * Evita que quede un placeholder ("Nueva máquina") cuando el usuario ya ingresó datos reales.
 */
export function upsertOnboardingMachine(machineData = {}, machinePricing = {}, operators = []) {
  const machineryType = machineData?.machineryType;
  if (!machineryType) return getMachines();

  const isPerSvc = PER_SERVICE_IDS.includes(machineryType);
  const typeName = MACHINERY_TYPES.find(m => m.id === machineryType)?.name || machineData.type || 'Retroexcavadora';
  const brandModel = [machineData.brand, machineData.model].filter(Boolean).join(' ').trim();
  const normalizedLicense = String(machineData.licensePlate || '').trim().toUpperCase();

  const priceBase = Number(machinePricing?.priceBase || 0);
  const transport = Number(machinePricing?.transportCost || 0);

  const normalizedOperators = normalizeOperators(operators);
  if (normalizedOperators.length === 0) {
    return getMachines();
  }
  const nextMachine = {
    machineryType,
    type: typeName,
    brand: brandModel || machineData.brand || 'Nueva máquina',
    model: machineData.model || '',
    year: machineData.year || '',
    licensePlate: machineData.licensePlate || '',
    // Evitar "valores fantasma": solo mostrar precio si realmente fue definido.
    pricePerHour: isPerSvc ? null : (priceBase > 0 ? priceBase : null),
    pricePerService: isPerSvc ? (priceBase > 0 ? priceBase : null) : null,
    transportCost: needsTransport(machineryType) ? (transport > 0 ? transport : null) : 0,
    transportSameComuna: needsTransport(machineryType)
      ? Number(machinePricing?.transportSameComuna || machinePricing?.transportCost || 0) || null
      : 0,
    transportSameRegion: needsTransport(machineryType)
      ? Number(machinePricing?.transportSameRegion || machinePricing?.transportCost || 0) || null
      : 0,
    transportOtherRegion: needsTransport(machineryType)
      ? Number(machinePricing?.transportOtherRegion || machinePricing?.transportSameRegion || machinePricing?.transportCost || 0) || null
      : 0,
    originAddress: machineData.originAddress || '',
    originComuna: machineData.originComuna || '',
    originRegion: machineData.originRegion || '',
    originLat: machineData.originLat ?? null,
    originLng: machineData.originLng ?? null,
    originMode: machineData.originMode || 'company_base',
    liveLocationMode: machineData.liveLocationMode || 'base_only',
    telematicsProvider: machineData.telematicsProvider || '',
    operators: normalizedOperators,
    primaryOperatorId: normalizedOperators.find((op) => op.isPrimary)?.id || normalizedOperators[0]?.id || '',
    available: true,
    ...(machineryType === 'camion_tolva' && machineData.capacityM3 != null && { capacityM3: Number(machineData.capacityM3) }),
    ...(machineryType === 'camion_aljibe' && machineData.capacityLiters != null && {
      capacityLiters: Number(machineData.capacityLiters),
    }),
    ...(machineryType === 'camion_pluma' && machineData.capacityTonM != null && {
      capacityTonM: Number(machineData.capacityTonM),
    }),
    ...((machineryType === 'retroexcavadora' || machineryType === 'minicargador') &&
      machineData.bucketM3 != null && { bucketM3: Number(machineData.bucketM3) }),
    ...((machineryType === 'excavadora' || machineryType === 'excavadora_hidraulica') &&
      machineData.weightTon != null && { weightTon: Number(machineData.weightTon) }),
    ...(machineryType === 'bulldozer' && machineData.powerHp != null && { powerHp: Number(machineData.powerHp) }),
    ...(machineryType === 'motoniveladora' && machineData.bladeWidthM != null && {
      bladeWidthM: Number(machineData.bladeWidthM),
    }),
    ...(machineryType === 'grua' && machineData.craneTon != null && { craneTon: Number(machineData.craneTon) }),
    ...((machineryType === 'compactadora' || machineryType === 'rodillo') &&
      machineData.rollerTon != null && { rollerTon: Number(machineData.rollerTon) }),
  };

  const machines = getMachines();
  let idx = -1;

  if (normalizedLicense) {
    idx = machines.findIndex(m => String(m.licensePlate || '').trim().toUpperCase() === normalizedLicense);
  }
  if (idx < 0 && nextMachine.brand && nextMachine.model) {
    idx = machines.findIndex(
      m =>
        String(m.machineryType || '') === machineryType &&
        String(m.brand || '').trim().toLowerCase() === String(nextMachine.brand || '').trim().toLowerCase()
    );
  }
  if (idx < 0 && machines.length === 1 && String(machines[0]?.brand || '').trim().toLowerCase() === 'nueva máquina') {
    idx = 0;
  }

  if (idx >= 0) {
    machines[idx] = { ...machines[idx], ...nextMachine };
  } else {
    machines.push({ id: `mach_${Date.now()}`, ...nextMachine });
  }

  saveMachines(machines);
  return machines;
}

function normalizeOperators(operators = []) {
  if (!Array.isArray(operators)) return [];
  const normalized = operators
    .map((op, index) => {
      if (!op || typeof op !== 'object') return null;
      const fullName = normalizeOperatorName(op);
      if (!fullName || PLACEHOLDER_OPERATOR_NAMES.has(fullName.toLowerCase())) return null;
      const phone = String(op.phone || op.telefono || '').trim();
      const rawRut = String(op.rut || op.operator_rut || op.operatorRut || '').trim();
      const hasRawId = Boolean(
        op.id || op.user_id || op.userId || op.operator_id || op.operatorId
      );
      const hasStableIdentity = Boolean(phone || (rawRut && _isValidRut(rawRut)) || hasRawId);
      if (!hasStableIdentity) return null;
      return {
        id: buildOperatorStableId(op, index),
        name: fullName,
        phone,
        rut: rawRut && _isValidRut(rawRut) ? _cleanRut(rawRut) : rawRut,
        isOwner: Boolean(op.isOwner),
        isPrimary: Boolean(op.isPrimary || op.primary || op.principal),
        online: Boolean(op.online),
        lastSeen: op.lastSeen || new Date().toISOString(),
      };
    })
    .filter(Boolean);
  if (normalized.length === 0) return [];
  const primaryIndex = normalized.findIndex((op) => op.isPrimary);
  const winner = primaryIndex >= 0 ? primaryIndex : 0;
  return normalized.map((op, index) => ({ ...op, isPrimary: index === winner }));
}

function backfillOperatorsFromOnboarding(machines = []) {
  if (!Array.isArray(machines) || machines.length === 0) return machines;
  const onboardingOperators = normalizeOperators(getObject('operatorsData', []));
  if (onboardingOperators.length === 0) return machines;

  let changed = false;
  const next = machines.map((m, idx) => {
    const currentOps = Array.isArray(m?.operators) ? m.operators : [];
    if (currentOps.length > 0) return m;
    // Regla simple y segura: si no tiene operadores, tomar los del onboarding.
    // Priorizamos la primera máquina (alta inicial) y evitamos dejar "Sin operadores asignados".
    if (idx === 0 || machines.length === 1) {
      changed = true;
      return { ...m, operators: onboardingOperators };
    }
    return m;
  });

  if (changed) saveMachines(next);
  return next;
}

export function removeMachine(machineId) {
  const machines = getMachines().filter(m => m.id !== machineId);
  saveMachines(machines);
  return machines;
}

export function needsTransport(machineryType) {
  const t = (machineryType || '').toLowerCase().replace(/\s+/g, '_');
  return !NO_TRANSPORT_IDS.some(id => t.includes(id));
}

export function isPerService(machineryType) {
  const t = (machineryType || '').toLowerCase().replace(/\s+/g, '_');
  return PER_SERVICE_IDS.some(id => t.includes(id));
}

export { MACHINERY_TYPES, DEFAULT_MACHINES };
