import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Hace scroll al inicio de la página cuando cambia la ruta.
 * Mejora la UX al navegar entre pantallas.
 */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default ScrollToTop;
