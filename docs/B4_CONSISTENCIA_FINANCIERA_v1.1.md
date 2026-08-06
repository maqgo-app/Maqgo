# BLOQUE B4 — CONSISTENCIA FINANCIERA v1.1
**Proyecto:** GO LIVE HARDENING · MAQGO  
**Fecha:** 2026-08-06  
**Estado:** 🟡 Aprobado para continuar (3 P1s sin verificación operacional)  
**Congelado a partir de v1.1.**

---

## 1. Estado B4 (Definition of Done)

| Campo | Valor |
|---|---|
| Estado B4 | 🟡 Aprobado para continuar |
| Hallazgos P0 | 0 |
| Hallazgos P1 | 3 (sin verificación operacional) |
| ¿Puede continuar el proyecto? | ✅ Sí |
| ¿Commit? | ✅ Sí → este archivo (commit único) |
| Recomendación GO/NO-GO B5 | ✅ GO. Certificar 3 caminos E2E. |

**P1 abiertos B4 (sin validación operacional, no bloquean hoy):**
- `P1-B4-01` No existe job periódico (cron) ejecutando `payment_consistency_engine.detect_drift_and_report`.
- `P1-B4-02` Validar en portal Transbank producción que child commerce code tiene **captura automática** habilitada (revisar configuración).
- `P1-B4-03` `payment_saga_recovery` + `payment_auto_healer` carecen de hook scheduler periódico (se invocan inline; recuperación 100% offline requiere intervención).

---

## 2. Matriz de Consistencia Financiera (10 eventos) — v1.1
**Columnas oficiales:** Evento · SR (status/paymentStatus) · Payment · PaymentIntent · Ledger EVT_* · Notification · Historial · Inv. Operacional · Resultado · **Fuente de Verdad (SoT)** · **Idempotencia (2x? / Mecanismo / Protegido?)** · **Rollback (Sí/No · Quién · Nivel)**

