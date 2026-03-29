/**
 * Registration Return URL Utilities
 * Handles saving and restoring the original URL after registration flow
 */

const REGISTRATION_RETURN_KEY = 'registrationReturnUrl';
const PROVIDER_RETURN_KEY = 'providerOnboardingReturnUrl';

/**
 * Save the current URL as the return destination after registration
 * @param {string} currentPath - Current pathname to return to
 */
export function saveReturnUrl(currentPath) {
  // Don't save registration flow paths
  const excludedPaths = [
    '/register', '/login', '/select-channel', '/verify-sms', 
    '/verified', '/select-role', '/code-expired', '/code-incorrect',
    '/provider/data', '/provider/machine-data', '/provider/machine-photos',
    '/provider/pricing', '/provider/operator-data', '/provider/review',
    '/'
  ];
  
  if (!excludedPaths.includes(currentPath)) {
    localStorage.setItem(REGISTRATION_RETURN_KEY, currentPath);
  }
}

/**
 * Get and clear the return URL after registration
 * @returns {string|null} The saved return URL or null
 */
export function getAndClearReturnUrl() {
  const returnUrl = localStorage.getItem(REGISTRATION_RETURN_KEY);
  localStorage.removeItem(REGISTRATION_RETURN_KEY);
  return returnUrl;
}

/**
 * Get the return URL without clearing it
 * @returns {string|null} The saved return URL or null
 */
export function peekReturnUrl() {
  return localStorage.getItem(REGISTRATION_RETURN_KEY);
}

/**
 * Save provider onboarding return URL
 * @param {string} path - Path to return to after onboarding
 */
export function saveProviderReturnUrl(path) {
  localStorage.setItem(PROVIDER_RETURN_KEY, path);
}

/**
 * Get and clear provider onboarding return URL
 * @returns {string|null}
 */
export function getAndClearProviderReturnUrl() {
  const returnUrl = localStorage.getItem(PROVIDER_RETURN_KEY);
  localStorage.removeItem(PROVIDER_RETURN_KEY);
  return returnUrl;
}

/**
 * Clear all return URLs
 */
export function clearAllReturnUrls() {
  localStorage.removeItem(REGISTRATION_RETURN_KEY);
  localStorage.removeItem(PROVIDER_RETURN_KEY);
}

/**
 * Navigate to registration with return URL
 * @param {function} navigate - React Router navigate function
 * @param {string} returnPath - Current path to return to
 */
export function navigateToRegister(navigate, returnPath) {
  saveReturnUrl(returnPath);
  navigate('/register', { state: { freshClientRegistration: true } });
}

/**
 * Navigate to login with return URL
 * @param {function} navigate - React Router navigate function
 * @param {string} returnPath - Current path to return to
 */
export function navigateToLogin(navigate, returnPath) {
  saveReturnUrl(returnPath);
  navigate('/login');
}
