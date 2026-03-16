# Guía UX MAQGO – Mejores prácticas

Objetivo: llevar la experiencia de la app a estándar **world-class** (consistencia, accesibilidad, feedback claro y rendimiento percibido).

---

## 1. Principios

- **Un protagonista por pantalla**: una acción principal (CTA naranja), el resto secundario.
- **Feedback inmediato**: cada acción del usuario debe tener respuesta visual (toast, loading, éxito/error).
- **Sin sorpresas**: mensajes claros en errores, cancelación y estados vacíos.
- **Accesible por defecto**: focus visible, contraste, `aria-*` donde aporte, respeto a `prefers-reduced-motion`.

---

## 2. Componentes y patrones

### 2.1 Botones

- **Primario** (acción principal): `maqgo-btn-primary` o `<MaqgoButton variant="primary">`.
- **Secundario** (volver, cancelar): `maqgo-btn-secondary`.
- **Loading**: usar `MaqgoButton` con `loading={true}` para evitar doble submit y dar feedback.
- **Disabled**: no debe cambiar aspecto en hover/active (ya aplicado en CSS).

```jsx
import { MaqgoButton } from '../components/base';

<MaqgoButton loading={isSubmitting} onClick={handleSubmit}>
  Confirmar
</MaqgoButton>
```

### 2.2 Toast (feedback no intrusivo)

- Usar `useToast()` para éxito, error, advertencia e info.
- Mensajes cortos y en lenguaje de usuario (evitar códigos técnicos).
- No usar `alert()` para errores recuperables; usar `toast.error()`.

```jsx
const toast = useToast();
toast.success('Guardado');
toast.error('No se pudo conectar. Revisa tu internet.');
toast.warning('Completa la dirección');
```

### 2.3 Pantallas con formulario / flujo

- **Título** claro (h1), **subtítulo** opcional en gris.
- **Un CTA principal** por pantalla; si hay dos acciones, la secundaria en outline.
- **Barra fija abajo** para el CTA cuando el contenido hace scroll: `maqgo-fixed-bottom-bar`.
- **Validación**: mensajes junto al campo o toast; no solo border rojo sin texto.

### 2.4 Carga de datos

- **Skeleton** en listas (proveedores, historial): `ProviderOptionsSkeleton`, `HistoryListSkeleton`.
- **Botón con loading** en envíos (confirmar, pagar, enviar).
- Evitar pantallas en blanco con solo “Cargando...”; preferir skeleton o layout con spinner en la zona de contenido.

### 2.5 Estados vacíos y errores

- Usar componentes de `ErrorStates.js`: `NoProvidersError`, `NoProvidersTryTomorrow`, `ConnectionError`, etc.
- Incluir **acción clara** (reintentar, volver, ir a X).
- En errores de pago/cobro: repetir **“No se realizó ningún cobro”** cuando aplique.

### 2.6 Navegación

- **BookingProgress** en flujos de reserva (cliente).
- **BottomNavigation** en homes y historial; ocultar en flujos lineales (pago, confirmación).
- Botón “atrás” con `getBookingBackRoute(pathname)` para retroceso coherente.

---

## 3. Accesibilidad

- **Focus visible**: ya definido para botones, enlaces e inputs (`:focus-visible` con outline naranja/blanco).
- **Skip link**: “Saltar al contenido” en layout principal.
- **Toasts**: `role="status"`, `aria-live="polite"` para lectores de pantalla.
- **Botones con loading**: `aria-busy="true"` cuando corresponda (MaqgoButton lo hace).
- **Reduced motion**: animaciones y transiciones se reducen con `prefers-reduced-motion: reduce` en `maqgo.css`.

---

## 4. Checklist por pantalla nueva

- [ ] Título h1 y, si aplica, subtítulo.
- [ ] Un solo CTA principal; secundarios con `maqgo-btn-secondary`.
- [ ] CTAs que envían datos usan estado loading (evitar doble clic).
- [ ] Errores y validación con mensaje legible (toast o inline).
- [ ] Carga: skeleton o spinner en zona de contenido, no pantalla en blanco.
- [ ] Estado vacío con mensaje y acción (ej. “No hay resultados” + “Volver” o “Reintentar”).
- [ ] Safe area en barra fija y modales (ya en clases base).

---

## 5. Referencia rápida de clases (maqgo.css)

| Uso            | Clase / token              |
|----------------|----------------------------|
| Contenedor app | `maqgo-app`                |
| Pantalla       | `maqgo-screen`            |
| Título         | `maqgo-h1` / `maqgo-h2`   |
| Input          | `maqgo-input`             |
| CTA principal  | `maqgo-btn-primary`       |
| CTA secundario | `maqgo-btn-secondary`     |
| Barra fija     | `maqgo-fixed-bottom-bar`  |
| Precio         | `maqgo-price`             |
| Modal          | `maqgo-modal-overlay` + `maqgo-modal-dialog` |

Tokens en `styles/tokens.css`: `--maqgo-orange`, `--maqgo-space-md`, etc.

---

## 6. Recursos

- **Design tokens**: `frontend/src/styles/tokens.css`
- **Estilos globales**: `frontend/src/styles/maqgo.css`
- **Componentes base**: `frontend/src/components/base/`
- **Estados de error**: `frontend/src/components/ErrorStates.js`
- **Skeletons**: `frontend/src/components/ListSkeleton.jsx`
