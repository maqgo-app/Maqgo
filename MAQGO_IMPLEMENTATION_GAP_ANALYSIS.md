# MAQGO — Implementation Gap Analysis (desde UX aprobada)

Documento oficial de referencia: `MAQGO_UX_FINAL_CONSOLIDADA.md`.

Restricciones
- No rediseñar.
- No cambiar UX.
- No cambiar flujos.
- No crear nuevas ideas.
- No reabrir decisiones ya tomadas.

---

## FASE 1 — Análisis de brecha (UX vs capacidades reales)

Estados de existencia
- **Completo**: existe y se sostiene con backend/frontend reales.
- **Parcial**: existe, pero depende de mock/DEV, datos incompletos o no está integrado end-to-end.
- **No existe**: no hay soporte real hoy (o solo existe como prototipo DEV).

---

## FASE 2 — Tabla maestra

| Componente UX | Estado Actual | Brecha | Trabajo Necesario | Prioridad |
|---|---|---|---|---|
| 1) Servicio Confirmado (pantalla) | Completo | Ninguna | Ninguno | P0 |
| 2) Seguimiento del Servicio (pantalla) | Parcial | Media | Integración + QA | P0 |
| 2a) Estado: Operador asignado (interno) | Parcial | Media | Integración + QA | P0 |
| 2b) Estado: Operador en camino (interno) | Parcial | Media | Integración + Datos + QA | P0 |
| 2c) Estado: Operador llegó (interno) | Parcial | Media | Integración + QA | P0 |
| 3) Servicio en Curso (pantalla) | Completo | Baja | QA | P0 |
| 4) Servicio Finalizado (pantalla) | Completo | Baja | QA | P0 |
| 5) Valoración (pantalla) | Completo | Baja | QA | P0 |
| 6) Equipo Reservado (bloque estándar) | Parcial | Media | Datos + Integración + QA | P0 |
| 7) Nombre operador | Completo | Ninguna | Ninguno | P0 |
| 8) Calificación operador | Parcial | Media | Datos + Integración | P2 |
| 9) RUT operador | Parcial | Media | Datos + Integración | P0 |
| 10) Patente | Parcial | Media | Datos + Integración | P0 |
| 11) Tarjeta Avisos actual (en pantallas de estado) | Parcial | Media | Frontend + Integración | P0 |
| 12) Centro de Avisos completo (Hub) | No existe (prod) | Alta | Frontend + Backend + Integración + Datos + QA | P0 |
| 13) Push Notifications (envío por eventos) | Parcial | Media | Integración + QA | P0 |
| 14) Activar / Desactivar Push (desde Centro de Avisos) | No existe (prod) | Alta | Frontend + Integración + QA | P0 |
| 15) Sonidos | Completo | Baja | QA | P1 |
| 16) Vibración | Completo | Baja | QA | P1 |
| 17) Email | Parcial | Media | Backend + QA | P2 |
| 18) SMS | Parcial | Media | Backend + QA | Roadmap |
| 19) Mapa | Parcial | Media | Integración + QA | P0 |
| 20) ETA | Parcial | Media | Datos + Integración | P0 |
| 21) Footer actual (sin rediseño) | Completo | Ninguna | Ninguno | P0 |
| 22) Eliminación definitiva de Chat | Parcial | Media | Frontend + Backend + QA | P0 |

Definición de columnas
- **Brecha**
  - Ninguna: existe y está integrado.
  - Baja: existe pero requiere ajustes menores/QA.
  - Media: existe parcialmente y requiere integración/datos.
  - Alta: no existe en producción o falta backend clave.
- **Trabajo necesario**
  - Frontend: UI/UX existente aplicada sin cambiar decisiones.
  - Backend: endpoints/eventos/datos.
  - Integración: wiring end-to-end, estados, permisos.
  - Datos: asegurar campos (RUT/patente/ETA) disponibles en SR/booking.
  - QA: pruebas y regresión.

---

