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
- rated
- cancelled_* (solo por acción humana; no hay auto-cancel)

### Eventos oficiales (auditables, server-side)
- arrival (con `arrivalLocation.verified=true|false`)
- auto_start
- started (manual)
- cancelled_client / cancel_with_fee
- incident (si aplica)
- no_arrival_alert_120 / no_arrival_alert_180 / no_arrival_alert_240
- safety_stop (si aplica)
- access_denied (si aplica)
- client_entry_confirmed (si aplica)

### Derivados (no manuales)
- customer_unresponsive (derivado desde arrival verified + SLA sin entry)

## Policy Keys (valores oficiales)
- cancellation.free_window_minutes = 60
- cancellation.mid_window_minutes = 120
- cancellation.fee_percent_60_120 = 20%
- cancellation.fee_percent_120_plus = 40%
- no_arrival.alert_minutes = 120 / 180 / 240
- waiting.auto_start_sla_minutes = 30
- arrival.verification_radius_meters = 300
- incident.protected_window_default_minutes = 30
- incident.max_auto_count = 2
- incident.max_protected_minutes_total = 60
- dispute.ticket_window_hours = 24
- evidence.retention_days = 30

## Presencia confirmada en obra
Se considera presencia confirmada cuando existe evidencia suficiente de que la maquinaria y/o el operador llegaron al lugar de trabajo, por ejemplo:
- arrivalDetectedAt registrado.
- Cliente autoriza ingreso (client_entry_confirmed).
- auto_start.
- Servicio iniciado (started/in_progress).
- Mensajes guiados y/o interacciones posteriores coherentes que acrediten presencia física.

## Constitución temporal (clocks contractuales)
| Clock | Start | Pausa | Bloquea | Resetea | Trigger | Consecuencia |
|------|-------|-------|---------|---------|---------|--------------|
| no_arrival.alert_minutes | acceptedAt; si no existe, confirmedAt/createdAt | incident (protected window activo) | si ya hay arrivalDetectedAt | NO | status=confirmed sin arrival | avisos críticos 120/180/240; nunca auto-cancel |
| waiting.auto_start_sla_minutes | arrivalDetectedAt (solo si arrivalLocation.verified=true) | safety_stop activo | si client_entry_confirmed o in_progress | NO | arrival verified | auto_start → in_progress |
| cancellation.fee_tiers | acceptedAt; si no existe, confirmedAt/createdAt | incident (protected window activo) | si presencia confirmada | NO | client cancel request | 0–60m=0%; 60–120m=20%; +120m=40% |
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
- arrival verification se determina por GPS dentro de `arrival.verification_radius_meters`.
- waiting cobrable nace solo desde arrival verified (no desde canales externos).
- access_denied cobra mínimo + waiting solo con evidencia mínima válida; abre ventana corta de resolución (10–15 min).
- Pagos: ticket/disputa económico se abre dentro de 24h desde finishedAt (server-side).
