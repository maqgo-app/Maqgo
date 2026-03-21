# Welcome — definición de pantalla final (v1)

Documento **maestro**: qué es la pantalla Welcome cuando los textos ya están cerrados.  
Implementación de referencia: `src/screens/WelcomeScreen.jsx` + estilos en `src/styles/maqgo.css` (y tokens en `tokens.css`).

---

## 1. Objetivo de la pantalla

- **Primera impresión** de MAQGO: clara, premium, sin ruido.
- **Tres caminos** explícitos: cliente (arrendar), proveedor (ofrecer), operador (unirse).
- **Acceso secundario:** login / registro / FAQ / legales / admin.

---

## 2. Estructura (orden vertical, de arriba abajo)

| # | Bloque | Contenido |
|---|--------|-----------|
| 1 | **Contenedor** | `.maqgo-app` + `.welcome-desktop` si viewport ≥ 768px |
| 2 | **Pantalla** | `.maqgo-screen.welcome-screen` — columna flex, altura viewport |
| 3 | **Header (hero)** | Logo → caluga → bloque texto (H1 + párrafo + chips) |
| 4 | **Main (CTAs)** | 3 botones grandes (cliente, proveedor, operador) |
| 5 | **Footer** | Login · registro · FAQ · términos · privacidad · Admin |

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
| **Caluga** (pill naranja) | *Elige en pocos pasos con disponibilidad en tiempo real* |
| **H1** | *Maquinaria pesada* **donde la necesitas** *con* **operador incluido** (énfasis naranja en “donde la necesitas”) |
| **Párrafo** | *Arrienda maquinaria en minutos, para hoy o en la fecha que indiques.* |
| **Chip 1** | *Hoy o programado* |
| **Chip 2** | *Reserva simple* |

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
| **≥ 768px** | Marco tipo dispositivo: `.maqgo-app` con borde cromo/plata, radio 38px, sombra oscura; fondo exterior negro (`maqgo-welcome-desktop-chrome` en `<html>`). |

**Caluga:** siempre visible; estilo naranja de marca (no confundir con el marco neutro).

---

## 5. Look & feel (resumen)

- **Marco desktop:** neutro (plata/cromo), **sin** halo naranja en el borde del mockup — ver `WELCOME_DESKTOP_VISUAL_SPEC.md`
- **Caluga + acentos de conversión:** naranja `#EC6819` / gradiente acordado
- **CTA proveedor:** acento cian `#90BDD3` coherente con marca secundaria
- **Chips:** barra tipo vidrio (clase `.welcome-value-chips`)

---

## 6. Rutas

- `/` y `/welcome` → misma pantalla (`App.jsx`)

---

## 7. Fuera de esta definición (explícito)

- Variante **negro + plata + borde rojo brillante:** solo referencia histórica, **no** producto actual → `WELCOME_FRAME_VARIANTES_HISTORICAS.md`
- Cualquier cambio de copy: actualizar **este archivo** + `WELCOME_COPY_LEVANTAMIENTO.md` + PR

---

## 8. Checklist antes de “cerrar” diseño

- [ ] Copy de hero coincide fila por fila con la tabla §3  
- [ ] Desktop ≥768px: se ve marco + fondo exterior negro  
- [ ] Móvil: sin solapamiento logo / texto / CTAs en alturas cortas  
- [ ] Footer enlaces vivos (FAQ, términos, privacidad)  
- [ ] `npm run build` frontend OK  

---

*Versión documento: alineada al código en repo en el momento de su creación; mantener sincronizado con commits de Welcome.*
