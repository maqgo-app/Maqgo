# Onboarding: Análisis Uber, Cabify, Didi y Mejores Prácticas 2024

Revisión de cómo las apps líderes de movilidad/on-demand manejan el onboarding y recomendaciones para MAQGO.

---

## 1. Cómo lo hacen las apps líderes

### Uber

**Hallazgo principal:** Eliminaron la elección "Iniciar sesión" vs "Registrarme".

- **Problema detectado:** Los usuarios rebotaban entre ambas opciones, elegían la incorrecta, mayor tasa de error y abandono.
- **Solución:** Una sola entrada: **número de teléfono**. El backend determina si es usuario nuevo o existente y enruta automáticamente.
- **Principios:**
  - Quitar obstáculos que generan indecisión
  - Reducir ruido y carga cognitiva
  - Validar input con frecuencia (un dato a la vez)
  - Orquestación server-driven para experimentación e internacionalización

**Flujo actual:** "¿Cuál es tu número o email?" + opciones Google/Apple/QR. Sin botones separados de login/registro.

---

### Didi

- **Primera pantalla:** Campo de **número de teléfono** (con selector de país).
- **Siguiente:** Código SMS de 4 dígitos.
- **Después:** Permiso de GPS (con opción de aceptar o denegar).
- **Objetivo:** Llevar al usuario a la acción principal (reservar viaje) con el mínimo de pasos.

---

### Cabify

- **Expectativas antes del commit:** Instrucciones en el checkout, no después de reservar. +13% viajes exitosos en el primer mes.
- **Guía contextual:** En puntos de alta fricción (ej. aeropuerto), instrucciones paso a paso y banners claros.
- **Contenido escalable:** Herramientas de admin para actualizar guías sin depender de ingeniería.

---

## 2. Mejores prácticas actuales (2024)

| Práctica | Impacto |
|----------|---------|
| **Vender resultados, no features** | +17% conversión en trials cuando el copy se enfoca en beneficios |
| **Progressive disclosure** | Información gradual; evitar sobrecarga en la primera pantalla |
| **Guest checkout / explorar sin cuenta** | ~26% más conversión en móvil vs forzar registro |
| **Un solo CTA dominante** | Menos indecisión, mayor conversión |
| **Pedir un dato a la vez** | Menos errores, validación más clara |
| **Retrasar permisos** | 3x más opt-in a notificaciones si se piden después del primer valor |
| **A/B testing del onboarding** | Pequeños cambios pueden subir conversión en doble dígito |

**Dato:** ~25% de usuarios desinstalan tras un solo uso. El onboarding es una de las áreas con mayor impacto.

---

## 3. Patrón recomendado para MAQGO

### Opción A: Phone-first (estilo Uber) — más disruptiva

**Pantalla 1:** Un solo campo: "Ingresa tu número para continuar"
- Sin botones "Empezar" / "Ya tengo cuenta" / "Proveedor"
- El backend, con el número, decide si es nuevo o existente y enruta

**Ventajas:** Elimina la indecisión, flujo más limpio.
**Esfuerzo:** Requiere cambios en backend (endpoint que recibe número y devuelve estado).

---

### Opción B: Guest-first + phone opcional (híbrido) — más conservadora

**Pantalla 1:**
- **CTA principal:** "Empezar ahora" (entrar como invitado, sin registro)
- **Link secundario:** "Continuar con tu número" (flujo phone-first para quien quiera cuenta)
- **Link terciario:** "¿Eres proveedor?" (discreto)

**Ventajas:** Mantiene el guest checkout (26% más conversión) y ofrece phone-first a quien lo prefiera.
**Esfuerzo:** Bajo; se reordena la pantalla actual.

---

### Opción C: Phone-first unificado (recomendada para MAQGO)

**Pantalla 1:**
- Slogan + valor en una línea
- Un solo campo: **"Número de celular"** con prefijo +56
- Botón: **"Continuar"**
- Texto: "Te enviaremos un código para verificar. Sin contraseña."
- Links discretos: "¿Eres proveedor?" | "Soy operador"

**Flujo:**
1. Usuario ingresa número → SMS → verificación
2. Backend: si existe → login; si no → registro (nombre, email opcional)
3. Tras verificar → cliente va a /client/home; proveedor a /provider/data

**Ventajas:**
- Sin elección login/registro
- Un solo dato inicial
- Alineado con Uber, Didi y prácticas actuales

---

## 4. Resumen de principios aplicables

1. **Un solo punto de entrada** — Evitar "¿Iniciar sesión o registrarme?"
2. **Un dato a la vez** — Número primero; nombre/email después si hace falta
3. **Valor antes de pedir** — Mostrar beneficio claro antes de formularios
4. **Guest o phone-first** — O permitir explorar sin cuenta, o pedir solo número
5. **Links discretos** — Proveedor y operador como opciones secundarias
6. **Validación temprana** — Comprobar número/email en cada paso
7. **Server-driven** — Backend define pasos según mercado y experimentos

---

## 5. Próximos pasos sugeridos

1. **Corto plazo:** Mantener "Empezar ahora" como CTA principal (guest-first) y asegurar que los links secundarios estén bien jerarquizados.
2. **Mediano plazo:** Implementar flujo phone-first unificado (Opción C) con backend que enrute según número.
3. **Largo plazo:** A/B test entre guest-first y phone-first para medir conversión real.
