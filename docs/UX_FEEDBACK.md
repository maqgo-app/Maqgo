# UX: feedback y errores (Maqgo frontend)

## Producción (recordatorio)

- El bundle que sube **Vercel** tiene `import.meta.env.PROD === true` y `DEV === false`: comportamiento “real” (sin historial demo, sin trucos solo locales).
- **Backend URL:** definir `REACT_APP_BACKEND_URL` / variable que use Vite para apuntar al API en Railway, **nunca** `localhost` en el build de producción (`api.js` lo advierte en consola si detecta incoherencia).
- Mensajes de error al usuario: copy genérico seguro; `getHttpErrorMessage` prioriza `detail` del API cuando el backend ya lo humaniza.

## Toasts / notificaciones

- **Usar:** `ToastProvider` en `App.jsx` + `useToast()` desde `frontend/src/components/Toast.jsx`.
- **No montar** en paralelo el stack Radix/shadcn en `components/ui/toast*.jsx` / `hooks/use-toast.js` para la misma acción; es código legacy / plantilla sin integrar. Nuevas pantallas: solo `useToast` de `components/Toast.jsx`.

### Cuándo toast vs mensaje en pantalla

| Situación | Patrón |
|-----------|--------|
| Formulario con campos (login, registro, OTP) | Texto de error **junto al campo** o bajo el formulario; toast opcional para éxito breve. |
| Acción global (guardar disponibilidad, copiar código, admin) | **Toast** success/error/warning. |
| Flujo crítico multi-paso (reserva, pago) | Componentes en `ErrorStates.js` + CTA; no sustituir por toast genérico. |
| Recuperar contraseña | Inline (`setError`) — el usuario debe leer antes de reintentar. |

## Errores HTTP

- Centralizar copy de red/timeout/servidor con **`getHttpErrorMessage`** (`frontend/src/utils/httpErrors.js`).
- En `catch` de axios: preferir `getHttpErrorMessage(err, { fallback: '...', statusMessages: { 401: '...' } })` en lugar de `err.response?.data?.detail || '...'` repetido.

## Historial vacío

- En **build de producción** (`vite build` / Vercel), sin datos en `serviceHistory`, la lista está **siempre vacía** (empty state real). No hay flag de entorno que inyecte demo en release.
- Datos de ejemplo **solo en `npm run dev`** (local). Así se evita confundir usuarios reales aunque alguien setee variables por error en el panel de deploy.
