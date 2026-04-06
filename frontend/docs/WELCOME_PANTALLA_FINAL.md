# Welcome — definición de pantalla final (v1, **cerrada producción**)

Documento **maestro**: qué es la pantalla Welcome cuando los textos ya están cerrados.  
Implementación de referencia: `src/screens/WelcomeScreen.jsx` + `src/utils/welcomeHome.js` + estilos en `src/styles/maqgo.css` (y `tokens.css`).  
**Cierre:** checklist §8 verificada en código; FOUC/flash mitigados (`index.html` crítico + `useLayoutEffect` + fondo desktop global).

---

## 1. Objetivo de la pantalla

- **Primera impresión** de MAQGO: clara, premium, sin ruido.
- **Tres caminos** explícitos: cliente (arrendar), proveedor (ofrecer), operador (unirse).
- **Acceso secundario:** login o **Mi cuenta** (si hay sesión) / registro (solo sin sesión) / FAQ / legales / **Admin** (solo si `userRole === 'admin'` en sesión).

---

## 2. Estructura (orden vertical, de arriba abajo)

| # | Bloque | Contenido |
|---|--------|-----------|
| 1 | **Contenedor** | `.maqgo-app` + `.welcome-desktop` si viewport ≥ 768px |
| 2 | **Pantalla** | `.maqgo-screen.welcome-screen` — columna flex, altura viewport |
| 3 | **Header (hero)** | Logo → caluga → **H1** — **sin** párrafo gris bajo el título — **sin** chips |
| 4 | **Main (CTAs)** | 3 botones grandes (cliente, proveedor, operador) |
| 5 | **Footer** | Sin sesión: Iniciar sesión · Registrarse · FAQ · legales. Con sesión: **Mi cuenta** (home por rol) · FAQ · legales · Admin si admin |

**Sin** banner “Continuar arriendo” en esta pantalla (regla de negocio + UX acordada).

---

## 3. Textos finales (copy congelado)

### Meta / marca
| Dónde | Texto |
|--------|--------|
| `document.title`, `index.html`, `manifest` | `MAQGO - Maquinaria pesada donde la necesitas` |

### Hero
| Elemento | Texto |
|----------|--------|
| **Caluga** (pill fondo vidrio, borde neutro) | *Arrienda maquinaria en minutos con disponibilidad en tiempo real.* |
| **H1** | *Maquinaria pesada* **donde la necesitas** *con* **operador incluido** (énfasis naranja en “donde la necesitas”) |
| **Párrafo** bajo H1 | *—* (ninguno; la promesa va en la caluga + CTA) |

### CTAs (título + subtítulo)
| Botón | Título | Subtítulo |
|-------|--------|-----------|
| Principal (naranja) | *Arrendar maquinaria* | *Para hoy o en la fecha que indiques* |
| Secundario (cian) | *Ofrecer mi maquinaria* | *Regístrate y recibe solicitudes de clientes* |
| Terciario (neutro) | *Soy operador* | *Unirme con código de equipo* |

### Footer
- *Iniciar sesión* · *¿No tienes cuenta? Regístrate*
- *FAQ* · *Términos y Condiciones* · *Política de Privacidad* · *Admin* (con contador si hay pendientes)

**Detalle de criterios y cambios históricos:** `WELCOME_COPY_LEVANTAMIENTO.md`

---

## 4. Comportamiento responsive

| Viewport | Comportamiento |
|----------|----------------|
| **&lt; 768px** | Pantalla completa; sin marco “teléfono”; fondo `var(--maqgo-bg)`; tipografía y espaciados con `useWelcomeLayout` + `welcome-short` si aplica. |
| **≥ 768px** | Marco tipo dispositivo: `.maqgo-app.welcome-desktop` con borde cromo/plata, sombra; fondo exterior negro vía `html, body, #root` + `index.html` crítico (sin FOUC). |

**Caluga:** pill visible; borde translúcido + fondo vidrio (`tokens.css`); **sin** barra de chips.

---

## 5. Look & feel (resumen)

- **Marco desktop:** neutro (plata/cromo), **sin** halo naranja en el borde del mockup — ver `WELCOME_DESKTOP_VISUAL_SPEC.md`
- **Caluga + acentos de conversión:** naranja `#EC6819` / gradiente acordado
- **CTA proveedor:** acento cian `#90BDD3` coherente con marca secundaria
- **Sin chips** en el hero (histórico retirado)
- **Motion:** entrada escalonada `.welcome-mounted` + `.welcome-reveal` en `maqgo.css` (`prefers-reduced-motion` respeta accesibilidad)

---

## 6. Rutas

- `/` y `/welcome` → misma pantalla (`App.jsx`)

---

## 7. Fuera de esta definición (explícito)

- Variante **negro + plata + borde rojo brillante:** solo referencia histórica, **no** producto actual → `WELCOME_FRAME_VARIANTES_HISTORICAS.md`
- Cualquier cambio de copy: actualizar **este archivo** + `WELCOME_COPY_LEVANTAMIENTO.md` + PR

---

## 8. Checklist — **cerrado para producción**

- [x] Copy de hero alineado con la tabla §3  
- [x] Desktop ≥768px: marco `.welcome-desktop` + fondo exterior negro (sin FOUC crítico)  
- [x] Móvil: `welcome-short` + escalado logo; revisión manual recomendada en SE / teclado  
- [x] Footer: enlaces FAQ / términos / privacidad; sesión + admin según reglas actuales  
- [x] `npm run gate:deploy` (tests + build) OK — ver `docs/CTO_PRODUCTION_GATE.md`  

---

*Mantener este archivo sincronizado con cambios futuros de Welcome.*
