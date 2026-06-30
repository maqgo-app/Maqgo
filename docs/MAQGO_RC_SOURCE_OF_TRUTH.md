# MAQGO — Fuente de verdad (Release Candidate)

Este documento reconstruye **solo lo que existe hoy** en MAQGO (código + docs dentro del repositorio). No incluye propuestas ni evaluación de brechas.

## 0) Fuentes de verdad observadas

- **Reglas de negocio (contractual internas)**: [POLICY_ENGINE_V1.md](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/docs/POLICY_ENGINE_V1.md)
- **Parámetros de negocio en código**: [business_rules.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/pricing/business_rules.py)
- **Estados/campos del servicio**: [service_request.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/models/service_request.py)
- **Eventos operacionales en servicio**: `service_requests.events[]` (se generan desde rutas y timers)
  - Rutas: [service_requests.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/service_requests.py)
  - Timers: [timer_service.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/services/timer_service.py)
- **Centro de Avisos (catálogo y deep-links)**:
  - Backend “kinds”/severidad/títulos/deepLink: [notification_items_service.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/services/notification_items_service.py)
  - Backend API: [notifications.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/notifications.py)
  - Frontend HUB UI: [AvisosHubScreen.jsx](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/AvisosHubScreen.jsx)
- **Push (WebPush)**:
  - Backend envío/payload: [webpush_service.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/services/webpush_service.py)
  - Backend endpoints: [push.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/push.py)
  - Frontend suscripción: [pushNotifications.js](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/utils/pushNotifications.js)
  - Service Worker: [sw.js](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/sw.js)
- **Restricciones de copy (anti “chat” y anti bypass en flujo)**: [noBannedCopyInServiceFlow.test.js](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/guardrails/noBannedCopyInServiceFlow.test.js)
- **Rutas del producto (navegación efectiva)**: [App.jsx](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx)
- **Definición oficial de geolocalización (RC)**: [GEOLOCATION_RC_OFFICIAL.md](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/docs/GEOLOCATION_RC_OFFICIAL.md)

## 1) Reglas de negocio vigentes (resumen literal de fuentes)

### 1.1 Cancelación / cobros

- Existen reglas de cancelación y cálculo de fee en backend: [business_rules.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/pricing/business_rules.py)
- Policy keys y resumen contractual interno están documentados en: [POLICY_ENGINE_V1.md](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/docs/POLICY_ENGINE_V1.md)

Valores de policy keys (según documento):

- `cancellation.free_window_minutes = 60`
- `cancellation.mid_window_minutes = 120`
- `cancellation.fee_percent_60_120 = 20%`
- `cancellation.fee_percent_120_plus = 40%`
  - Fuente: [POLICY_ENGINE_V1.md](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/docs/POLICY_ENGINE_V1.md)

### 1.2 No-arrival / demoras

- Existen alertas automáticas por no-llegada 120/180/240 (policy + constants):
  - Policy: [POLICY_ENGINE_V1.md](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/docs/POLICY_ENGINE_V1.md)
  - Constantes: [business_rules.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/pricing/business_rules.py)
  - Ejecución (timer): [timer_service.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/services/timer_service.py)

Valores de policy keys (según documento):

- `no_arrival.alert_minutes = 120 / 180 / 240`
  - Fuente: [POLICY_ENGINE_V1.md](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/docs/POLICY_ENGINE_V1.md)

### 1.3 Llegada verificada (radio)

- La llegada soporta verificación por radio (300m) y queda registrada como `arrivalLocation.verified`: [service_requests.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/service_requests.py)

Valor de policy key (según documento):

- `arrival.verification_radius_meters = 300`
  - Fuente: [POLICY_ENGINE_V1.md](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/docs/POLICY_ENGINE_V1.md)

### 1.4 Incidentes

- Existe una ventana protegida (pausas/limitaciones) y se registra como `activeIncident` y `incidentStats`: [service_requests.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/service_requests.py)
- Policy keys y definición de evento existen en: [POLICY_ENGINE_V1.md](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/docs/POLICY_ENGINE_V1.md)

Valores de policy keys (según documento):

- `incident.protected_window_default_minutes = 30`
- `incident.max_auto_count = 2`
- `incident.max_protected_minutes_total = 60`
  - Fuente: [POLICY_ENGINE_V1.md](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/docs/POLICY_ENGINE_V1.md)

## 2) Flujo completo del cliente (ciclo de vida)

Este flujo se expresa por **fases de negocio + estados del servicio**.