## FASE 3 — Detalle mínimo por elemento obligatorio (realidad actual)

Notas de trazabilidad (resumen)
- Estados backend reales del servicio: `created`, `matching`, `offer_sent`, `confirmed`, `in_progress`, `last_30`, `finished`, `rated`.
- Push backend soporta eventos: `confirmed`, `arrival`, `started`, `finished`.
- “Operador en camino” no existe como estado backend y **no se creará**. Se deriva con señales existentes.
- Centro de Avisos completo existe hoy solo como prototipo DEV/mock; en producción existe una tarjeta “Avisos” dentro de pantallas de estado.

Regla de derivación (Seguimiento del Servicio)
- **Llegó**: si `arrivalDetectedAt` existe.
- **En curso** (sale de seguimiento): si `status === "in_progress"`.
- **En camino**: si `status === "confirmed"` y existe `confirmedDepartureLocation` y `etaCommitMinutes > 0` (y/o `providerIntentAt`).
- **Asignado**: si `status === "confirmed"` y no se cumple “en camino” ni “llegó”.

---

## FASE 4 — Backlog priorizado (sin cambiar UX aprobada)

### P0 (indispensable para lanzar UX aprobada)
- Centro de Avisos completo en producción (lista + detalle + filtros).
- Entry points “Avisos” desde pantallas del flujo (manteniendo footer sin cambios).
- Badges “sin leer” y modelo de leído (mínimo viable) para el Centro de Avisos.
- Integración de eventos reales a Avisos (confirmed/arrival/started/finished) + render “últimos avisos” en pantallas.
- Push: asegurar que el cliente recibe y que deep-link abre estado correcto.
- Configuración Push en Centro de Avisos (activar/desactivar desde la pantalla).
- Datos operativos mínimos: RUT operador + patente (cuando existan), y fallback claro cuando falten.
- Mapa + ETA (al menos estáticos/por evento; sin prometer distancia restante).
- Derivación “En camino” en seguimiento (sin status backend nuevo): usar `confirmedDepartureLocation` + `etaCommitMinutes`.
- Eliminación definitiva de chat (frontend+backend) verificado en QA.

### P1 (mejora importante posterior)
- Mejorar calidad de señal “en camino” sin crear status: robustecer uso de `providerIntentAt`/confirmaciones y fallback.
- Refinamiento de sonidos/vibración por criticidad y consistencia en todos los hitos.

### P2 (optimización)
- Calificación operador (asegurar fuente de datos consistente) y mostrar “si existe”.
- Email más amplio (más eventos) con dedupe y control de frecuencia.

### Roadmap (no implementar ahora)
- Fotografía de operador.
- Tracking avanzado (tiempo real) y distancia restante.
- SMS post-pago (más allá de OTP) condicionado por criticidad y costo.
- Crear un status backend `en_route` (descartado por decisión; mantener máquina de estados actual).

---

## FASE 5 — Riesgos

Riesgos técnicos
- Centro de Avisos completo requiere backend para persistencia (leído/ack) y feed por servicio.
- Inconsistencias de datos (RUT/patente/ETA) según proveedor/operador pueden romper UI si no hay fallback.
- Push depende de permisos del navegador; la UI debe reflejar correctamente “activado/desactivado”.

Riesgos UX (sin cambiar decisiones)
- Si el Centro de Avisos no está en producción, la eliminación del chat deja un vacío de comunicación.
- Si ETA/mapa se muestran como tiempo real sin serlo, se rompe confianza; debe quedar como “estimado” cuando sea estático.

Dependencias bloqueantes
- Backend: endpoints/estructura para “Centro de Avisos” (feed por servicio, unread, seen/ack).
- Integración: deep-link de push a pantallas correctas del flujo.

Componentes mock / solo DEV hoy
- Prototipos de HUB: `AvisosHubScreen`, `AvisosHubCardBasedScreen` (DEV).
- Cualquier badge/filtros/lectura del HUB en prod.
