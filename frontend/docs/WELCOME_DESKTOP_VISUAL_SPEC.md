# Welcome / Desktop — especificación visual acordada

**Definición integral de la pantalla (incluye copy):** `WELCOME_PANTALLA_FINAL.md`.

Referencia única para **marco tipo dispositivo**, **caluga** y **chips** (viewport ≥ `768px` salvo donde se indique).

**Copy (textos del hero):** ver `WELCOME_COPY_LEVANTAMIENTO.md` — no duplicar criterios aquí.  
**Variante antigua (negro + plata + borde rojo brillante, solo memoria):** ver `WELCOME_FRAME_VARIANTES_HISTORICAS.md` — **no** está aplicada en código.

## Marca (naranja)

| Uso | Valor |
|-----|--------|
| Naranja principal | `#EC6819` → `var(--maqgo-orange)` en `tokens.css` |
| Oscuro (gradiente caluga) | `#B8430E` |
| Claro (gradiente caluga) | `#F0843A` |
| RGBA marca (sombras) | `rgb(236, 104, 25)` = `#EC6819` |

## Fondo exterior (solo Welcome desktop)

| Uso | Valor |
|-----|--------|
| Negro detrás del marco | `#000000` → `var(--maqgo-bg-outer)` |
| Activación | Clase `maqgo-welcome-desktop-chrome` en `<html>` (`WelcomeScreen.jsx`) |

## Marco desktop (`.maqgo-app` @media ≥768px)

| Propiedad | Valor |
|-----------|--------|
| Borde (filete) | `1px solid rgba(255, 255, 255, 0.14)` |
| `box-shadow` | **Cromo/plata:** filete blanco + `0 18px 46px` sombra negra (sin halo naranja en el marco) |
| `::before` (brillo esquina) | Gradiente **solo blanco** `135deg`: `rgba(255,255,255,0.14)` → transparente, `opacity: ~0.72` |
| Radio | `38px` |

El **marco del dispositivo** no repite el color de la caluga: es look **hardware / Tesla** en neutro; el **naranja de marca** queda en la pill y CTAs.

Archivo: `src/styles/maqgo.css` (bloque “Responsive para desktop”).

## Caluga superior (pill naranja)

| Propiedad | Valor |
|-----------|--------|
| Fondo | `linear-gradient(135deg, #F0843A 0%, #EC6819 45%, #B8430E 100%)` |
| Borde | `1px solid rgba(255, 255, 255, 0.14)` |
| Sombra externa + highlight | `0 8px 28px rgba(236, 104, 25, 0.38)`, `inset 0 1px 0 rgba(255,255,255,0.28)` |
| Extra CSS | `.welcome-hero-caluga`: `filter: drop-shadow(0 4px 20px rgba(236, 104, 25, 0.35))` |
| Texto | `#FFFBF7`, `text-shadow: 0 1px 2px rgba(0,0,0,0.18)` |

Archivo: `src/screens/WelcomeScreen.jsx` (inline styles + clase `welcome-hero-caluga`).

**Copy actual (caluga):** *Elige en pocos pasos con disponibilidad en tiempo real*

## Chips de valor (`.welcome-value-chips`)

| Propiedad | Valor |
|-----------|--------|
| Fondo | Gradiente vertical blanco translúcido (ver `maqgo.css`) |
| Borde | `1px solid rgba(255, 255, 255, 0.14)` |
| Efecto | `backdrop-filter: blur(10px)` + sombras internas/externas |

Archivo: `src/styles/maqgo.css`.

## Coherencia

- **Mismo “filete”** caluga / marco / chips: `rgba(255, 255, 255, 0.14)`.
- **Acento naranja** solo en caluga (y UI de marca), **no** en el borde exterior del mockup desktop.

---

*Última sincronización con código: revisar los archivos citados si se cambia la UI.*
