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
    const shell = document.querySelector('.maqgo-app-shell-routes');
    if (!shell) return;
    shell.querySelectorAll('.maqgo-screen, .maqgo-screen--scroll').forEach((el) => {
      el.scrollTop = 0;
    });
    const direct = shell.firstElementChild;
    if (direct && !direct.classList?.contains('maqgo-app') && 'scrollTop' in direct) {
      direct.scrollTop = 0;
    }
  }, [pathname]);
  return null;
}

export default ScrollToTop;