| # | Evento | SR (status / paymentStatus) | Payment (local) | Payment Intent | Ledger (EVT_*) | Notification (kind) | Historial | Inv. Operacional | Resultado | **Fuente de Verdad (SoT)** | **Idempotencia** | **Rollback** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | OneClick Inscripción OK | (sin SR) | — | CARD_PENDING → CARD_REGISTERED | EVT_PI_CREATED + UPDATED | — | — | — | ✅ | **OneClick `/confirm` + `payments_oneclick` doc + `oneclick_inscriptions`** | ❌ 2x. Mecanismo: `run_idempotent(scope=start-inscription)` + índice `uniq_dedupe` en inscripciones. **Resultado: ✅ SÍ PROTEGIDO.** | **Sí**. Quién: retry front `/save`. Nivel: upsert no duplica por email; si tbk_user existe, no re-llama `/start`. |
| 2 | SR Creada + Start Matching + PI init | `matching` / `validated` | — | INIT → PAYMENT_PENDING | EVT_PI_CREATED / UPDATED | — | Cliente "Creada" | isAvailable no cambia | ✅ | **ServiceRequest (id único)** + **PaymentIntent `uniq_booking_id` (índice único)** | ❌ 2x. Mecanismo: `run_idempotent(scope=create)` HTTP + `PaymentIntentService.upsert_for_client`. **Resultado: ✅ SÍ PROTEGIDO.** | **Sí** (si matching falla). Quién: `matching_service` try/except; `insert_one(service_requests)` transaccional. Nivel: SR insertada solo si pricing validado; PI fallido → warning, SR existe (B5 lo valida). |
| 3 | Offer Sent / `nueva_oferta` | `offer_sent` + `matchingAttempts[P1]=pending` | — | PAYMENT_PENDING (sin cambio) | EVT_PROVIDER_CALL_EXECUTED (mode=matching) | `nueva_oferta` (solo proveedor) | Proveedor "Nueva oferta" | isAvailable **no cambia** | ✅ | **SR `matchingAttempts[]` + dedupeKey `(sr_id, provider_id)`** | ⚠️ Múltiples olas = múltiples ofertas por SR, pero **1 sola a la vez por proveedor** (`already_offered_provider_ids_in_this_sr`). **Resultado: ✅ PROTEGIDO / proveedor.** | **Sí**. Quién: `_superseded_pending_attempts_for_winner` (en accept) o timer de expiración. Nivel: todos los pending se marcan `superseded` / `expired`. |
| 4 | Provider Accept + charging (pre-Authorize) | `charging` / `charging` + `providerId=P1` | — (0 transacciones) | PAYMENT_PENDING → PROVIDER_ACCEPTED | EVT_PROVIDER_CALL_EXECUTED (mode=accept) | `assigned` cliente | "Operador asignado" | P1: `accepted+1`, `total+1`, `isAvailable=False` | ✅ | **SR.providerId + `matchingAttempts.elemMatch.accepted` + PI PROVIDER_ACCEPTED** | ⚠️ RC accept paralelo entre 2 providers (P1 B2). Mecanismo actual: `elemMatch providerId=Pn status=pending` filtro accept, sin lock cross-provider. **Resultado: 🟡 PARCIALMENTE PROTEGIDO.** | **SÍ** (solo si Authorize falla). Quién: `revert_confirmed_offer_after_payment_failure()`. Nivel: counters restore piso 0 + isAvailable=True + providerId=null + status=matching + `start_matching` idempotente. |
| 5 | Authorize OK | `confirmed` / `charged` + paymentId + chargedAt + chargedAmount | `charged` o `authorized_pending_finalize` + auth_code + tbkBuyOrder | PROVIDER_ACCEPTED → PAYMENT_AUTHORIZED → COMPLETED | EVT_CHARGE_ATTEMPT → **EVT_CHARGE_SUCCESS** | `confirmed` (cliente + prov) | Ambos "Confirmada / Cobrada" | P1 sigue indisponible | ✅ | **Transbank authorize (rc=0 status=AUTHORIZED)** + Payment.tbkBuyOrder + **EVT_CHARGE_SUCCESS exactly-once** (ledger autoridad) | ❌ 2x. 5 capas: 1) `claim_payment_capture` lock (8 retry max) 2) `ledger_has_charge_success_for_service_request()` 3) payments.srId=charged 4) PI `uniq_booking_id` 5) HTTP Idempotency-Key. **Resultado: ✅ FULL PROTEGIDO.** | **Parcial**. `authorized_pending_finalize` → consistency engine lo detecta y pasa a charged (short-circuit). Si es reembolso full → refund endpoint. Nivel: NO deshace counters después de confirmed; si requiere cancelación → manual + refund. |
| 6 | Authorize FAIL + revert matching | `matching` / `failed` + paymentFailedAt + providerId=null | `failed` o sin doc + failedAt | ACCEPTED → PAYMENT_FAILED → PROVIDER_PENDING (restart) | EVT_CHARGE_FAILURE + DEAD_LETTER + SAGA_REPAIR_* si saga | `payment_failed` + `search_expanded` | Cliente "Pago fallido / Buscando" + Prov liberado | P1 revert counters piso0 + isAvailable=True | ✅ | **SR.paymentStatus=failed + start_matching status=matching** + Payment failedAt | ❌ 2x revert. Mecanismo: matching idempotency lock `matchingLock` + guard "already restarted". **Resultado: ✅ PROTEGIDO.** | **SÍ** (es el rollback propio de #5). Quién: `revert_confirmed_offer_after_payment_failure` + `saga_recovery` diferido. Nivel: todo limpio, counters sin negativos, provider disponible, matching restart sin dup (lock). |
| 7 | En-route / Arrival / Started / Last-30 / Entry-pending | status progresivos / `charged` mantenido | `charged` sin cambios | COMPLETED | (sin ledger) | notif correspondientes | Historial progreso | P1 indisponible | ✅ | **SR.status + arrivedAt/startedAt/entryAuthorizedAt timestamps (autoridad)** | ⚠️ Duplicado events[] array posible. Mecanismo: `push event` (type + At). **Resultado: 🟡 PROTEGIDO por ts único + type.** | **Sí**. Quién: rutas SR + timer detect. Nivel: SR status anterior + notifications cleanup. |
| 8 | Finished OK | `finished` / `charged` + finishedAt | `charged` | COMPLETED | EVT_CONSISTENCY_CHECK_RUN si engine | `finished` + `factura_lista` (si aplica) | Ambos "Finalizado" | P1 release isAvailable=True si slot vacío | ✅ | **SR.finishedAt (unset impossible después)** + timer finished heartbeat | ❌ 2x finished en SR. Mecanismo: `if finishedAt is None` + paymentStatus=charged obligatorio guard. **Resultado: ✅ PROTEGIDO.** | **Parcial**. Re-abrir finished = admin endpoint manual. Quién: Admin Support. Nivel: SR vuelve a estado anterior; payment no cambia (ya cobrado). Reembolso separado. |
| 9 | Cancelación Cliente pre-accept | `cancelled_by_client` + cancelReason/canceledAt / `validated` | — (sin transacción) | PAYMENT_PENDING → CANCELLED | EVT_PI_UPDATED (sin EVT_CHARGE) | `cancelled` notif | Ambos "Cancelado" | Todos pending → superseded. Counters **sin cambios** | ✅ | **SR.canceledAt + status=cancelled_* (autoridad única)** | ❌ 2x cancel con efecto. Mecanismo: guard `if cancel_reason already set`. **Resultado: ✅ PROTEGIDO.** | **No** (ya pre-accept; ofertas pending ya se marcan superseded dentro del cancel). |
| 10 | Refund Total post-finished | `paymentStatus=refunded` + refundAt | `refunded` | COMPLETED → REFUND | **EVT_REFUND_SUCCESS** + **EVT_CHARGE_SUCCESS reverse (asiento -)** | `refund_notification` | Ambos "Reembolsado" | P1 ya release antes → sin cambios | ✅ | **Transbank refund API rc=0 status=REFUNDED** + Payment + EVT_REFUND ledger | ❌ 2x refund. Mecanismo: ledger_has_refund_success(payment_id) antes de API + idempotency + HTTP Idempotency-Key. **Resultado: ✅ FULL PROTEGIDO.** | **No**. Refund = terminal en TBK. Si falla red → dead_letter + saga retry hasta OK. Nivel: money-back garantizado. |

---

## 3. 2 Invariantes obligatorios (verificación por fila OK)

1. **Inv. Financiera (10/10 ✅):** "No pueden existir dos representaciones distintas de la misma realidad financiera entre SR, Payment, PI, Ledger, Notification, Historial."
2. **Inv. Operacional (7/7 filas operacionales ✅):** "Nunca maquinaria comprometida + estado financiero inconsistente; nunca pago fallido + proveedor bloqueado."

---

## 4. Regla de Correlación B5 (nuevo)
Cada camino B5 (Feliz, Error, Reanudación A/B) **debe usar una única transacción raíz correlacionada**. Evidencia solo acepta si comparte **los mismos 7 IDs a lo largo de todo el flujo**:
```
service_request_id  ·  booking_id  ·  payment_id (si existe)  ·
payment_intent_id   ·  buy_order   ·  client_id                ·  provider_id
```
Ningún documento B5 puede mezclar IDs de dos ejecuciones.

---

## 5. Criterio de Cierre B5 Obligatorio (4 preguntas)
Solo si **las 4 = Sí**, el camino se considera **certificado**:
1. [ ] ¿El flujo llegó al **estado esperado** final?
2. [ ] ¿**Todas las colecciones** (SR, Payment, PI, Ledger, Notif, Historial) quedaron **consistentes**?
3. [ ] ¿Se **respetaron todas las invariantes** (financiera + operacional)?
4. [ ] ¿No quedaron **registros huérfanos** ni **duplicados**?

---

## 6. 5 Chequeos de Unicidad Obligatorios B5 (regla anterior confirmada)
```
□ 1. SR.events[]: 0 types duplicados con mismo timestamp exacto o delta <2s.
□ 2. Ledger:
     COUNT(EI charge_success  payload.sr_id = X) ≤ 1
     COUNT(EI refund_success payload.payment_id = Y) ≤ 1
□ 3. Notifications:
     dedupeKey = role:userId:sr:SRID:kind  único en colección.
□ 4. Payments por SR:
     COUNT(payments where serviceRequestId=X AND status IN (charged, authorized_pending_finalize)) = 1.
□ 5. PaymentIntent por booking:
     COUNT( payment_intents WHERE booking_id = Z ) EXACTAMENTE = 1 (ya hay índice único).
```

---

## 7. Revisión de Rendimiento B5 (no perf audit)
Verificar **degradaciones evidentes** (no tiempos absolutos). Si >1 fallo de estos por camino → no se certifica hasta corregir:
- [ ] OTP: sin timeouts 504 / wait >15s.
- [ ] OneClick Inscription start/confirm: sin TBK timeouts >25s (ya `TBK_REQUEST_TIMEOUT=25`).
- [ ] Matching: sin stalls al crear SR ni `offer_sent` demorando >10s en aparecer en feed proveedor.
- [ ] Provider Accept → charging + matching result updated: sin timeouts 5xx.
- [ ] Authorize: Transbank authorize sin delays anómalos.
- [ ] Finalización: timer finished + status transition sin demora >2min excesiva.
Objetivo: detectar bloqueos / waits anómalos, no cumplir SLA.

---

## 8. Definición Formal Go Live (6 condiciones, actualizada 2026-08-06)
MAQGO listo para producción **SÍ Y SOLO SÍ SE CUMPLEN LAS 6**:
1. [ ] Bloques A, B1, B2, B3, B4, B5, C, D, E **CERRADOS** (estado 🟢, 0 P0, evidencia).
2. [ ] Backlog P0 **VACÍO**.
3. [ ] B5 3 caminos certificados con evidencia (Feliz, Error, Reanudación A/B).
4. [ ] **0 combinaciones imposibles** de estados detectadas durante B5.
5. [ ] ✅ **Al menos UN servicio comercial completo ejecutado íntegramente en PRODUCCIÓN** utilizando infraestructura y medios de pago reales (no staging/demo/sandbox).
6. [ ] ✅ **NUEVA**: **0 registros duplicados** para un mismo evento crítico operacional/financiero en SR/Payment/PI/Ledger/Notification (validación chequeos unicidad B5).

---

## 9. Regla Estricta Metodología Congelada
A partir de B4 v1.1 **NO SE ACEPTAN NUEVOS CAMBIOS METODOLÓGICOS** salvo que una ejecución REAL de B5 demuestre insuficiencia del proceso o una regresión NO contemplada. Solo ajustes **derivados de evidencia operacional concreta**.

Fin del documento. Congelado.
