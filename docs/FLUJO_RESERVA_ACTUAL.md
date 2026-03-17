# Flujo de reserva cliente (actual)

> Última actualización: marzo 2025

## Regla de negocio

Primero se selecciona la maquinaria. Si se arrienda por hora, se muestran las horas (4-8 para inmediato). Si es por viaje (pluma, aljibe, tolva), se usa UrgencySelectionScreen.

---

## Flujo INMEDIATO (Inicio HOY)

### Por hora (retroexcavadora, excavadora, bulldozer, etc.)

```
ClientHome → MachinerySelection → HoursSelectionScreen (/client/hours-selection) → ServiceLocationScreen → Providers → Confirm
```

- **HoursSelectionScreen**: 4-8 horas, navega a `/client/service-location`.

### Por viaje (camiones pluma, aljibe, tolva)

```
ClientHome → MachinerySelection → UrgencySelectionScreen (/client/urgency) → ServiceLocationScreen → Providers → Confirm
```

- **UrgencySelectionScreen**: mapea urgencia a horas 4-8 automáticamente.

---

## Flujo PROGRAMADO

```
ClientHome → CalendarSelection → MachinerySelection → CalendarMultiDayScreen → ServiceLocationScreen → Providers → Confirm
```

- Maquinaria se selecciona antes del calendario.
- `reservationType: 'scheduled'` en localStorage.

---

## Rutas de retroceso (bookingFlow.js)

| Ruta | Back va a |
|------|-----------|
| /client/machinery | /client/home (o /client/calendar si programado) |
| /client/urgency | /client/machinery |
| /client/hours-selection | /client/machinery |
| /client/service-location | /client/hours-selection o /client/urgency o /client/machinery según flujo |
| /client/providers | /client/service-location |
| /client/confirm | /client/providers |

---

## Rutas obsoletas

- `/client/hours` → redirige a `/client/hours-selection`.
- `/client/reservation-data` → ya no se usa en el flujo actual.
