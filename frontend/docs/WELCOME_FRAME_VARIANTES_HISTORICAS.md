# Variantes históricas — marco Welcome / desktop

**No vigente:** el producto actual usa el marco **cromo/plata** (neutro) descrito en `WELCOME_DESKTOP_VISUAL_SPEC.md`.  
Este archivo solo **recuerda** una dirección visual que se exploró (o se asocia a un mock), para no perder el criterio.

## Variante recordada por el equipo (referencia)

| Aspecto | Descripción |
|--------|-------------|
| **Fondo exterior** | Negro oscuro (contraste fuerte con el “dispositivo”) |
| **Cuerpo del marco / interior** | Grises tipo **plata** (superficie metálica / vidrio oscuro) |
| **Borde** | **Rojo brillante** (“rillante” = brillante/reflejo), acento llamativo alrededor del mockup |

No está versionada tal cual en el árbol actual; en Git aparecieron antes etapas con **filete blanco + sombra negra**, luego **halo naranja** alineado a la caluga, y ahora **cromo sin tinte** en el borde del dispositivo.

## Cómo se podría replicar “algo similar” (técnico, por si vuelve el brief)

1. **Fondo exterior:** `var(--maqgo-bg-outer)` o `#0a0a0c` / negro puro según contraste deseado.
2. **Marco “plata”:** borde `1px solid rgba(255,255,255,0.12–0.18)` + `box-shadow` con capas blancas suaves + sombra negra profunda; `::before` con gradiente solo en grises/blanco.
3. **Borde rojo brillante** (sin pintar todo el fondo de rojo):
   - **Opción A:** `box-shadow: 0 0 0 1px rgba(220, 38, 38, 0.6), 0 0 24px rgba(220, 38, 38, 0.25)` (rojo intenso tipo “LED”).
   - **Opción B:** pseudo-elemento `::after` con `conic-gradient` o `linear-gradient` rojo semitransparente simulando bisel.
   - **Opción C:** doble borde: anillo interior plata + anillo exterior `linear-gradient(90deg, #c92a2a, #ff6b6b, #c92a2a)` en un wrapper con `padding: 1px`.

Si en el futuro se retoma esta línea, conviene **PR aparte** y captura en Figma o screenshot para alinear “rojo” exacto (marca vs. alerta).

---

*Última nota: texto basado en recuerdo del stakeholder; ajustar valores si aparece el mock original.*
