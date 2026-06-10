import { useEffect } from 'react';
import { getArray, getObject } from './safeStorage';

export const PROVIDER_ONBOARDING_DRAFT_KEYS = [
  'machineData',
  'machinePricing',
  'machinePhotos',
  'operatorsData',
  'providerOnboardingStep',
  'providerCameFromWelcome',
];

export function isProviderOnboardingDraftEnabled() {
  try {
    return globalThis.localStorage?.getItem('providerOnboardingCompleted') !== 'true';
  } catch {
    return true;
  }
}

export function clearProviderOnboardingDraft() {
  try {
    PROVIDER_ONBOARDING_DRAFT_KEYS.forEach((key) => globalThis.localStorage?.removeItem(key));
  } catch {
    /* ignore storage failures */
  }
}

export function getProviderDraftObject(key, defaultValue = {}) {
  return isProviderOnboardingDraftEnabled() ? getObject(key, defaultValue) : defaultValue;
}

export function getProviderDraftArray(key, defaultValue = []) {
  return isProviderOnboardingDraftEnabled() ? getArray(key, defaultValue) : defaultValue;
}

export function useProviderOnboardingDraftCleanup() {
  const draftEnabled = isProviderOnboardingDraftEnabled();

  useEffect(() => {
    if (!draftEnabled) {
      clearProviderOnboardingDraft();
    }
  }, [draftEnabled]);

  return draftEnabled;
}
