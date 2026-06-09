import axios from 'axios';
import BACKEND_URL from './api';
import { getArray, getObject } from './safeStorage';
import { fetchProviderMachinesFromApi } from './providerMachines';

const MACHINE_PRICING_KEY = 'machinePricing';
const MACHINE_PHOTOS_KEY = 'machinePhotos';
const MACHINE_PRICING_FIELD = 'onboardingPricing';
const MACHINE_PHOTOS_FIELD = 'onboardingPhotos';

function getCurrentUserId() {
  try {
    return String(localStorage.getItem('userId') || '').trim();
  } catch {
    return '';
  }
}

function isDemoUserId(userId) {
  return Boolean(
    userId &&
    (userId.startsWith('provider-') || userId.startsWith('demo-') || userId.startsWith('operator-'))
  );
}

function hasKeys(obj) {
  return Boolean(obj && typeof obj === 'object' && Object.keys(obj).length > 0);
}

export function mergeOnboardingDraftIntoMachineData(machineData, options = {}) {
  const base = machineData && typeof machineData === 'object' ? { ...machineData } : {};
  const pricing = options.machinePricing ?? getObject(MACHINE_PRICING_KEY, {});
  const photos = options.machinePhotos ?? getArray(MACHINE_PHOTOS_KEY, []);

  if (hasKeys(pricing)) base[MACHINE_PRICING_FIELD] = pricing;
  if (Array.isArray(photos) && photos.length > 0) base[MACHINE_PHOTOS_FIELD] = photos;

  return base;
}

export function stripOnboardingDraftFromMachineData(machineData) {
  if (!machineData || typeof machineData !== 'object') return {};
  const next = { ...machineData };
  delete next[MACHINE_PRICING_FIELD];
  delete next[MACHINE_PHOTOS_FIELD];
  return next;
}

export async function persistProviderOnboardingDraft(options = {}) {
  const userId = String(options.userId || getCurrentUserId()).trim();
  if (!userId || isDemoUserId(userId)) return false;

  const providerDataInput =
    options.providerData === undefined ? getObject('providerData', {}) : options.providerData;
  const bankData = getObject('bankData', {});
  const machineDataInput =
    options.machineData === undefined ? getObject('machineData', {}) : options.machineData;
  const operatorsInput =
    options.operators === undefined ? getArray('operatorsData', []) : options.operators;

  const payload = {};

  if (hasKeys(providerDataInput)) {
    const providerData = { ...providerDataInput };
    if (!providerData.bankData && hasKeys(bankData)) providerData.bankData = bankData;
    payload.providerData = providerData;
  }

  if (hasKeys(machineDataInput)) {
    payload.machineData = mergeOnboardingDraftIntoMachineData(machineDataInput, {
      machinePricing: options.machinePricing,
      machinePhotos: options.machinePhotos,
    });
  }

  if (Array.isArray(operatorsInput) && operatorsInput.length > 0) {
    payload.operators = operatorsInput;
  }

  if (!Object.keys(payload).length) return false;

  await axios.patch(`${String(BACKEND_URL).replace(/\/+$/, '')}/api/users/${encodeURIComponent(userId)}`, payload, {
    timeout: Number.isFinite(options.timeout) ? options.timeout : 8000,
  });
  return true;
}

export function hydrateLocalProviderOnboardingDraftFromUser(user) {
  const doc = user && typeof user === 'object' ? user : {};
  const providerData = doc.providerData && typeof doc.providerData === 'object' ? doc.providerData : null;
  const location = doc.location && typeof doc.location === 'object' ? doc.location : null;
  const machineDataRaw = doc.machineData && typeof doc.machineData === 'object' ? doc.machineData : null;
  const machinePricing =
    machineDataRaw && machineDataRaw[MACHINE_PRICING_FIELD] && typeof machineDataRaw[MACHINE_PRICING_FIELD] === 'object'
      ? machineDataRaw[MACHINE_PRICING_FIELD]
      : null;
  const machinePhotos = Array.isArray(machineDataRaw?.[MACHINE_PHOTOS_FIELD]) ? machineDataRaw[MACHINE_PHOTOS_FIELD] : null;
  const machineData = stripOnboardingDraftFromMachineData(machineDataRaw);
  const operators = Array.isArray(doc.operators)
    ? doc.operators
    : (Array.isArray(machineDataRaw?.operators) ? machineDataRaw.operators : null);

  try {
    if (providerData) {
      localStorage.setItem('providerData', JSON.stringify(providerData));
      if (providerData.bankData && typeof providerData.bankData === 'object') {
        localStorage.setItem('bankData', JSON.stringify(providerData.bankData));
      }
    }
    if (location) {
      localStorage.setItem('location', JSON.stringify(location));
    }
    if (hasKeys(machineData)) {
      localStorage.setItem('machineData', JSON.stringify(machineData));
    }
    if (hasKeys(machinePricing)) {
      localStorage.setItem(MACHINE_PRICING_KEY, JSON.stringify(machinePricing));
    }
    if (Array.isArray(machinePhotos) && machinePhotos.length > 0) {
      localStorage.setItem(MACHINE_PHOTOS_KEY, JSON.stringify(machinePhotos));
    }
    if (Array.isArray(operators) && operators.length > 0) {
      localStorage.setItem('operatorsData', JSON.stringify(operators));
    }
    if (typeof doc.onboarding_completed === 'boolean') {
      localStorage.setItem('providerOnboardingCompleted', doc.onboarding_completed ? 'true' : 'false');
    }
    if (typeof doc.isAvailable === 'boolean' || typeof doc.available === 'boolean') {
      localStorage.setItem('providerAvailable', String(Boolean(doc.isAvailable ?? doc.available)));
    }
  } catch {
    return false;
  }

  return true;
}

export async function fetchAndHydrateProviderOnboardingDraft(userId = null) {
  const uid = String(userId || getCurrentUserId()).trim();
  if (!uid || isDemoUserId(uid)) return null;
  const res = await axios.get(`${String(BACKEND_URL).replace(/\/+$/, '')}/api/users/${encodeURIComponent(uid)}`, {
    timeout: 8000,
  });
  hydrateLocalProviderOnboardingDraftFromUser(res.data);
  try {
    await fetchProviderMachinesFromApi(uid);
  } catch {
    void 0;
  }
  return res.data;
}
