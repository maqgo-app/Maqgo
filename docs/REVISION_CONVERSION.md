# Revisión de conversión — MAQGO

**Fecha:** Marzo 2025  
**Última actualización:** Marzo 2026 — Mejoras de conversión implementadas

---

## 1. Resumen ejecutivo

La app tiene **tracking de abandono** y **recordatorios** implementados. Tras las mejoras de marzo 2026, el funnel está **completamente instrumentado** y el backend persiste en **MongoDB**. No existe aún un dashboard de conversión ni métricas por paso.

---

## 2. Funnel de conversión — Cliente

### 2.1 Flujo ideal (reserva inmediata por hora)

| Paso | Pantalla | Ruta | Tracking actual |
|------|----------|------|-----------------|
| 0 | Welcome | `/` | ❌ No |
| 1 | ClientHome | `/client/home` | ❌ No |
| 2 | MachinerySelection | `/client/machinery` | ✅ Sí |
| 3 | HoursSelectionScreen | `/client/hours-selection` | ✅ Sí |
| 4 | ServiceLocationScreen | `/client/service-location` | ✅ Sí |
| 5 | ProviderOptionsScreen | `/client/providers` | ✅ Sí |
| 6 | ConfirmServiceScreen | `/client/confirm` | ✅ Sí |
| 7 | BillingDataScreen / CardPaymentScreen | `/client/billing`, `/client/card` | ✅ Sí |
| 8 | PaymentResultScreen | `/client/payment-result` | ✅ Sí (clearBookingProgress) |

### 2.2 Flujo alternativo (camiones / por viaje)

| Paso | Pantalla | Tracking |
|------|----------|----------|
| 2 | MachinerySelection | ✅ Sí |
| 3 | UrgencySelectionScreen | ✅ Sí |
| 4+ | Igual que arriba | — |

### 2.3 Flujo programado

| Paso | Pantalla | Tracking |
|------|----------|----------|
| 2 | CalendarSelection | ✅ Sí |
| 3 | CalendarMultiDayScreen | ✅ Sí |
| 4 | ServiceLocationScreen (reservation-data) | ✅ Sí |
| 5+ | Igual que arriba | — |

---

## 3. Lo que sí está implementado

### 3.1 Abandonment tracker (`abandonmentTracker.js`)

- **saveBookingProgress(step, data)** — Guarda en `localStorage` y envía a `/api/abandonment/track`
- **clearBookingProgress()** — Limpia `localStorage` y envía a `/api/abandonment/complete`
- **checkAbandonedBooking()** — Detecta si hay reserva abandonada (5 min–24 h)
- **Requiere `userId`** — Si el usuario no está logueado, no se envía al backend

### 3.2 Backend (`abandonment.py`)

- **POST /track** — Recibe progreso, persiste en MongoDB, programa recordatorios
- **POST /complete** — Marca como completado en MongoDB, cancela recordatorios
- **Recordatorios:** 30 min y 24 h por WhatsApp (si Twilio configurado) y email (log)
- **Storage:** Colección `abandonment_tracking` en MongoDB — **persiste tras reinicio**

### 3.3 Banner "¿Continuar donde quedaste?"

- **WelcomeScreen:** `abandonedBooking?.data?.machinery` para mostrarlo solo si hay maquinaria seleccionada
- **ClientHome:** Modal con `clientBookingStep` y `selectedMachinery` si hay reserva en progreso

### 3.4 Objetivos de conversión (ASISTENTE_MAQGO_OBJETIVO.md)

- Cliente: registrarse, completar reservas, reducir abandono
- Proveedor: registrarse, agregar máquinas, completar onboarding
- Operador: unirse con código sin fricción

---

## 4. Gaps identificados

### 4.1 ~~Tracking incompleto~~ ✅ Resuelto (Marzo 2026)

Todos los pasos del funnel (machinery, hours, location, providers, confirm, payment, calendar) llaman `saveBookingProgress`.

### 4.2 ~~clearBookingProgress no se usa~~ ✅ Resuelto

- **PaymentResultScreen** ahora llama `clearBookingProgress()` cuando el pago es exitoso.

### 4.3 Usuarios no logueados (pendiente)

- `trackAbandonmentRisk` solo envía si `userId` existe
- Usuarios que llegan antes de registrarse no se trackean en backend

### 4.4 ~~Persistencia del backend~~ ✅ Resuelto

- Tracking persistido en MongoDB (colección `abandonment_tracking`)
- Índice único en `user_id` para consultas rápidas

### 4.5 ~~Sin métricas de conversión~~ ✅ Parcialmente resuelto (MVP)

- **Endpoint:** `GET /api/admin/reports/funnel?days=7` — métricas por paso (requiere auth admin)
- Dashboard visual: omitido en MVP para mantener simplicidad

---

## 5. Recomendaciones

### 5.1 Prioridad alta

1. ~~**Llamar saveBookingProgress en todos los pasos del funnel**~~ ✅ Implementado
2. ~~**Llamar clearBookingProgress en PaymentResultScreen**~~ ✅ Implementado
3. **Llamar clearBookingProgress en cancelaciones** (si el usuario cancela explícitamente en algún flujo)

### 5.2 Prioridad media

4. ~~**Persistir abandonment en MongoDB**~~ ✅ Implementado

5. **Tracking de usuarios anónimos** (localStorage + sessionId) para medir funnel pre-registro

6. ~~**Endpoint de métricas de funnel**~~ ✅ Implementado (`GET /api/admin/reports/funnel?days=7`)

### 5.3 Prioridad baja

7. **Integrar analytics** (Google Analytics, Mixpanel, etc.) para eventos clave:
   - `booking_started`, `booking_step_completed`, `booking_abandoned`, `payment_completed`

8. **A/B testing** en CTAs críticos (Welcome, ClientHome)

---

## 6. Checklist de implementación

- [x] saveBookingProgress en MachinerySelection
- [x] saveBookingProgress en HoursSelectionScreen
- [x] saveBookingProgress en ConfirmServiceScreen
- [x] saveBookingProgress en CardPaymentScreen y BillingDataScreen
- [x] saveBookingProgress en flujo programado (CalendarSelection, CalendarMultiDayScreen)
- [x] clearBookingProgress en PaymentResultScreen (éxito)
- [x] clearBookingProgress en flujos de cancelación (ClientHome "Nuevo arriendo")
- [x] Persistencia de abandonment en MongoDB

---

## 7. Referencias

- `frontend/src/utils/abandonmentTracker.js`
- `backend/routes/abandonment.py`
- `ASISTENTE_MAQGO_OBJETIVO.md`
- `docs/FLUJO_RESERVA_ACTUAL.md`
