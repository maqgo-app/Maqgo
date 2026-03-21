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
    const mqDesk = window.matchMedia(`(min-width: ${BREAKPOINT_MOBILE}px)`);
    const onDesk = () => setIsDesktop(mqDesk.matches);
    onDesk();
    mqDesk.addEventListener('change', onDesk);
    return () => mqDesk.removeEventListener('change', onDesk);
  }, []);

  useEffect(() => {
    const mqNarrow = window.matchMedia(`(max-width: ${BREAKPOINT_NARROW}px)`);
    const onNarrow = () => setIsNarrowMobile(mqNarrow.matches);
    onNarrow();
    mqNarrow.addEventListener('change', onNarrow);
    return () => mqNarrow.removeEventListener('change', onNarrow);
  }, []);

  return { isDesktop, isNarrowMobile, isShortViewport, viewportHeight, viewportWidth };
}
