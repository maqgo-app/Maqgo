import { useEffect, useRef } from 'react';

export function useAdaptivePolling({
  enabled,
  run,
  baseIntervalMs = 3000,
  maxIntervalMs = 30000,
  backoffFactor = 2,
  pauseWhenHidden = true,
}) {
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    let timeoutId = null;
    let inFlight = false;
    let errorStreak = 0;

    const schedule = (delay) => {
      if (cancelled) return;
      timeoutId = setTimeout(tick, Math.max(0, delay));
    };

    const computeDelay = () =>
      Math.min(maxIntervalMs, baseIntervalMs * (backoffFactor ** errorStreak));

    const tick = async () => {
      if (cancelled) return;
      if (!enabled) return;
      if (pauseWhenHidden && typeof document !== 'undefined' && document.hidden) {
        schedule(maxIntervalMs);
        return;
      }
      if (inFlight) {
        schedule(250);
        return;
      }

      inFlight = true;
      try {
        const ok = await runRef.current();
        if (ok === false) {
          errorStreak = Math.min(10, errorStreak + 1);
        } else {
          errorStreak = 0;
        }
      } catch {
        errorStreak = Math.min(10, errorStreak + 1);
      } finally {
        inFlight = false;
        schedule(computeDelay());
      }
    };

    const onVisibility = () => {
      if (cancelled) return;
      if (!pauseWhenHidden) return;
      if (typeof document === 'undefined') return;
      if (!document.hidden) {
        errorStreak = 0;
        if (timeoutId) clearTimeout(timeoutId);
        schedule(0);
      }
    };

    tick();
    if (pauseWhenHidden && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (pauseWhenHidden && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [enabled, baseIntervalMs, maxIntervalMs, backoffFactor, pauseWhenHidden]);
}

