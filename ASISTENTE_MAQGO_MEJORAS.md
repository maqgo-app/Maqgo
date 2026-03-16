# Asistente MAQGO – Mejoras propuestas (mejores prácticas)

Propuestas concretas alineadas con: **operativo, onboarding, conversión**. Sin cargar FAQ.

---

## 1. Botones de acción (quick actions)

**Práctica:** Reducir fricción. Un toque = acción, no explicación.

**Cambio:** La API devuelve `response` + `actions`. El frontend renderiza botones que navegan.

```json
{
  "response": "Para registrarte como cliente, toca 'Empezar ahora' en la pantalla de inicio. ¿Te llevo ahí?",
  "actions": [
    { "label": "Ir a Empezar ahora", "path": "/register" },
    { "label": "Soy proveedor", "path": "/provider/register" }
  ]
}
```

**Uso:** Siempre que la respuesta indique un paso concreto, mostrar botón "Ir a X" que navegue y cierre el chat.

---

## 2. Sugerencias según rol (contexto)

**Práctica:** Personalizar según el estado del usuario.

**Cambio:** El frontend lee `userRole` de localStorage y muestra sugerencias distintas:

| Sin sesión | Cliente | Proveedor | Operador |
|------------|---------|-----------|----------|
| Quiero reservar maquinaria | ¿Cómo solicito maquinaria? | ¿Cómo agrego una máquina? | ¿Cómo activo mi disponibilidad? |
| Soy cliente/proveedor/operador | ¿Cuánto demora la primera reserva? | ¿Cómo invito operadores? | ¿Dónde veo mis servicios? |
| (3 opciones más) | | | |

**Beneficio:** El usuario ve opciones relevantes y aumenta la probabilidad de completar el flujo.

---

## 3. Mensaje inicial orientado a acción

**Práctica:** Primera impresión que invite a actuar.

**Antes:**
> ¡Hola! 👋 Soy el asistente operativo MAQGO. ¿En qué te ayudo? • Cliente: solicitar maquinaria o registrarte • Proveedor: registrar tu empresa • Operador: unirte con tu código

**Después (sin sesión):**
> ¡Hola! ¿Qué quieres hacer hoy?
> [Reservar maquinaria] [Registrar mi empresa] [Tengo código de operador]

**Después (con sesión cliente):**
> Hola. ¿En qué te ayudo?
> [Solicitar maquinaria] [Ver mi historial] [Otra duda]

**Beneficio:** Menos texto, más botones claros.

---

## 4. Respuestas más cortas + “¿Siguiente paso?”

**Práctica:** Respuestas breves, en bloques de 1–2 ideas, con cierre orientado a acción.

**Ejemplo – Registro proveedor:**

**Antes:** 5 viñetas en un solo mensaje.

**Después:**
> Te guío paso a paso. **Primero:** ve a la pantalla de inicio y toca "Soy Proveedor". ¿Ya lo encontraste?
> [Sí, continuar] [No, ayúdame]

La idea es mantener el contenido operativo pero ir por pasos (en backend se puede ir ampliando según intención).

**Implementación simple:** Mensajes actuales OK, pero añadir al final: "¿En qué paso estás? Puedo guiarte al siguiente."

---

## 5. Fallback con opciones (no genérico)

**Práctica:** Si no se entiende, ofrecer 3 caminos claros en lugar de un mensaje genérico.

**Antes:**
> ¿En qué te puedo ayudar? Puedo orientarte sobre cómo solicitar maquinaria, registrarte como cliente o proveedor, o usar el código de operador. También puedes revisar FAQ para más detalles.

**Después:**
> No estoy seguro de entenderte. ¿Qué quieres hacer?
> [Reservar maquinaria] [Registrarme como proveedor] [Unirme como operador]

**Implementación:** Cambiar el fallback del backend y del frontend para que devuelvan/reciban estas opciones como botones.

---

## 6. Sinónimos en el matching (backend)

**Práctica:** Reconocer más formas de expresar la misma intención.

**Cambios mínimos en `_match_operational`:**

| Intención | Palabras actuales | Agregar |
|-----------|-------------------|---------|
| Solicitar | solicito, reservo | arrendar, necesito, quiero, maquinaria hoy |
| Registro proveedor | registro, proveedor | publicar, máquinas, vender, empresa |
| Registro operador | operador, código | unir, código 6, SMS |

**Implementación:** Mapeo de palabras clave → misma respuesta.

```python
# Ejemplo: "necesito una retro" → solicito
SOLICITAR_KEYS = ["solicito", "solicitar", "reserv", "arrendar", "necesito", "quiero", "maquinaria"]
```

---

## 7. Derivar a FAQ con link

**Práctica:** Para pagos/comisiones, dar respuesta corta + link directo.

**Cambio:** La API devuelve `actions` con `path: "/faq"`. El frontend渲染 un botón "Ver FAQ" que navega.

**Respuesta actual:** OK, solo añadir `actions: [{ "label": "Ver FAQ", "path": "/faq" }]`.

---

## 8. Accesibilidad

**Práctica:** Chat usable con teclado y lectores de pantalla.

**Cambios:**
- `Escape` cierra la ventana.
- `aria-live="polite"` en el contenedor de mensajes.
- `role="log"` en el área de chat.
- `aria-label` en botones solo con icono.

---

## 9. Priorización de implementación

| Prioridad | Mejora | Impacto conversión | Esfuerzo |
|----------|--------|--------------------|----------|
| 1 | Botones de acción (Ir a X) | Alto | Medio |
| 2 | Sugerencias según rol | Alto | Bajo |
| 3 | Mensaje inicial con botones | Medio | Bajo |
| 4 | Fallback con opciones | Medio | Bajo |
| 5 | Sinónimos en matching | Medio | Bajo |
| 6 | Cierre "¿En qué paso estás?" | Bajo | Bajo |
| 7 | Link a FAQ en respuestas pago | Bajo | Bajo |
| 8 | Escape + aria | Bajo | Bajo |

---

## 10. Resumen

**Cambios que más favorecen conversión:**

1. **Botones de acción** – "Ir a registro", "Ir a reservar" que navegan y cierran el chat.
2. **Sugerencias según rol** – Cliente, proveedor u operador ven opciones relevantes.
3. **Mensaje inicial** – Más directo y con acciones concretas.
4. **Fallback con opciones** – Ante dudas, mostrar 3 caminos claros en lugar de texto genérico.
5. **Sinónimos** – Más variaciones de preguntas reconocidas correctamente.

**Orden sugerido:** Empezar por 2 (sugerencias según rol) y 4 (fallback) por ser rápidos y de alto impacto. Luego 1 (botones de acción) en backend y frontend.
