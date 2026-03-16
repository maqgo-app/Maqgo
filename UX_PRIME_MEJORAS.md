# Experiencia MAQGO Prime – Mejoras UX Premium

Propuestas concretas para elevar la experiencia de usuario a un nivel premium, priorizadas por impacto y esfuerzo.

---

## 1. Feedback y microinteracciones

### 1.1 Vibración háptica en acciones clave
Ya existe `uberUX.vibrate()` pero no se usa. Integrar en:
- **Botón primario** (confirmar, aceptar, pagar) → `vibrate('tap')`
- **Reserva confirmada** → `vibrate('accepted')`
- **Operador llegando** → `vibrate('arriving')`
- **Servicio iniciado/finalizado** → `vibrate('finished')`

**Archivos:** `utils/uberUX.js` (ya existe), `components/ui/MaqgoButton.js`, pantallas de confirmación de servicio.

### 1.2 Feedback visual en botones
- Estado `:active` más pronunciado (scale 0.97)
- Indicador de carga con spinner en lugar de only "Cargando..."
- Deshabilitar click doble con debounce en CTAs críticos

### 1.3 Sonidos (opcionales)
`playAlert()` existe pero no se usa. Opción para usuarios que lo activen:
- Solicitud aceptada
- Operador llegando
- Servicio finalizado

---

## 2. Estados de carga

### 2.1 Skeleton loading en listas
El componente `Skeleton` existe en `components/ui/skeleton.jsx` pero se usa poco.

**Pantallas a mejorar:**
- `ProviderOptionsScreen` – lista de proveedores
- `HistoryScreen` / `ProviderHistoryScreen` – historial
- `AdminDashboard` – cards de stats
- `ServiceChat` – mensajes

**Ejemplo:**
```jsx
{loading ? (
  <>
    {[1,2,3].map(i => (
      <div key={i} className="maqgo-machinery-item">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    ))
  </>
) : (
  // contenido real
)}
```

### 2.2 Loading global en auth
En `AuthContext`, cuando `loading` es true, mostrar un overlay sutil con logo MAQGO animado en lugar de pantalla vacía.

### 2.3 Precio en ConfirmServiceScreen
Ya hay `loadingPrice`; asegurar que el skeleton del precio sea consistente con el diseño final.

---

## 3. Transiciones de pantalla

### 3.1 Transiciones entre rutas
Hoy no hay animaciones entre pantallas. Opciones:
- **Framer Motion** (si ya está en el proyecto) o **CSS transitions**
- Fade-in suave (opacity 0→1) al montar
- Slide desde abajo en modales/bottom sheets

**Implementación mínima:**  
Wrapper en `App.jsx` con `AnimatePresence` + `motion.div` por ruta, con `initial={{ opacity: 0 }}` y `animate={{ opacity: 1 }}`.

### 3.2 Transiciones en tarjetas
- `maqgo-option-card`: `transition: transform 0.2s, box-shadow 0.2s`
- Ya existe `transform: scale(0.98)` en `:active`; añadir `will-change: transform` para suavidad.

---

## 4. Diálogos y confirmaciones

### 4.1 Reemplazar `window.confirm` en ClientHome
El mensaje "¿Deseas continuar donde quedaste?" usa `window.confirm`, que rompe la estética.

**Solución:** Usar componente `AlertDialog` (ya existe en `components/ui/alert-dialog.jsx`) con:
- Título: "Reserva en progreso"
- Descripción: "Tienes una reserva sin terminar. ¿Continuar donde quedaste?"
- Botones: "Continuar" (naranja) y "Nueva reserva" (secundario)

### 4.2 Confirmaciones críticas
- Cancelar servicio
- Rechazar solicitud (proveedor)
- Cualquier acción destructiva

Usar siempre `AlertDialog` en lugar de `confirm`/`alert`.

---

## 5. Toast y notificaciones

### 5.1 Toast mejorado
- Animación de salida (fade-out antes de desaparecer)
- Posible posicionamiento: bottom en móvil (sobre la barra de navegación)
- Acción opcional (ej. "Deshacer" en eliminaciones)
- Queue: si llegan varios toasts seguidos, no superponer

### 5.2 Notificaciones push (ya existe `showSystemNotification`)
Integrar en:
- Nueva solicitud (proveedor)
- Operador aceptó (cliente)
- Operador en camino / llegó
- Servicio finalizado

Pedir permiso de notificaciones en el primer flujo relevante (ej. al confirmar reserva).

---

## 6. Flujo de reserva

