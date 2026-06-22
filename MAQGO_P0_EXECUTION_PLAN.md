# MAQGO — P0 Execution Plan (arquitectura congelada)

Documentos fuente
- `MAQGO_UX_FINAL_CONSOLIDADA.md`
- `MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md`

Decisiones cerradas (no reabrir)
- No existe chat.
- Avisos es el sistema oficial de comunicación.
- No crear status backend `en_route`.
- “Operador en camino” se deriva con señales existentes.
- Se mantiene la máquina de estados actual.
- Se mantiene el footer actual.
- Se mantiene el flujo UX aprobado.

---

## FASE 1 — P0 detallado (por elemento)

> P0 = indispensable para lanzar UX aprobada.

### P0-01 — Centro de Avisos completo en producción (lista + detalle + filtros)
- Qué existe hoy
  - Tarjeta de avisos dentro del layout de estado: `ServiceAlertsCard`.
  - Prototipos de HUB solo DEV (mock): `AvisosHubScreen`, `AvisosHubCardBasedScreen`.
- Qué falta
  - Pantalla HUB en producción (misma navegación/fuente aprobada) con: agrupación por fecha (Hoy/Anteriores), filtros (Todos/Sin leer/Críticos), detalle de aviso, leído/no leído.
  - Persistencia de leído/ack por servicio.
- Archivos afectados (frontend)
  - `frontend/src/components/serviceState/ServiceAlertsCard.jsx`
  - `frontend/src/components/serviceState/ServiceStateLayout.jsx`
  - (base HUB) `frontend/src/screens/client/AvisosHubScreen.jsx` / `AvisosHubCardBasedScreen.jsx` (pasar de mock a real)
  - `frontend/src/App.jsx` (ruta de HUB en producción)
- Backend afectado
  - Nuevos endpoints y almacenamiento para “avisos por servicio” + `unread` + `seen/ack`.
  - Fuente de eventos: servicio (`confirmed`, `arrival`, `started`, `finished`) y eventos/incident cuando existan.
- Dependencias
  - P0-04 (integración de eventos a avisos).
  - P0-07 (datos mínimos para display consistente).
- Riesgo
  - Alto: sin HUB en producción, no hay reemplazo completo del chat.

### P0-02 — Entry points “Avisos” desde pantallas del flujo (sin tocar footer)
- Qué existe hoy
  - Layout de pantallas de estado ya incluye tarjeta de avisos.
- Qué falta
  - Acceso claro al HUB desde las pantallas de estado (ej.: CTA en tarjeta o link consistente).
- Archivos afectados (frontend)
  - `frontend/src/components/serviceState/ServiceAlertsCard.jsx`
  - `frontend/src/components/serviceState/ServiceStateLayout.jsx`
  - Pantallas de estado cliente (para asegurar consistencia):
    - `frontend/src/screens/client/ServiceConfirmed.js`
    - `frontend/src/screens/client/MachineryAssignedScreen.js`
    - `frontend/src/screens/client/ProviderArrivedScreen.js`
    - `frontend/src/screens/client/ServiceActiveScreen.js`
    - `frontend/src/screens/client/ServiceFinishedScreen.jsx`
- Backend afectado
  - Ninguno (salvo que el HUB requiera tokens/IDs para navegar).
- Dependencias
  - P0-01 (HUB en producción).
- Riesgo
  - Medio: si el cliente no encuentra Avisos, se pierde el reemplazo práctico del chat.

### P0-03 — Badges “sin leer” + modelo de leído (MVP)
- Qué existe hoy
  - Prototipos mock incluyen “sin leer”; producción no.
- Qué falta
  - Estado `unreadCount` por servicio.
  - Marcar como leído al abrir detalle.
  - Ack explícito para avisos críticos (cuando aplique).
- Archivos afectados (frontend)
  - HUB (pantalla) y tarjeta `ServiceAlertsCard`.
- Backend afectado
  - Modelo de “estado de lectura” por usuario+servicio+aviso.
- Dependencias
  - P0-01.
- Riesgo
  - Medio: sin no-leídos, baja efectividad de avisos y percepción de control.

### P0-04 — Integración de eventos reales a Avisos + “Últimos avisos” en pantallas
- Qué existe hoy
  - Backend push mapea eventos: `confirmed`, `arrival`, `started`, `finished`.
  - UI actual muestra mensajes en tarjeta, pero no desde feed real.
- Qué falta
  - Feed de avisos por servicio en backend.
  - Normalizar “últimos avisos” a partir del feed (no solo strings en pantallas).
- Archivos afectados (frontend)
  - `ServiceAlertsCard` + pantallas de estado para consumir feed.
- Backend afectado
  - Persistir avisos derivados de eventos.
  - Endpoint: listar avisos por servicio, con paginación mínima.
- Dependencias
  - P0-01, P0-03.
- Riesgo
  - Alto: sin feed real, “Avisos” queda como copy estático y no reemplaza chat.

