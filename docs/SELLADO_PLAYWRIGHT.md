# Sellado final: E2E + dispositivos reales

Los tests automáticos cubren **patrones del repo** (rutas, z-index de Google Places, welcome→login). **No sustituyen**:

- Safari en **iOS** (WebKit de Playwright ≠ Safari al 100%).
- Chrome en **Android** físico.
- **Red lenta / offline intermitente**.

## Comando local (preview de producción)

```bash
cd Maqgo/frontend
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

En otra terminal:

```bash
cd Maqgo/frontend
npx playwright install chromium  # una vez
npm run test:e2e:sellado
```

Staging:

```bash
PLAYWRIGHT_BASE_URL=https://tu-staging.maqgo.cl npm run test:e2e:sellado
```

Viewport móvil (WebKit + Pixel) en los mismos tests:

```bash
PLAYWRIGHT_SELLADO_FULL=1 npm run test:e2e:sellado
```

## Checklist manual (obligatorio antes del sellado)

1. **Cliente:** welcome → login → home → máquina → ubicación (dirección + comuna + continuar hasta proveedores) con **Maps** activo en prod.
2. **Proveedor:** login → home / onboarding hasta máquina visible.
3. **Operador:** `/operator/join` con código válido.
4. **iOS Safari:** mismo flujo crítico cliente (sugerencias Places, barra fija, teclado).
5. **Android Chrome:** idem.
6. **Red lenta (throttling):** no doble-submit en pagos; spinners con señal clara.

## Auditoría en código (referencia rápida)

- Rutas **eager** donde el flash rompe confianza: welcome, register, login, **client home**, **machinery**, forgot-password.
- **Sin ruta:** `CalendarSelection` eliminado del árbol (evitar código muerto).
- **Ubicación:** comuna visible si Places dejó lat/lng sin comuna; `.pac-container` por encima de `--maqgo-z-fixed-bar`.
