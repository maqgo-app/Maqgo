# Experiencia Prime del Asistente MAQGO

Mejoras concretas para elevar el asistente de chat a un nivel premium.

---

## 1. Interfaz y microinteracciones

### 1.1 Animación de apertura/cierre
- Abrir: scale 0.95 → 1 + fade-in (200–300ms)
- Cerrar: fade-out + scale 0.95
- Botón flotante: pequeño “pulse” sutil cuando hay mensaje nuevo (si se implementa notificación)

### 1.2 Mensajes
- Aparición de cada mensaje: slide desde abajo (user) o desde arriba (asistente) + fade
- Transición suave al llegar cada mensaje nuevo
- Evitar que la burbuja “salte” de golpe

### 1.3 Indicador de escritura
- Ya existe el de 3 puntos; podría ser más suave (colores MAQGO: #EC6819 suave)
- Alternativa: animación tipo “typing” con cursor parpadeante

### 1.4 Feedback al enviar
- Vibración sutil al enviar mensaje (`vibrate('tap')`)
- Botón enviar: breve animación de “enviado” (check o animación)

---

## 2. Contenido y respuestas

### 2.1 Formato enriquecido
- Detectar listas (• o -) y renderizarlas con mejor espaciado
- **Bold** para pasos importantes
- Enlaces clicables (FAQ, Términos) que abran la ruta correspondiente
- Dividir respuestas largas en varios mensajes cortos (más natural)

### 2.2 Acciones rápidas en respuestas
- Botones inline: “Ir a reservar”, “Ver FAQ”, “Registrarme”
- Al tocar, navegar a la pantalla correspondiente y cerrar/minimizar el chat
- Ejemplo: tras “cómo solicito” → botón “Ir a Inicio”

### 2.3 Respuestas más conversacionales
- Saludo según hora: “Buenos días”, “Buenas tardes”, “Buenas noches”
- Despedida cuando el usuario parece satisfecho (“¿Algo más?”)
- Frases intermedias: “Te explico paso a paso…”

---

## 3. Contexto y personalización

### 3.1 Rol del usuario
- Detectar `userRole` en localStorage
- Mensaje inicial: si es cliente → “¿Necesitas ayuda para reservar?”; si es proveedor → “¿Ayuda con tu empresa o maquinarias?”
- Sugerencias según rol: cliente ve “¿Cómo solicito maquinaria?”; proveedor ve “¿Cómo agrego una máquina?”

### 3.2 Ubicación en la app
- Si está en `/client/confirm` → sugerir “¿Dudas sobre el pago?”
- Si está en `/client/providers` → “¿Cómo eligir proveedor?”
- Pasar `current_path` al backend (opcional) para respuestas contextuales

### 3.3 Historial de conversación
- Persistir mensajes en `localStorage` (con límite, ej. últimas 20)
- Al reabrir: “Continuamos desde donde quedamos” o mostrar últimos mensajes
- Opción “Nueva conversación” para empezar de cero

---

## 4. Usabilidad

### 4.1 Sugerencias dinámicas
- Tras cada respuesta del asistente, proponer 1–3 preguntas relacionadas
- Ejemplo: tras “cómo solicito” → “¿Cuánto tiempo demora?”, “¿Puedo cancelar?”
- En lugar de 4 sugerencias fijas, rotar según el último tema

### 4.2 Atajos de teclado (desktop)
- Enter: enviar
- Escape: cerrar ventana
- Ya existe Enter; añadir Escape

### 4.3 Accesibilidad
- `aria-live="polite"` en el contenedor de mensajes
- `role="log"` para el área de chat
- Anunciar mensajes nuevos a lectores de pantalla

---

## 5. Backend (chatbot.py)

### 5.1 Matching más inteligente
- Sinónimos: “arrendar” = “solicitar” = “reservar”
- Tolerancia a typos: “registrarme” ≈ “registrarme”
- Preguntas compuestas: “quiero ser proveedor y no sé cómo” → REGISTRO_PROVEEDOR

### 5.2 Respuestas más ricas
- Estructura JSON con `content` + `actions` (botones)
- Ejemplo: `{"content": "...", "actions": [{"label": "Ir a reservar", "path": "/client/home"}]}`

### 5.3 Fallback amigable
- Si no matchea: “No estoy seguro de entender. ¿Te refieres a…?” + 2–3 opciones
- Evitar el genérico “¿En qué te puedo ayudar?”

---

## 6. Posicionamiento y visibilidad

### 6.1 Z-index y safe area
- No tapar la barra inferior ni elementos importantes
- `bottom: 90px` ya considera la nav; revisar en iPhone con notch

### 6.2 Modo expandido
- En desktop: posibilidad de ventana más grande (ej. 400x600)
- En móvil: pantalla completa opcional al tocar “expandir”

### 6.3 Disponibilidad
- Pequeño badge “En línea” cuando el backend responde OK
- Si fallback: indicar “Modo sin conexión” para que el usuario sepa que son respuestas locales

---

## 7. Priorización sugerida

| Prioridad | Mejora | Impacto | Esfuerzo |
|----------|--------|---------|----------|
| Alta     | Sugerencias según rol (userRole) | Alto | Bajo |
| Alta     | Botones de acción en respuestas (Ir a X) | Alto | Medio |
| Alta     | Saludo/contexto según hora y rol | Medio | Bajo |
| Media    | Animación de apertura/cierre | Medio | Bajo |
| Media    | Persistir historial en localStorage | Medio | Medio |
| Media    | Formato enriquecido (links clicables) | Medio | Medio |
| Media    | Matching mejorado (sinónimos) | Medio | Bajo |
| Baja     | Sugerencias dinámicas post-respuesta | Medio | Medio |
| Baja     | Modo expandido / pantalla completa | Bajo | Medio |
| Baja     | Indicador “En línea” / “Sin conexión” | Bajo | Bajo |

---

## 8. Resumen ejecutivo

Para una experiencia “prime” del asistente:

1. **Personalización**: Sugerencias y saludo según rol y hora.
2. **Acciones**: Botones “Ir a…” directos en las respuestas.
3. **Fluidez**: Animaciones suaves de apertura y mensajes.
4. **Contexto**: Persistir historial y adaptar sugerencias al tema.
5. **Calidad**: Mejor matching, links clicables y fallback más amigable.

Con estas mejoras, el asistente se siente más útil, rápido y alineado con el resto de MAQGO.