- **Crear solicitud** (pre-servicio)
- **Pago/confirmación** (post pago → servicio activo)
- **Seguimiento del servicio** (asignado/en ruta/llegó/en progreso/últimos 30/finalizado)
- **Cierre** (historial + evaluación)

Rutas principales (cliente): [App.jsx](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx)

## 3) Flujo del proveedor

- **Recibir oferta**
- **Aceptar/Rechazar**
- **Asignar operador** (cuando corresponde)
- **En ruta / llegada / ejecución**
- **Incidente (reportar/cerrar)**
- **Cierre**

Rutas principales (proveedor): [App.jsx](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx)

## 4) Flujo del operador

- **Recibir/aceptar ejecución** (si aplica por rol)
- **En ruta**
- **Llegada**
- **Inicio**
- **Incidente (reportar/cerrar)**
- **Últimos 30**
- **Cierre**

Rutas principales (operador): [App.jsx](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx)

## 5) Estados existentes del servicio

Estados y campos del modelo:

- Documento de estados oficiales: [POLICY_ENGINE_V1.md](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/docs/POLICY_ENGINE_V1.md)
- Modelo backend (`service_requests.status`): [service_request.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/models/service_request.py)

Estados oficiales declarados (según documento):

- `created`
- `matching`
- `offer_sent`
- `confirmed`
- `en_route` (alias operativo de `confirmed`)
- `in_progress`
- `last_30`
- `finished`
  - Fuente: [POLICY_ENGINE_V1.md](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/docs/POLICY_ENGINE_V1.md)

Estados adicionales declarados para término/cierre (según documento):

- `rated`
- `cancelled_*`
  - Fuente: [POLICY_ENGINE_V1.md](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/docs/POLICY_ENGINE_V1.md)

## 6) CTAs existentes (catálogo observable por código)

MAQGO usa CTAs por pantalla/estado; la estructura común existe en:

- Layout de estados y CTAs secundarios: [ServiceStateLayout.jsx](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/components/serviceState/ServiceStateLayout.jsx)
- Render de CTAs secundarios: [ServiceSecondaryActions.jsx](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/components/serviceState/ServiceSecondaryActions.jsx)

Ejemplos de CTAs de flujo (cliente):

- Confirmado → CTA para continuar a “servicio en curso”: [ServiceConfirmed.js](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/ServiceConfirmed.js)
- Llegada → CTA “Autorizar ingreso”: [ProviderArrivedScreen.js](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/ProviderArrivedScreen.js)

## 7) Eventos existentes

Eventos operacionales quedan en `service_requests.events[]`.

Fuentes:

- Rutas de servicio (acciones del usuario): [service_requests.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/service_requests.py)
- Timers (acciones del sistema): [timer_service.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/services/timer_service.py)
- Policy: eventos oficiales documentados: [POLICY_ENGINE_V1.md](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/docs/POLICY_ENGINE_V1.md)

Eventos oficiales declarados (según documento):

- `arrival`
- `auto_start`
- `started`
- `cancelled_client` / `cancel_with_fee`
- `incident`
- `no_arrival_alert_120` / `no_arrival_alert_180` / `no_arrival_alert_240`
- `safety_stop` (si aplica)
- `access_denied` (si aplica)
- `client_entry_confirmed` (si aplica)
  - Fuente: [POLICY_ENGINE_V1.md](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/docs/POLICY_ENGINE_V1.md)

## 8) Avisos existentes (Centro de Avisos)

El catálogo de avisos (kinds), severidad, títulos/copy y deep-links está definido en:

- [notification_items_service.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/services/notification_items_service.py)

Kinds existentes (según catálogo backend):

- Operación (cliente/proveedor/operador): `confirmed`, `assigned`, `en_route`, `arrival`, `entry_pending`, `entry_authorized`, `started`, `last_30`, `finished`, `incident`, `incident_cleared`, `cancelled`, `payment_failed`
- Matching/ofertas: `nueva_oferta`, `oferta_expira`, `search_expanded`
- No-arrival: `no_arrival_120`, `no_arrival_180`, `no_arrival_240`
- Cobros/facturación (definidos en catálogo): `factura_lista`, `pago_enviado`
  - Fuente: [notification_items_service.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/services/notification_items_service.py)

Deep-links declarados por kind y rol (fuente backend):

