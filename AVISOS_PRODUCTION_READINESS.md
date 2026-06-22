# Avisos (HUB) — Production Readiness Audit

Restricciones de esta auditoría
- No implementar.
- No modificar código.
- No remover `import.meta.env.DEV`.
- No exponer Avisos en producción todavía.

Veredicto
- **NO-GO** (no cumple criterios: usa mocks, no consume datos reales, no tiene punto de entrada funcional en producción).

---

## FASE 1 — Auditoría funcional (evidencia técnica)

### 1) ¿La pantalla Avisos consume datos reales hoy?
- **No**.
- Evidencia: ambas variantes generan datos con funciones `buildMockAvisos()` / `buildMockAlerts()` y no hacen `fetch/axios` a backend.
  - `frontend/src/screens/client/AvisosHubScreen.jsx`: `buildMockAvisos()` [AvisosHubScreen.jsx:L29-L88](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/AvisosHubScreen.jsx#L29-L88) y `items = useMemo(() => buildMockAvisos(), [])` [AvisosHubScreen.jsx:L98-L103](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/AvisosHubScreen.jsx#L98-L103).
  - `frontend/src/screens/client/AvisosHubCardBasedScreen.jsx`: `buildMockAlerts()` [AvisosHubCardBasedScreen.jsx:L30-L80](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/AvisosHubCardBasedScreen.jsx#L30-L80) y `items = useMemo(() => buildMockAlerts(), [])` [AvisosHubCardBasedScreen.jsx:L82-L91](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/AvisosHubCardBasedScreen.jsx#L82-L91).
  - No hay llamadas `fetch/axios/BACKEND_URL` en estas pantallas (búsqueda sin matches).

### 2) ¿Qué fuente de datos utiliza?
- **Mock (en memoria)**: `buildMockAvisos()` y `buildMockAlerts()`.
- **Estado local (React state)** para “sin leer” y selección:
  - `mockUnread` se inicializa desde el mock y luego se modifica en memoria [AvisosHubScreen.jsx:L98-L167](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/AvisosHubScreen.jsx#L98-L167).
  - `unread` (Set) se inicializa desde mock en la variante card-based [AvisosHubCardBasedScreen.jsx:L89-L156](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/AvisosHubCardBasedScreen.jsx#L89-L156).
- **Browser APIs (solo estado de permisos)**:
  - Push permission: `window.Notification.permission` y `Notification.requestPermission()` [AvisosHubScreen.jsx:L93-L141](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/AvisosHubScreen.jsx#L93-L141) y [AvisosHubCardBasedScreen.jsx:L84-L136](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/AvisosHubCardBasedScreen.jsx#L84-L136).
- **No usa**: API real / backend / base de datos / localStorage para persistir avisos.

### 3) ¿Qué elementos siguen siendo mock?
- Lista de avisos completa (título, cuerpo, actor, timestamps, severidad).
  - Ejemplos: `Servicio confirmado`, `Operador asignado`, `Demora reportada`, etc. [AvisosHubScreen.jsx:L31-L87](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/AvisosHubScreen.jsx#L31-L87).
- Conteo “sin leer” (se deriva del mock y se marca leído solo en memoria).
  - `markAsRead()` solo muta el `Set` en estado [AvisosHubScreen.jsx:L161-L172](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/AvisosHubScreen.jsx#L161-L172).
- Detalle del aviso (modal) y el “ack” (`requiresAck`) no registra nada en backend.
  - `requiresAck` en mock y CTA “Entendido” solo cierra modal [AvisosHubScreen.jsx:L464-L496](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/AvisosHubScreen.jsx#L464-L496).

### 4) ¿Qué elementos funcionan end-to-end?
- **Ninguno de Avisos** en modo productivo end-to-end (no hay API, persistencia, ni fetch).
- Lo único “end-to-end” relacionado a push existe **fuera** del HUB:
  - Frontend tiene lógica de suscripción a push (requiere service worker + VAPID + backend): `frontend/src/utils/pushNotifications.js` [pushNotifications.js:L20-L57](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/utils/pushNotifications.js#L20-L57).
  - Backend expone `GET /api/push/vapid-public-key` y `POST /api/push/subscribe` [push.py:L16-L34](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/push.py#L16-L34).
  - Backend solo activa webpush si hay claves VAPID y feature flag `PUSH_NOTIFICATIONS_ENABLED=true` [webpush_service.py:L11-L19](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/services/webpush_service.py#L11-L19).
  - Pero el HUB actual **no llama** a esa lógica (solo pide permiso y muestra estado).

### 5) ¿Qué elementos solo existen para demostración DEV?
- Rutas del HUB:
  - `/client/avisos` y `/client/avisos-cards` solo existen en DEV por `import.meta.env.DEV` [App.jsx:L397-L398](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx#L397-L398).
- Variante alternativa de HUB (`/client/avisos-cards`) es explícitamente comparativa/DEV.
- Documento de consolidación lo declara como prototipo “hoy, solo DEV” [MAQGO_UX_FINAL_CONSOLIDADA.md:L36-L40](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L36-L40).

---

## FASE 2 — Navegación (evidencia técnica)

### 1) ¿Cómo accede hoy un cliente a Avisos?
- **Solo manualmente en DEV** visitando la ruta `/client/avisos` (no existe navegación interna).
  - Evidencia: no existe `navigate('/client/avisos')` ni links `to/href` a esa ruta (búsqueda retorna solo definición de rutas en `App.jsx`).

### 2) ¿Existe acceso en producción?
- **No**.
  - Evidencia: la ruta está protegida por `import.meta.env.DEV` [App.jsx:L397-L398](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx#L397-L398).

### 3) ¿Existe acceso documentado en UX aprobada?
- **Sí, documentado** como “abrir HUB desde estados” con CTA “Avisos” + badge no leídos.
  - Evidencia: [PRD_Hub_Avisos_Unico.md:L21-L44](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/.trae/documents/PRD_Hub_Avisos_Unico.md#L21-L44).

### 4) ¿Existe CTA funcional desde pantallas del flujo?
- Reserva Confirmada: **No** (solo textos que mencionan Avisos, sin navegación).
- Asignado: **No**.
- En Camino: **No**.
- Llegó: **No**.
- En Curso: **No**.
- Finalizado: **No**.
- Evidencia: búsqueda de `navigate(...avisos)` y links a `/client/avisos` no encuentra matches fuera de `App.jsx`.

### 5) ¿Existe riesgo de que el usuario nunca descubra Avisos?
- **Sí (alto)**.
  - No hay punto de entrada funcional en producción.
  - La UI del flujo solo menciona “Avisos” como texto, sin acceso.

---

## FASE 3 — Preparación producción

### 1) ¿Qué falta para considerar Avisos productivo?
- Reemplazar mocks por consumo de datos reales.
- Persistencia de estado “leído/no leído” y “ack” en backend.
- Contexto por servicio (filtrar por `serviceId/currentServiceId`).
- Validación de rutas/entry points en build de producción (sin depender de DEV-only).

### 2) ¿Qué dependencias siguen abiertas?
- Modelo/API de “avisos” por servicio (no existe en frontend hoy).
- Fuente de eventos (backend) y contrato de payload.
- Autenticación/permiso: qué token/rol consulta avisos.

### 3) ¿Qué datos reales faltan?
- Lista real de avisos (eventos) por servicio.
- Timestamps reales y actor real.
- Contadores “sin leer” por servicio.

### 4) ¿Qué integraciones faltan?
- Integración frontend ↔ backend para obtener avisos y registrar lectura/ack.
- (Opcional) deep-link desde un aviso hacia estado del servicio (documentado como opcional, no presente).

### 5) ¿Qué riesgos existen si se publica hoy?
- Publicar un HUB basado en mock rompe el principio “Avisos = fuente oficial de eventos” (presenta información inventada).
- Usuarios podrían tomar decisiones operacionales basadas en datos no reales.
- Inconsistencia con auditoría/legal (eventos no trazables).

---

## Criterio de aprobación (aplicación a estado actual)

Requisitos declarados
- No usa mocks.
- Consume datos reales.
- Tiene navegación aprobada.
- Tiene punto de entrada funcional.
- Funciona en build producción.
- Tiene QA básico aprobado.

Estado actual vs requisitos
- No usa mocks: **NO** (usa `buildMockAvisos/buildMockAlerts`).
- Consume datos reales: **NO**.
- Navegación aprobada (documentada): **Sí** (documentada), pero **no implementada**.
- Punto de entrada funcional: **NO**.
- Funciona en build producción: **No aplica** (rutas DEV-only).
- QA básico: **Parcial** (solo validación visual/DEV; sin E2E de avisos real).

Conclusión
- **NO-GO** (mantener DEV-only; no remover `import.meta.env.DEV`).

