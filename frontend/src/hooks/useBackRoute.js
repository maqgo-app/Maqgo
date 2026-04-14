import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getBookingBackRoute, getProviderBackRoute } from '../utils/bookingFlow';

/**
 * Hook de retroceso determinístico para Maqgo.
 *
 * Evita `navigate(-1)` en contextos donde el historial real depende de cómo
 * el usuario llegó (deep-link, refresh, redirect con `replace`, etc.), lo que
 * provocaba retrocesos a sesiones o roles incorrectos.
 *
 * Modos:
 *  - 'booking'   → usa `getBookingBackRoute` (embudo cliente P1–P6).
 *                  Fallback: '/client/home'.
 *  - 'provider'  → usa `getProviderBackRoute` (onboarding + pantallas proveedor).
 *                  Fallback: explícito o '/provider/home'.
 *  - 'history'   → `navigate(-1)` solo si el historial tiene entradas; si no,
 *                  usa el fallback. Adecuado para pantallas de contenido (FAQ,
 *                  legal) que pueden abrirse desde cualquier rol.
 *
 * @param {'booking' | 'provider' | 'history'} mode
 * @param {string} [fallback] - Ruta de retroceso si el modo no resuelve una ruta.
 * @returns {{ back: () => void, backRoute: string | null }}
 */
export function useBackRoute(mode, fallback) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const backRoute = (() => {
    if (mode === 'booking') {
      return getBookingBackRoute(pathname) ?? fallback ?? '/client/home';
    }
    if (mode === 'provider') {
      return getProviderBackRoute(pathname) ?? fallback ?? '/provider/home';
    }
    // 'history': la ruta no se pre-computa; se decide en tiempo de ejecución.
    return fallback ?? null;
  })();

  const back = useCallback(() => {
    if (mode === 'history') {
      // `history.length > 1` indica que el navegador tiene historial real.
      // En SSR / primer render esto es ≥ 1, así que usamos > 1.
      if (typeof window !== 'undefined' && window.history.length > 1) {
        navigate(-1);
      } else {
        navigate(fallback ?? '/');
      }
      return;
    }
    const destination = mode === 'booking'
      ? (getBookingBackRoute(pathname) ?? fallback ?? '/client/home')
      : (getProviderBackRoute(pathname) ?? fallback ?? '/provider/home');
    navigate(destination);
  }, [mode, navigate, pathname, fallback]);

  return { back, backRoute };
}
