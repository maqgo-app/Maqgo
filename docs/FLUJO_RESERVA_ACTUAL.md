# Revisión del flujo de reserva cliente

## Regla de negocio
> Primero se selecciona la maquinaria. Si se arrienda por hora, se muestran las horas (4-8 para inmediato).

---

## Flujo INMEDIATO (Inicio HOY)

### Por hora (retroexcavadora, excavadora, bulldozer, etc.)
```
ClientHome → MachinerySelection → /client/hours (HoursSelection) → ???
```

**Problemas detectados:**
1. **HoursSelection** (`/client/hours`) permite 1-12 horas → Viola regla 4-8
2. **HoursSelection** al continuar navega a `/client/machinery` → Va hacia atrás en vez de adelante
3. Existe **HoursSelectionScreen** (`/client/hours-selection`) que SÍ tiene 4-8 hrs y navega a service-location

### Por viaje (camiones)
```
ClientHome → MachinerySelection → UrgencySelectionScreen → service-location ✓
```
- Corregido: UrgencySelectionScreen mapea urgencia a horas 4-8

---

## Flujo PROGRAMADO

```
ClientHome → CalendarSelection → ReservationDataScreen → service-location
```

**Problemas detectados:**
1. **Maquinaria nunca se selecciona** en flujo programado. Va directo Calendario → Datos de reserva
2. ReservationDataScreen usa `selectedMachinery` de localStorage (default: retroexcavadora)
3. Viola regla: "primero se selecciona la maquinaria"

---

## Rutas de retroceso (bookingFlow.js)

| Ruta actual | Back va a | Comentario |
|-------------|----------|------------|
| /client/urgency | /client/calendar | ❌ Para camiones inmediatos, back debería ir a /client/machinery |
| /client/reservation-data | /client/hours | Para inmediato |
| /client/reservation-data | /client/calendar-multi | Para programado (pero nadie navega a calendar-multi) |

---

## Componentes de horas

| Ruta | Componente | Horas | Navega a | Usado por |
|------|------------|-------|----------|-----------|
| /client/hours | HoursSelection | 1-12 ❌ | /client/machinery ❌ | MachinerySelection (per-hora) |
| /client/hours-selection | HoursSelectionScreen | 4-8 ✓ | /client/service-location ✓ | No usado actualmente |

---

## Resumen de correcciones necesarias

1. **MachinerySelection**: Usar `/client/hours-selection` en vez de `/client/hours` para maquinaria por hora (o corregir HoursSelection)
2. **HoursSelection**: Limitar a 4-8 hrs y navegar a service-location (o reservation-data según diseño)
3. **Flujo programado**: Insertar selección de maquinaria antes del calendario
4. **bookingFlow**: Corregir back de /client/urgency a /client/machinery
