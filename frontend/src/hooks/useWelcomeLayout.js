import { useEffect, useState } from 'react';
import { BREAKPOINT_MOBILE, BREAKPOINT_NARROW } from '../constants/breakpoints';

/**
 * Media + viewport para WelcomeScreen (un solo lugar; evita 4 useEffect sueltos en la pantalla).
 */
export function useWelcomeLayout() {
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 390
  );
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= BREAKPOINT_MOBILE : false
  );
  const [isNarrowMobile, setIsNarrowMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= BREAKPOINT_NARROW : false
  );
  const [isShortViewport, setIsShortViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight < 680 : false
  );
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 700
  );

  useEffect(() => {
    const onResize = () => {
      const h = window.innerHeight;
      const w = window.innerWidth;
      setIsShortViewport(h < 680);
      setViewportHeight(h);
      setViewportWidth(w);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mqDesk = window.matchMedia(`(min-width: ${BREAKPOINT_MOBILE}px)`);
    const onDesk = () => setIsDesktop(mqDesk.matches);
    onDesk();
    if (typeof mqDesk.addEventListener === 'function') {
      mqDesk.addEventListener('change', onDesk);
      return () => mqDesk.removeEventListener('change', onDesk);
    }
    if (typeof mqDesk.addListener === 'function') {
      mqDesk.addListener(onDesk);
      return () => mqDesk.removeListener(onDesk);
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mqNarrow = window.matchMedia(`(max-width: ${BREAKPOINT_NARROW}px)`);
    const onNarrow = () => setIsNarrowMobile(mqNarrow.matches);
    onNarrow();
    if (typeof mqNarrow.addEventListener === 'function') {
      mqNarrow.addEventListener('change', onNarrow);
      return () => mqNarrow.removeEventListener('change', onNarrow);
    }
    if (typeof mqNarrow.addListener === 'function') {
      mqNarrow.addListener(onNarrow);
      return () => mqNarrow.removeListener(onNarrow);
    }
    return undefined;
  }, []);

  return { isDesktop, isNarrowMobile, isShortViewport, viewportHeight, viewportWidth };
}
