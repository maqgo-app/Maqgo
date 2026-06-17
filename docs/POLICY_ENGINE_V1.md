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
- in_progress
- last_30
- finished
- rated
- cancelled_* (solo cuando aplica por rule/timer)

### Eventos oficiales (auditables, server-side)
- arrival (con `arrivalLocation.verified=true|false`)
- auto_start
- started (manual)
- cancelled_client / cancel_with_fee / cancelled_no_arrival
- incident_reported (si aplica)
- safety_stop (si aplica)
- access_denied (si aplica)
- client_entry_confirmed (si aplica)

### Derivados (no manuales)
- customer_unresponsive (derivado desde arrival verified + SLA sin entry)

## Policy Keys (valores oficiales)
- cancellation.free_window_minutes = 60
- cancellation.late_fee_percent_pre_arrival = 20%
- no_arrival.timeout_minutes = 120
- waiting.auto_start_sla_minutes = 30
- arrival.verification_radius_meters = 300
- incident.protected_window_default_minutes = 20
- dispute.ticket_window_hours = 24
- evidence.retention_days = 30

## Constitución temporal (clocks contractuales)
| Clock | Start | Pausa | Bloquea | Resetea | Trigger | Consecuencia |
|------|-------|-------|---------|---------|---------|--------------|
| no_arrival.timeout_minutes | confirmedAt; si no existe, createdAt | incident (protected window activo) | si ya hay arrivalDetectedAt | NO | status=confirmed sin arrival | cancelled_no_arrival + refund_requested |
| waiting.auto_start_sla_minutes | arrivalDetectedAt (solo si arrivalLocation.verified=true) | safety_stop activo | si client_entry_confirmed o in_progress | NO | arrival verified | auto_start → in_progress |
| cancellation.free_window_minutes | confirmedAt; si no existe, createdAt | incident (protected window activo) | si arrivalDetectedAt existe | NO | client cancel request | <60m = reembolso total; >60m = fee 20% |
| dispute.ticket_window_hours | finishedAt | N/A | N/A | NO | abrir ticket | fuera de plazo = no hold/refund automático |

## Jerarquía oficial de precedencia contractual (tick server-side)
1) safety_stop  
2) transition_consumed (idempotencia: una transición por tick)  
3) client_entry_confirmed  
4) cancelled_no_arrival (elegible)  
5) arrival verified (`arrivalLocation.verified=true`)  
6) incident_reported (solo pausa clocks sensibles)  
7) cancellation_requested (válido solo pre-arrival)  
8) access_denied (abre ventana; no infla estado principal)  
9) auto_start

## Notas contractuales operacionales
- arrival verification se determina por GPS dentro de `arrival.verification_radius_meters`.
- waiting cobrable nace solo desde arrival verified (no desde canales externos).
- access_denied cobra mínimo + waiting solo con evidencia mínima válida; abre ventana corta de resolución (10–15 min).
- Pagos: ticket/disputa económico se abre dentro de 24h desde finishedAt (server-side).