### P0-05 — Push: asegurar recepción + deep-link correcto
- Qué existe hoy
  - Backend webpush y endpoints `/api/push/*`.
  - Frontend tiene lógica de permiso/suscripción.
  - Backend ya define URLs para `confirmed/arrival/started/finished`.
- Qué falta
  - Confirmar suscripción robusta (casos: iOS/Android, permisos denegados).
  - Validación de deep-link para abrir pantalla correcta.
- Archivos afectados
  - Frontend: `frontend/src/utils/pushNotifications.js`
  - Backend: `backend/services/webpush_service.py`, `backend/routes/push.py`
- Dependencias
  - P0-06 (UI on/off dentro del HUB).
- Riesgo
  - Medio–Alto: sin push confiable, el cliente pierde notificaciones fuera de la app.

### P0-06 — Configuración Push ON/OFF dentro del Centro de Avisos
- Qué existe hoy
  - Funciones de request/subscribe en frontend.
- Qué falta
  - Bloque visible en el HUB que refleje: “Push activadas / desactivadas”, con acción.
  - Persistencia de preferencia (si aplica) sin romper permisos del navegador.
- Archivos afectados
  - Frontend: HUB screen + `pushNotifications.js`.
- Backend afectado
  - Opcional: almacenar preferencia del usuario (si no se usa solo permiso del navegador).
- Dependencias
  - P0-01.
- Riesgo
  - Medio: sin control desde la pantalla, soporte y UX se degradan.

### P0-07 — Datos operativos mínimos: RUT + Patente + fallback
- Qué existe hoy
  - Campos existen en backend (`operatorRut`, `licensePlate`) pero no siempre llegan/están completos.
  - UI los muestra si están disponibles.
- Qué falta
  - Garantizar que payload del servicio (SR/booking) incluya esos campos cuando correspondan.
  - Fallback UX cuando falten (ej.: “Disponible al confirmar ingreso”).
- Archivos afectados
  - Frontend: `providerDisplay.js` y pantallas de estado.
  - Backend: payload de `GET /service-requests/{id}`.
- Dependencias
  - P0-02 y P0-04 (para consistencia en avisos/estado).
- Riesgo
  - Medio: afecta control de acceso en obra.

### P0-08 — Mapa + ETA (estático/por evento, sin prometer tiempo real)
- Qué existe hoy
  - `OnTheWayMap` en frontend.
  - Backend ya guarda `confirmedDepartureLocation` y `etaCommitMinutes` (intent) y adjunta aprox location.
- Qué falta
  - Integración consistente de ETA desde SR (`etaCommitMinutes`).
  - Claridad de “estimado” (si no es tiempo real).
- Archivos afectados
  - Frontend: `OnTheWayMap.jsx`, screens de seguimiento.
  - Backend: `GET /service-requests/{id}` para exponer campos necesarios.
- Dependencias
  - P0-09 (derivación en camino usa ETA + departure location).
- Riesgo
  - Medio: si se percibe tiempo real sin serlo, se rompe confianza.

### P0-09 — Derivación “Asignado / En camino / Llegó” en Seguimiento (sin status nuevo)
- Qué existe hoy
  - Estados backend: `confirmed`, `in_progress`.
  - Campo `arrivalDetectedAt`.
  - Campos `confirmedDepartureLocation`, `etaCommitMinutes`, `providerIntentAt`.
- Qué falta
  - Unificar la derivación en un único lugar (helper) y que todas las pantallas de seguimiento la usen.
- Regla (obligatoria)
  - Llegó: `arrivalDetectedAt` existe.
  - En curso: `status === "in_progress"` (sale de seguimiento).
  - En camino: `status === "confirmed"` y `confirmedDepartureLocation` existe y `etaCommitMinutes > 0` (y/o `providerIntentAt`).
  - Asignado: `status === "confirmed"` y no se cumple lo anterior.
- Archivos afectados
  - Frontend: pantallas de seguimiento + layout.
  - Backend: ninguno (solo asegurar campos en payload).
- Dependencias
  - P0-07, P0-08.
- Riesgo
  - Medio: si faltan campos, el estado puede caer a “asignado” aun estando “en camino”.

### P0-10 — Eliminación definitiva de Chat (frontend+backend) + QA
- Qué existe hoy
  - Redirección legacy desde `/chat/:serviceId`.
  - Eliminación parcial del banner/puntos de UI.
- Qué falta
  - Confirmar que no hay entrada a “chat real” en UI, rutas, endpoints, botones.
  - QA de regresión end-to-end.
- Archivos afectados
  - Frontend: `LegacyChatRedirectScreen.jsx`, rutas en `App.jsx`, cualquier UI que linkee a chat.
  - Backend: endpoints de mensajería si existieran en despliegue (validación).
- Dependencias
  - P0-01 (para reemplazo completo de comunicación).
- Riesgo
  - Alto: si queda un rastro funcional, contradice decisiones cerradas.

---

