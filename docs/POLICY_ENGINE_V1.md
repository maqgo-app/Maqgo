# Policy Engine v1.0 (MAQGO) — Backend manda
> Última actualización: 2026-06-03

## Principios
- Backend Policy Engine = autoridad contractual y económica final.
- Timers ejecutan policy backend; no inventan reglas.
- Frontend solo representa UX/orquesta; no define clocks ni consecuencias económicas.
- Canales externos no son contractuales.
- Solo timestamps server-side tienen autoridad contractual.

## Modelo mínimo
### Estados oficiales (state machine principal)
- created
- matching
- offer_sent
- confirmed
- en_route (alias operativo de confirmed; no cambia política económica)
- in_progress
- last_30
- finished

## Término del servicio (oficial)
- `last_30` se genera automáticamente 30 minutos antes de `endTime`.
- `finished` se genera exclusivamente de forma automática cuando se cumple `endTime`.
- Ningún usuario finaliza manualmente un servicio.
- `PUT /service-requests/{id}/finish` se reserva solo como override admin auditado.
- rated
- cancelled_* (solo por acción humana; no hay auto-cancel)

### Eventos oficiales (auditables, server-side)
- arrival (con `arrivalLocation.verified=true|false`)
- auto_start
- started (manual)
- cancelled_client / cancel_with_fee
- incident (si aplica)
- late_limit_4h
- safety_stop (si aplica)
- access_denied (si aplica)
- client_entry_confirmed (si aplica)

### Derivados (no manuales)
- customer_unresponsive (derivado desde arrival verified + SLA sin entry)

## Policy Keys (valores oficiales)
- cancellation.scheduled.more_than_48h_percent = 0%
- cancellation.scheduled.between_48h_24h_percent = 10%
- cancellation.scheduled.less_or_equal_24h_percent = 20%
- cancellation.today.pre_accept_percent = 0%
- cancellation.today.post_accept_percent = 20%
- cancellation.today.max_absolute_delay_hours = 4
- cancellation.today.max_delay_not_affected_by_new_eta = true
- waiting.auto_start_sla_minutes = 30
- arrival.verification_radius_meters = 300
- incident.protected_window_default_minutes = 30
- incident.max_auto_count = 2
- incident.max_protected_minutes_total = 60
- dispute.ticket_window_hours = 24
- evidence.retention_days = 30

## Presencia confirmada en obra
Se considera presencia confirmada cuando existe evidencia suficiente de que la maquinaria y/o el operador llegaron al lugar de trabajo, por ejemplo:
- arrivalDetectedAt registrado con llegada verificada (`arrivalLocation.verified=true`).
- Cliente autoriza ingreso (client_entry_confirmed).
- auto_start.
- Servicio iniciado (started/in_progress).
- Mensajes guiados y/o interacciones posteriores coherentes que acrediten presencia física.

### Arrival manual
`arrivalDetectedAt` con `arrivalLocation.verified=false` no constituye presencia confirmada por sí solo.

### Auto-start
Auto-start solo puede ejecutarse cuando existe llegada verificada (`arrivalLocation.verified=true`).

## Constitución temporal (clocks contractuales)
| Clock | Start | Pausa | Bloquea | Resetea | Trigger | Consecuencia |
|------|-------|-------|---------|---------|---------|--------------|
| late_limit_4h | hora comprometida (ETA confirmada + minutos de compromiso; fallback confirmedAt/acceptedAt/createdAt) | N/A | si ya hay llegada verificada o servicio iniciado | NO | reserva para hoy, status=confirmed/en_route, sin llegada verificada | aviso “Demora crítica”; cliente puede cancelar sin costo; MAQGO puede intentar reasignar |
| waiting.auto_start_sla_minutes | arrivalDetectedAt (solo si arrivalLocation.verified=true) | safety_stop activo | si client_entry_confirmed o in_progress | NO | arrival verified | auto_start → in_progress |
| cancellation.fee | N/A | N/A | llegada verificada o servicio iniciado | N/A | client cancel request | Programada: >48h=0% / 48–24h=10% / ≤24h=20% / llegada verificada=100% / iniciado=100%. Hoy: pre-aceptación=0% / post-aceptación=20% / llegada verificada=100% / iniciado=100% (si supera 4h atraso absoluto: 0%) |
| dispute.ticket_window_hours | finishedAt | N/A | N/A | NO | abrir ticket | fuera de plazo = no hold/refund automático |

## Jerarquía oficial de precedencia contractual (tick server-side)
1) safety_stop  
2) transition_consumed (idempotencia: una transición por tick)  
3) client_entry_confirmed  
4) arrival verified (`arrivalLocation.verified=true`)  
5) incident (solo pausa clocks sensibles)  
6) cancellation_requested (válido solo pre-presencia confirmada)  
7) access_denied (abre ventana; no infla estado principal)  
8) auto_start

## Notas contractuales operacionales
- arrival verification se determina por coordenadas disponibles (GPS o telemetría) dentro de `arrival.verification_radius_meters`; si no hay coordenadas, la llegada puede registrarse como `source=manual` (y queda registrada como `arrivalLocation.verified=true`).
- waiting cobrable nace solo desde arrival verified (no desde canales externos).
- access_denied cobra mínimo + waiting solo con evidencia mínima válida; abre ventana corta de resolución (10–15 min).
- Pagos: ticket/disputa económico se abre dentro de 24h desde finishedAt (server-side).
