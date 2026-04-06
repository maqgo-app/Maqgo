import { useMemo, useLayoutEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useCheckoutState } from '../context/CheckoutContext';
import { deriveBookingPaymentReadModel } from '../domain/booking/bookingPaymentReadModel';
import {
  getBookingNavigationRedirect,
  readBookingNavSnapshot,
  normalizeGuardPath,
  hashBookingNavSnapshot,
  shouldBypassGuardForSuccess,
  computeContextHash,
} from '../utils/bookingNavigationGuard.logic';

function patchGuardDebug(partial) {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  const prev = window.__MAQGO_BOOKING_DEBUG__ || {};
  window.__MAQGO_BOOKING_DEBUG__ = {
    ...prev,
    ...partial,
    timestamp: Date.now(),
  };
}

/**
 * Una decisión de guard / patch de debug por cambio real de contextHash.
 * SUCCESS: sin lectura LS, sin redirect, sin evaluación de snapshot.
 */
export default function BookingNavigationGuard({ children }) {
  const { pathname, search } = useLocation();
  const { state: checkoutState } = useCheckoutState();

  const derivedStable = useMemo(
    () => deriveBookingPaymentReadModel(checkoutState),
    [checkoutState]
  );

  const successBypass = shouldBypassGuardForSuccess(checkoutState, derivedStable.phase);

  const snapKey = successBypass
    ? 'success-bypass'
    : hashBookingNavSnapshot(readBookingNavSnapshot());

  const contextHash = useMemo(
    () => computeContextHash(pathname, search, snapKey, checkoutState, successBypass),
    [pathname, search, snapKey, checkoutState, successBypass]
  );

  const target = useMemo(() => {
    if (successBypass) return null;
    void snapKey;
    const snap = readBookingNavSnapshot();
    return getBookingNavigationRedirect({
      pathname,
      search,
      checkoutState,
      snapshot: snap,
    });
  }, [pathname, search, checkoutState, snapKey, successBypass]);

  const cur = normalizeGuardPath(pathname);
  const dest = target ? normalizeGuardPath(target) : null;
  const noopAtDest = Boolean(target && dest === cur);

  const lastProcessedContextHashRef = useRef('');

  useLayoutEffect(() => {
    if (lastProcessedContextHashRef.current === contextHash) {
      return;
    }
    lastProcessedContextHashRef.current = contextHash;

    if (!import.meta.env.DEV) return;

    const snapshotHash = successBypass ? null : snapKey;
    const successFlag = successBypass;

    if (successBypass) {
      patchGuardDebug({
        lastGuardDecision: 'success_immutable',
        lastRedirect: null,
        snapshotHash,
        successFlag,
        contextHash,
      });
      return;
    }
    if (noopAtDest) {
      patchGuardDebug({
        lastGuardDecision: 'noop_same_destination',
        lastRedirect: null,
        snapshotHash,
        successFlag,
        contextHash,
      });
      return;
    }
    if (target && dest !== cur) {
      patchGuardDebug({
        lastGuardDecision: `redirect:${target}`,
        lastRedirect: target,
        snapshotHash,
        successFlag,
        contextHash,
      });
      return;
    }
    patchGuardDebug({
      lastGuardDecision: 'stay',
      lastRedirect: null,
      snapshotHash,
      successFlag,
      contextHash,
    });
  }, [contextHash, successBypass, noopAtDest, target, dest, cur, snapKey]);

  if (successBypass) {
    return children;
  }

  if (target) {
    if (dest === cur) {
      return children;
    }
    return <Navigate to={target} replace />;
  }

  return children;
}
