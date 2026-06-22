# AVISOS_SYSTEM_AUDIT

Alcance
- Inventario basado en evidencia del repositorio (rutas, componentes, navegación, footer, eventos y pantallas).
- Sin inferencias, sin propuestas.

---

## FASE 1 — Inventario real de Avisos

### 1) Rutas relacionadas con Avisos (Frontend)
- `/client/avisos` (solo DEV): [App.jsx:L395](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx#L395)
- `/client/avisos-cards` (solo DEV): [App.jsx:L396](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx#L396)
- `/client/notification` (solo DEV): [App.jsx:L397](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx#L397)

### 2) Rutas/API relacionadas con Push/Notifications (Backend)
- `GET /api/push/vapid-public-key`: [push.py:L16-L25](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/push.py#L16-L25)
- `POST /api/push/subscribe`: [push.py:L27-L38](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/push.py#L27-L38)
- `POST /api/push/unsubscribe`: [push.py:L40-L47](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/push.py#L40-L47)

### 3) Componentes React relacionados con Avisos/Notifications
- `frontend/src/screens/client/AvisosHubScreen.jsx` (HUB timeline; datos mock): [AvisosHubScreen.jsx:L29-L103](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/AvisosHubScreen.jsx#L29-L103)
- `frontend/src/screens/client/AvisosHubCardBasedScreen.jsx` (HUB cards; datos mock): [AvisosHubCardBasedScreen.jsx:L30-L91](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/AvisosHubCardBasedScreen.jsx#L30-L91)
- `frontend/src/screens/client/ServiceNotificationScreen.js` (pantalla “notification”): [ServiceNotificationScreen.js:L1-L60](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/ServiceNotificationScreen.js#L1-L60)
- `frontend/src/utils/pushNotifications.js` (suscripción push): [pushNotifications.js:L20-L57](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/utils/pushNotifications.js#L20-L57)
- `frontend/src/components/serviceState/PushPromoInlineCard.jsx` (UI permiso push): [PushPromoInlineCard.jsx:L29-L74](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/components/serviceState/PushPromoInlineCard.jsx#L29-L74)
- `frontend/src/sw.js` (service worker push y click): [sw.js:L9-L55](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/sw.js#L9-L55)

### 4) Documentos PRD/UX relacionados con Avisos (en repo)
- `MAQGO_UX_FINAL_CONSOLIDADA.md` (sección docs/avisos y matriz): [MAQGO_UX_FINAL_CONSOLIDADA.md:L20-L43](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L20-L43)
- `.trae/documents/PRD_Hub_Avisos_Unico.md`: [PRD_Hub_Avisos_Unico.md:L1-L44](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/.trae/documents/PRD_Hub_Avisos_Unico.md#L1-L44)
- `AVISOS_PRODUCTION_READINESS.md` (readiness y evidencia mock/DEV): [AVISOS_PRODUCTION_READINESS.md:L9-L11](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/AVISOS_PRODUCTION_READINESS.md#L9-L11)

### 5) Referencias a “Avisos / Notifications / Notification Center / Push / Alerts / Hub” (evidencia puntual)
- “HUB de AVISOS …” (doc): [PRD_Hub_Avisos_Unico.md:L1-L3](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/.trae/documents/PRD_Hub_Avisos_Unico.md#L1-L3)
- Rutas HUB DEV: [App.jsx:L395-L397](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx#L395-L397)
- “Centro de Avisos” (copy en pantallas):
  - Payment Result: [PaymentResultScreen.jsx:L594](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/PaymentResultScreen.jsx#L594)
  - Seguimiento (Assigned): [MachineryAssignedScreen.js:L475](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/MachineryAssignedScreen.js#L475)
  - Llegó: [ProviderArrivedScreen.js:L271](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/ProviderArrivedScreen.js#L271)
  - Confirmado (estado): [ServiceConfirmed.js:L42](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/ServiceConfirmed.js#L42)
- Push subscribe (VAPID + pushManager): [pushNotifications.js:L20-L57](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/utils/pushNotifications.js#L20-L57)
- Service worker push `showNotification` + `notificationclick`: [sw.js:L9-L55](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/sw.js#L9-L55)

---

## FASE 2 — Footer cliente (evidencia)

Botones actuales del footer cliente (orden y rutas)
- `Inicio` → navega a `'/client/home'`: [BottomNavigation.js:L153-L160](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/components/BottomNavigation.js#L153-L160) + `navigate('/client/home')`: [BottomNavigation.js:L95-L121](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/components/BottomNavigation.js#L95-L121)
- `Historial` → `'/client/history'`: [BottomNavigation.js:L160-L165](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/components/BottomNavigation.js#L160-L165)
- `Perfil` → `'/profile'`: [BottomNavigation.js:L166-L171](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/components/BottomNavigation.js#L166-L171)

¿Existe botón “Avisos / Notificaciones / Centro de Avisos” en el footer cliente?
- **NO existe** (solo `Inicio | Historial | Perfil`): [BottomNavigation.js:L124-L171](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/components/BottomNavigation.js#L124-L171)

---

## FASE 3 — Integración con pantallas de servicio (evidencia por pantalla)

### `/client/payment-result`
- ¿Menciona Avisos? **Sí** (“Centro de Avisos”): [PaymentResultScreen.jsx:L594](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/PaymentResultScreen.jsx#L594)
- ¿CTA a Avisos? **No hay evidencia** (búsqueda literal de `navigate('/client/avisos')` / `/client/avisos` no arroja matches en este archivo).
- ¿Badge? **No hay evidencia**.
- ¿Navegación? **No hay evidencia**.
- ¿Integración real (feed)? **No hay evidencia** (no hay fetch a API de avisos en esta pantalla para “últimos avisos”; solo texto).

### `/client/assigned`
- ¿Menciona Avisos? **Sí** (“Centro de Avisos”): [MachineryAssignedScreen.js:L475](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/MachineryAssignedScreen.js#L475)
- ¿CTA a Avisos? **No hay evidencia** (búsqueda literal de navegación a `/client/avisos` en el archivo no arroja matches).
- ¿Badge? **No hay evidencia**.
- ¿Navegación? **No hay evidencia**.
- ¿Integración real (feed)? **No hay evidencia**.

### `/client/provider-arrived`
- ¿Menciona Avisos? **Sí** (“Centro de Avisos”): [ProviderArrivedScreen.js:L271](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/ProviderArrivedScreen.js#L271)
- ¿CTA a Avisos? **No hay evidencia**.
- ¿Badge? **No hay evidencia**.
- ¿Navegación? **No hay evidencia**.
- ¿Integración real (feed)? **No hay evidencia**.

### `/client/service-active`
- ¿Menciona Avisos? **No hay evidencia** (búsqueda literal `Avisos`/`Centro de Avisos` sin matches en `ServiceActiveScreen.js`).
- ¿CTA a Avisos / badge / navegación / integración real? **No hay evidencia**.

### `/client/service-finished`
- ¿Menciona Avisos? **No hay evidencia** (búsqueda literal `Avisos`/`Centro de Avisos` sin matches en `ServiceFinishedScreen.jsx`).
- ¿CTA a Avisos / badge / navegación / integración real? **No hay evidencia**.

### `/client/rate`
- ¿Menciona Avisos? **No hay evidencia** (búsqueda literal `Avisos`/`Centro de Avisos` sin matches en `RateService.js`).
- ¿CTA a Avisos / badge / navegación / integración real? **No hay evidencia**.

---

## FASE 4 — Eventos del sistema (evidencia encontrada)

Nota: aquí “evento” se refiere a evidencia de un registro (`events`) y/o disparo de canal (push/whatsapp/email/sms/sonido) en código.

| Evento solicitado | ¿Existe evento registrado? | ¿Genera aviso (HUB)? | ¿Genera push? | ¿Genera email? | ¿Genera SMS/WhatsApp? | Evidencia |
|---|---|---|---|---|---|---|
| Servicio confirmado | Sí (`events` + status confirmado) | No evidencia de HUB | Sí | No evidencia | Sí (WhatsApp template) | Confirm: push+whatsapp [service_requests.py:L1004-L1014](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/service_requests.py#L1004-L1014); push payload `confirmed` [webpush_service.py:L159-L193](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/services/webpush_service.py#L159-L193) |
| Operador asignado | No evidencia en `service_requests.py` como evento explícito `assigned` | No evidencia de HUB | No evidencia | No evidencia | Existe endpoint WhatsApp “confirm-client” (proveedor acepta) | WhatsApp confirm-client [communications.py:L229-L244](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/communications.py#L229-L244) |
| Operador en camino | No evidencia en `service_requests.py` | No evidencia de HUB | No evidencia | No evidencia | Sí, endpoint WhatsApp “en-route” | [communications.py:L247-L265](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/communications.py#L247-L265) |
| Operador llegó | Sí (`events.type = arrival`) | No evidencia de HUB | Sí (`kind="arrival"`) | No evidencia | Sí (WhatsApp template `client_provider_arrived`) | Evento + push + whatsapp [service_requests.py:L1378-L1407](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/service_requests.py#L1378-L1407) |
| Servicio iniciado | Sí (`start` endpoint) | No evidencia de HUB | Sí (`kind="started"`) | No evidencia | No evidencia directa en `service_requests.py` (WhatsApp existe como endpoint separado) | Push started [service_requests.py:L1506-L1516](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/service_requests.py#L1506-L1516); WhatsApp endpoint [communications.py:L286-L300](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/communications.py#L286-L300) |
| Servicio finalizado | Sí | No evidencia de HUB | Sí (`kind="finished"`) | No evidencia | WhatsApp endpoint existe separado | Push finished [service_requests.py:L1735-L1745](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/service_requests.py#L1735-L1745); WhatsApp endpoint [communications.py:L303-L317](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/communications.py#L303-L317) |
| Pago exitoso | Sí (cobro al confirmar) | No evidencia de HUB | Indirecto (push confirmado tras cobro OK) | No evidencia | WhatsApp confirmado tras cobro OK | Cobro y push/whatsapp [service_requests.py:L983-L1014](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/service_requests.py#L983-L1014) |
| Incidentes | Sí (evento incidente) | No evidencia de HUB | Sí (`kind="incident"`/`incident_cleared`) | No evidencia | No evidencia | Push incident [service_requests.py:L1637-L1652](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/service_requests.py#L1637-L1652) y cleared [service_requests.py:L1672-L1682](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/service_requests.py#L1672-L1682) |
| Cancelaciones | Sí (eventos cancel) | No evidencia de HUB | No evidencia | No evidencia | No evidencia | Evento cancel en `events` [service_requests.py:L1160-L1220](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/service_requests.py#L1160-L1220) |

---

## FASE 5 — Sonidos (inventario)

### Archivos encontrados
- `frontend/src/utils/notificationSounds.js` (catálogo y reproducción vía Web Audio API): [notificationSounds.js:L1-L273](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/utils/notificationSounds.js#L1-L273)
- `frontend/src/utils/alertSound.js` (tonos + vibración): [alertSound.js:L20-L124](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/utils/alertSound.js#L20-L124)
- `frontend/src/utils/uberUX.js` (helper que intenta cargar `/${type}.wav`): [uberUX.js:L33-L46](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/utils/uberUX.js#L33-L46)

### Dónde se ejecutan y qué los dispara (evidencia)
- “Pantalla notification” reproduce sonido/vibración cuando hay notificación por tipo:
  - `playErrorSound()` + `vibrate(...)`: [ServiceNotificationScreen.js:L43-L50](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/ServiceNotificationScreen.js#L43-L50)
- No se encontraron assets de audio (`.wav/.mp3/.ogg/.m4a`) en `frontend/` (búsqueda de extensiones sin matches).

---

## FASE 6 — Estado actual del Centro de Avisos

Respuesta
- **B) Existe solo en DEV**

Evidencia técnica
- Las rutas del HUB están protegidas por `import.meta.env.DEV` (no expuestas en prod desde router principal): [App.jsx:L395-L397](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx#L395-L397)
- Las pantallas del HUB generan datos mock y no consumen backend:
  - `buildMockAvisos()` [AvisosHubScreen.jsx:L29-L88](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/AvisosHubScreen.jsx#L29-L88)
  - `buildMockAlerts()` [AvisosHubCardBasedScreen.jsx:L30-L80](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/AvisosHubCardBasedScreen.jsx#L30-L80)
- Documento de readiness: veredicto **NO-GO** por mocks/no consumo real: [AVISOS_PRODUCTION_READINESS.md:L9-L11](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/AVISOS_PRODUCTION_READINESS.md#L9-L11)