## FASE 2 — Orden de implementación (secuencia recomendada)

1) **P0-07 Datos operativos mínimos (RUT/Patente + fallbacks)**
2) **P0-08 Mapa + ETA (normalizar `etaCommitMinutes` + `confirmedDepartureLocation`)**
3) **P0-09 Derivación estados seguimiento (helper + uso consistente)**
4) **P0-04 Feed de avisos (backend) + “Últimos avisos” (frontend)**
5) **P0-01 Centro de Avisos en producción (pantalla HUB real)**
6) **P0-03 Unread/ack (modelo leído MVP) + badges**
7) **P0-02 Entry points a Avisos desde pantallas**
8) **P0-05 Push end-to-end (suscripción + deep-links)**
9) **P0-06 Push ON/OFF dentro del HUB**
10) **P0-10 Eliminación definitiva de chat + QA**

Razonamiento técnico del orden
- Primero se asegura **datos/estado** (RUT/patente/ETA/derivación) para que todo lo demás (avisos, push, hub) se base en señales reales.
- Luego se construye **feed de avisos** y el **HUB**.
- Al final se cierra el loop con **push** y QA/regresión, y se valida eliminación de chat.

---

## FASE 3 — Validación (criterios, pruebas, evidencia)

### P0-01 Centro de Avisos completo en producción
- Criterio de aceptación
  - Existe ruta de HUB accesible desde el flujo sin cambiar footer.
  - Muestra: Hoy/Anteriores, filtros, detalle, leído/no leído.
- Cómo se prueba
  - QA manual + pruebas en mobile web.
  - Sembrar eventos y verificar orden/agrupación.
- Evidencia
  - Capturas fullPage por filtro + video corto de navegación a detalle.

### P0-02 Entry points a Avisos
- Criterio de aceptación
  - Desde cada pantalla de estado se puede abrir el HUB.
- Cómo se prueba
  - Smoke test por ruta: confirmed/seguimiento/en curso/finalizado.
- Evidencia
  - Checklist QA con capturas por pantalla.

### P0-03 Badges sin leer + leído MVP
- Criterio de aceptación
  - UnreadCount cambia al abrir avisos.
  - Aviso crítico requiere ack.
- Cómo se prueba
  - Crear 2 avisos (1 crítico) y validar lecturas.
- Evidencia
  - Captura antes/después del contador y del aviso crítico.

### P0-04 Feed real de avisos + “Últimos avisos”
- Criterio de aceptación
  - Los últimos avisos en pantallas vienen del feed, no de strings hardcode.
- Cómo se prueba
  - Forzar eventos `confirmed/arrival/started/finished` y validar que aparecen.
- Evidencia
  - Log de eventos + captura en pantalla por cada hito.

### P0-05 Push end-to-end
- Criterio de aceptación
  - Con permisos concedidos, se recibe push en `confirmed/arrival/started/finished`.
  - Tap del push abre la pantalla correcta.
- Cómo se prueba
  - Mobile browser + push subscription + disparar evento backend.
- Evidencia
  - Video de pantalla con recepción + apertura.

### P0-06 Push ON/OFF en HUB
- Criterio de aceptación
  - Estado refleja permiso (activado/desactivado) y permite acción.
- Cómo se prueba
  - Probar permiso denegado → UI muestra desactivado.
  - Probar permiso concedido → UI muestra activado.
- Evidencia
  - Capturas de ambos escenarios.

### P0-07 Datos mínimos (RUT/Patente)
- Criterio de aceptación
  - En seguimiento, cuando el backend tiene RUT/patente, se muestran.
  - Si faltan, se muestra fallback definido (sin romper layout).
- Cómo se prueba
  - Servicios con/sin esos campos.
- Evidencia
  - Capturas A/B.

### P0-08 Mapa + ETA
- Criterio de aceptación
  - ETA usa `etaCommitMinutes` cuando existe.
  - Mapa no promete tiempo real si no lo es.
- Cómo se prueba
  - Servicio con intent (eta+departure location) vs sin intent.
- Evidencia
  - Capturas mostrando ETA “estimada” y datos fuente.

### P0-09 Derivación estados de seguimiento
- Criterio de aceptación
  - Con `status=confirmed` sin intent → estado “Asignado”.
  - Con `status=confirmed` + `etaCommitMinutes` + `confirmedDepartureLocation` → “En camino”.
  - Con `arrivalDetectedAt` → “Llegó”.
- Cómo se prueba
  - Tests unitarios del helper + QA por fixtures.
- Evidencia
  - Resultado de tests + capturas por estado.

### P0-10 Eliminación definitiva de chat
- Criterio de aceptación
  - No existe UI de chat, no hay burbujas, no hay mensajería libre.
  - `/chat/:serviceId` solo redirige a seguimiento.
- Cómo se prueba
  - Grep en repo + smoke test navegación + QA manual.
- Evidencia
  - Reporte de búsqueda + capturas de rutas.