- Cliente:
  - `confirmed/assigned/en_route/incident/incident_cleared/no_arrival_*` → `/client/assigned`
  - `arrival/entry_pending/entry_authorized` → `/client/provider-arrived`
  - `started` → `/client/service-active`
  - `last_30` → `/client/in-progress`
  - `finished` → `/client/service-finished`
  - `cancelled` → `/client/history`
  - `payment_failed` → `/client/payment-result?simulate=connection_error`
- Proveedor:
  - `nueva_oferta/oferta_expira` → `/provider/request-received`
  - `assigned` → `/provider/accepted`
  - `en_route` → `/provider/en-route`
  - `arrival/entry_pending/entry_authorized` → `/provider/arrival`
  - `started` → `/provider/service-active`
  - `last_30` → `/provider/last-30`
  - `finished` → `/provider/service-finished`
  - `incident/incident_cleared` → `/provider/in-progress`
  - `cancelled` → `/provider/history`
  - `factura_lista` → `/provider/upload-invoice`
  - `pago_enviado` → `/provider/cobros`
- Operador:
  - `finished/cancelled` → `/operator/history`
  - `last_30` → `/operator/home`
  - (otros) → `/operator/home`
  - Fuente: [notification_items_service.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/services/notification_items_service.py)

La API de consulta/ack/read está definida en:

- [notifications.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/notifications.py)

La UI del HUB (polling + filtros + “Entendido” + “Ver estado”) está en:

- [AvisosHubScreen.jsx](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/AvisosHubScreen.jsx)

## 9) Push Notifications existentes

Los kinds de push que el backend construye explícitamente como “service event push” están en:

- [webpush_service.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/services/webpush_service.py)

Kinds de push “service event” soportados (según payload builder):

- `confirmed`
- `arrival`
- `started`
- `incident`
- `incident_cleared`
- `finished`
  - Fuente: [webpush_service.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/services/webpush_service.py)

Suscripción y SW:

- [push.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/push.py)
- [pushNotifications.js](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/utils/pushNotifications.js)
- [sw.js](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/sw.js)

## 10) Incidentes existentes

- Incidente activo (`activeIncident`) con `reason` + stats + ventana protegida: [service_requests.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/service_requests.py)
- Aviso asociado `kind='incident'` y copy que muestra `reason`: [notification_items_service.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/services/notification_items_service.py)

## 11) Excepciones ya definidas

Fuentes:

- Policy y eventos: [POLICY_ENGINE_V1.md](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/docs/POLICY_ENGINE_V1.md)
- Implementación de excepciones por estado/evento y sus avisos: [notification_items_service.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/services/notification_items_service.py)
- Timers de excepciones: [timer_service.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/services/timer_service.py)

## 12) Decisiones de negocio ya tomadas (evidencia en repo)

- “No chat/mensajería en flujo” como restricción de copy (guardrail): [noBannedCopyInServiceFlow.test.js](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/guardrails/noBannedCopyInServiceFlow.test.js)
- Centro de Avisos como bitácora/timeline con CTA “Entendido” y deepLink: [AvisosHubScreen.jsx](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/AvisosHubScreen.jsx) + [PRD_Hub_Avisos_Unico.md](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/.trae/documents/PRD_Hub_Avisos_Unico.md)

Decisiones contractuales explícitas en policy doc:

- Backend policy es autoridad contractual/económica; frontend no define clocks: [POLICY_ENGINE_V1.md](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/docs/POLICY_ENGINE_V1.md)
- `finished` se genera exclusivamente de forma automática; ningún usuario finaliza manualmente; `finish` es override admin auditado: [POLICY_ENGINE_V1.md](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/docs/POLICY_ENGINE_V1.md)
- No existe auto-cancel; `cancelled_*` solo por acción humana: [POLICY_ENGINE_V1.md](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/docs/POLICY_ENGINE_V1.md)

## 13) Funcionalidades descartadas explícitamente (evidencia en repo)

- Chat por servicio y chatbot fueron eliminados (evidencia en historial git) y `/chat/:serviceId` quedó como redirect: [LegacyChatRedirectScreen.jsx](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/LegacyChatRedirectScreen.jsx)

## 14) Restricciones arquitectónicas vigentes

- Paradigma basado en eventos/estados con comunicación automática (Avisos/push) y sin chat en el flujo (guardrails): [noBannedCopyInServiceFlow.test.js](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/guardrails/noBannedCopyInServiceFlow.test.js)
- Centro de Avisos usa `deepLink` y `ackRequired`/`actionRequired` como mecanismo de guiado: [notification_items_service.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/services/notification_items_service.py)
- Permisos/roles y scopes centralizados: [policy.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/security/policy.py)
