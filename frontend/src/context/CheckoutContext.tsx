import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import {
  type CheckoutEvent,
  type CheckoutState,
  CHECKOUT_INITIAL_STATE,
  checkoutReducer,
} from '../domain/checkout/checkoutStateMachine';
import {
  persistCheckoutState,
  readPersistedCheckoutState,
} from '../domain/checkout/checkoutPersistence';
import { deriveBookingPaymentReadModel } from '../domain/booking/bookingPaymentReadModel';
import { readBookingNavSnapshot } from '../utils/bookingNavigationGuard.logic';

function initCheckoutState(initial: CheckoutState): CheckoutState {
  const hydrated = readPersistedCheckoutState();
  return hydrated ?? initial;
}

type CheckoutContextValue = {
  state: CheckoutState;
  dispatch: (event: CheckoutEvent) => void;
};

const CheckoutContext = createContext<CheckoutContextValue | null>(null);

export function CheckoutProvider({ children }: { children: ReactNode }) {
  const [state, dispatchBase] = useReducer(checkoutReducer, CHECKOUT_INITIAL_STATE, initCheckoutState);

  const dispatch = useCallback((event: CheckoutEvent) => {
    dispatchBase(event);
  }, []);

  const value = useMemo(
    () => ({
      state,
      dispatch,
    }),
    [state, dispatch]
  );

  useEffect(() => {
    persistCheckoutState(state);
  }, [state]);

  useEffect(() => {
    const onReset = () => {
      dispatchBase({ type: 'RESET' });
    };
    window.addEventListener('maqgo:reset-checkout', onReset);
    return () => window.removeEventListener('maqgo:reset-checkout', onReset);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (typeof window === 'undefined') return;
    const prev = window.__MAQGO_BOOKING_DEBUG__ || {};
    window.__MAQGO_BOOKING_DEBUG__ = {
      ...prev,
      checkoutState: state,
      derivedPaymentState: deriveBookingPaymentReadModel(state),
      snapshot: readBookingNavSnapshot(),
      timestamp: Date.now(),
    };
  }, [state]);

  return <CheckoutContext.Provider value={value}>{children}</CheckoutContext.Provider>;
}

export function useCheckoutState(): CheckoutContextValue {
  const ctx = useContext(CheckoutContext);
  if (!ctx) {
    throw new Error('useCheckoutState debe usarse dentro de CheckoutProvider');
  }
  return ctx;
}
