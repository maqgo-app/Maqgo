/**
 * Utilidades para persistencia de máquinas del proveedor
 * Fuente única: providerMachines en localStorage
 * Constantes de negocio (por viaje / traslado) desde pricing.js
 */

import { MACHINERY_NO_TRANSPORT, MACHINERY_PER_SERVICE } from './pricing';
import { getObject } from './safeStorage';

const STORAGE_KEY = 'providerMachines';

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
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
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
    saveMachines(list);
    return list;
  }
  if (!Array.isArray(list)) {
    list = [];
    saveMachines(list);
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
  saveMachines([]);
  // Limpieza de legado para evitar re-hidrataciones extrañas.
  localStorage.removeItem('providerMachinePricing');
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(machines));
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
  const newMachine = {
    id: `mach_${Date.now()}`,
    machineryType,
    type: typeName,
    brand: machine.brand || 'Nueva máquina',
    model: machine.model || '',
    year: machine.year || '',
    licensePlate: machine.licensePlate || '',
    pricePerHour: isPerSvc ? null : (machine.pricePerHour ?? 80000),
    pricePerService: isPerSvc ? (machine.pricePerService ?? 260000) : null,
    transportCost: needsTransport(machineryType) ? (machine.transportCost ?? 25000) : 0,
    available: true,
    operators: machine.operators || [],
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
    operators: normalizedOperators,
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
  return operators
    .map((op, index) => {
      if (!op || typeof op !== 'object') return null;
      const fullName = String(op.name || `${op.nombre || ''} ${op.apellido || ''}`.trim()).trim();
      if (!fullName) return null;
      const phone = String(op.phone || op.telefono || '').trim();
      const rut = String(op.rut || '').trim();
      return {
        id: String(op.id || `op-onboarding-${Date.now()}-${index}`),
        name: fullName,
        phone,
        rut,
        isOwner: Boolean(op.isOwner),
        online: Boolean(op.online),
        lastSeen: op.lastSeen || new Date().toISOString(),
      };
    })
    .filter(Boolean);
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
