# Welcome / Desktop — especificación visual acordada

**Definición integral de la pantalla (incluye copy):** `WELCOME_PANTALLA_FINAL.md`.

Referencia única para **marco tipo dispositivo** (viewport ≥ `768px` salvo donde se indique). El hero **no** incluye chips de valor; **sí** incluye la **pill “caluga”** (borde translúcido + fondo vidrio) con tokens `--maqgo-welcome-caluga-*` en `tokens.css`.

**Copy (textos del hero):** ver `WELCOME_PANTALLA_FINAL.md`.  
**Variante antigua (negro + plata + borde rojo brillante, solo memoria):** ver `WELCOME_FRAME_VARIANTES_HISTORICAS.md` — **no** está aplicada en código.

## Marca (naranja)

| Uso | Valor |
|-----|--------|
| Naranja principal | `#EC6819` → `var(--maqgo-orange)` en `tokens.css` |
| Oscuro (gradiente CTA principal) | `#D45A10` |
| Claro (gradiente CTA principal) | `#EC6819` |
| RGBA marca (sombras) | `rgb(236, 104, 25)` = `#EC6819` |

## Fondo exterior (solo Welcome desktop)

| Uso | Valor |
|-----|--------|
| Negro detrás del marco | `#000000` → `var(--maqgo-bg-outer)` |
| Activación | Global en desktop: `html, body, #root` usan `--maqgo-bg-outer` en `maqgo.css` (+ CSS crítico en `index.html` para evitar FOUC). Ya no depende de clase en `<html>`. |

## Marco desktop (solo `.maqgo-app.welcome-desktop` @media ≥768px)

**Alcance:** el cromo “Tesla” (borde, sombra, `::before`) **no** aplica a login, registro u otras pantallas: solo a Welcome, donde el root envuelve con la clase `welcome-desktop`.

| Propiedad | Valor |
|-----------|--------|
| Borde (filete) | `1px solid var(--maqgo-welcome-frame-stroke)` (`rgba(255,255,255,0.19)`; interior desktop `--maqgo-bg` `#0c0c0c`) |
| `box-shadow` | **Cromo/plata:** `inset` + `var(--maqgo-welcome-frame-stroke-inset)` + sombras negras (ver `maqgo.css`) |
| `::before` (brillo esquina) | Gradiente **solo blanco** `135deg`, opacidad global ~`0.52` (menos velo gris vs. interior oscuro) |
| Radio | `38px` |

El **marco del dispositivo** y la **caluga** son neutros (filete translúcido); el **naranja de marca** queda en **CTAs** (principal en gradiente naranja; proveedor en acento cian), **línea `::after`** del mockup y énfasis del H1.

Archivo: `src/styles/maqgo.css` (bloque “Responsive para desktop”).

## Caluga (pill hero)

| Parte | Contenido |
|-------|-------------|
| Texto | *Arrienda maquinaria en minutos con disponibilidad en tiempo real.* |
| Estilo | `welcome-hero-caluga`: `var(--maqgo-welcome-caluga-*)` en `tokens.css`; `filter: drop-shadow` en `maqgo.css` |

Archivo: `src/screens/WelcomeScreen.jsx`.

## Motion

Entrada escalonada: `.welcome-mounted` en el contenedor + `.welcome-reveal` en bloques con `--welcome-d` (delays). Keyframes `welcomeReveal` en `maqgo.css`; `prefers-reduced-motion: reduce` desactiva animación.

## Acento marca (solo Welcome desktop)

Debajo del brillo `::before`, `::after` en `.maqgo-app.welcome-desktop`: **línea horizontal** ~2px en la parte inferior del marco, gradiente naranja **suave** (centro más intenso, bordes a transparente) + glow contenido. **No** hay filete naranja en todo el perímetro.

## Coherencia

- **Marco mockup:** filete blanco translúcido (`--maqgo-welcome-frame-stroke` / `--maqgo-welcome-frame-stroke-inset`).
- **Sin barra de chips** en hero.

---

*Última sincronización con código: revisar los archivos citados si se cambia la UI.*