### 6.1 Indicador de progreso
Ya hay `maqgo-dots` en el CSS. Usar en:
- `MachinerySelection` → `HoursSelection` → `ServiceLocationScreen` → `ProviderOptionsScreen` → `ConfirmServiceScreen`

Mostrar dots actualizados según el paso actual (ej. 5 dots, el 3º activo).

### 6.2 Persistencia + recuperación
- Guardar progreso en `localStorage` (ya se hace parcialmente)
- Mensaje claro al volver: "Tu reserva está guardada. Continúa cuando quieras."
- Botón "Nueva reserva" que limpia y empieza de cero

### 6.3 Validación en tiempo real
- Comuna: sugerencias mientras se escribe (ComunaAutocomplete ya existe)
- Dirección: sugerencias de Google Places
- Teléfono: formato chileno automático

---

## 7. Empty states y onboarding

### 7.1 Empty states
- Historial vacío: ilustración + "Aún no tienes servicios. Reserva tu primera máquina."
- Sin máquinas (proveedor): CTA claro para agregar
- Sin proveedores: ya hay `NoProvidersError`; revisar copy y diseño

### 7.2 Onboarding primera vez (opcional)
- Cliente: 1–2 pantallas con beneficios ("Maquinaria en minutos", "Sin contratos")
- Proveedor: guía corta de pasos para publicar la primera máquina

---

## 8. Accesibilidad

### 8.1 Focus visible
- `:focus-visible` en botones e inputs (ya hay algo en `maqgo-input:focus`)
- Evitar `outline: none` sin alternativa (anillo de focus naranja)

### 8.2 Contraste
- Revisar grises `rgba(255,255,255,0.5)` en textos secundarios
- Asegurar ratio mínimo 4.5:1 para texto normal

### 8.3 Labels
- `aria-label` en botones solo con icono (Historial, Perfil, etc.)
- `aria-live` en zonas que cambian dinámicamente (toasts, estado de búsqueda)

---

## 9. Performance percibida

### 9.1 Optimistic UI
- Al aceptar una solicitud: mostrar "Aceptando..." y, si la API tarda, feedback inmediato visual
- Al enviar mensaje en chat: mostrar mensaje localmente mientras se confirma

### 9.2 Prefetch
- Pre-cargar datos de la siguiente pantalla cuando sea predecible
- Ejemplo: al llegar a `ProviderOptionsScreen`, ya tener proveedores en cache si se obtuvo antes

### 9.3 Código de verificación SMS
- Auto-focus en el siguiente input al completar dígito
- Paste de código completo: detectar y rellenar todos los inputs

---

## 10. Detalles premium

### 10.1 Safe area
- Ya se usa `env(safe-area-inset-bottom)` en la barra de navegación
- Revisar que el contenido no quede tapado en iPhone con notch

### 10.2 Pull-to-refresh
- En historial y listas de servicios
- Indicador nativo o custom con logo MAQGO

### 10.3 Gestos
- Swipe para volver (si se usa navegación type "stack")
- Swipe en tarjetas de proveedor para ver más detalles

### 10.4 Modo offline
- Detectar `navigator.onLine`
- Mostrar banner: "Sin conexión. Revisa tu internet."
- Deshabilitar acciones que requieran red

---

## Priorización sugerida

| Prioridad | Mejora                           | Impacto | Esfuerzo |
|----------|-----------------------------------|---------|----------|
| Alta     | Diálogos custom (no confirm)      | Alto    | Bajo     |
| Alta     | Skeleton en listas clave         | Alto    | Medio   |
| Alta     | Vibración en CTAs principales    | Medio   | Bajo     |
| Media    | Transiciones de pantalla         | Alto    | Medio   |
| Media    | Indicador de progreso reserva    | Medio   | Bajo     |
| Media    | Toast con animación de salida    | Medio   | Bajo     |
| Media    | Empty states ilustrados          | Medio   | Medio   |
| Baja     | Sonidos (opcional)                | Bajo    | Bajo     |
| Baja     | Pull-to-refresh                  | Bajo    | Medio   |
| Baja     | Onboarding primera vez           | Medio   | Alto    |

---

## Resumen ejecutivo

Para lograr una experiencia "prime" sin rediseñar todo:

1. Eliminar `window.confirm`/`alert` y usar componentes de UI.
2. Usar skeletons en listas y pantallas de carga.
3. Activar vibración en acciones clave.
4. Añadir transiciones suaves entre pantallas.
5. Mejorar indicador de progreso en el flujo de reserva.
6. Revisar empty states y mensajes de error con copy más claro.

Con estas mejoras, la app se percibirá más fluida, moderna y confiable.
