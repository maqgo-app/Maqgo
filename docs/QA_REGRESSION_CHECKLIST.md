# MAQGO – Checklist de Regresión QA

**Objetivo:** Ejecutar este checklist ANTES de cada merge/deploy para evitar que correcciones introduzcan regresiones.

**Cuándo usar:** Después de cualquier cambio en frontend, backend o flujos de negocio.

---

## 1. Pre-requisitos

- [ ] Backend corriendo (ej. `http://localhost:8000`)
- [ ] Frontend corriendo (ej. `http://localhost:5173`)
- [ ] `npm run build` del frontend pasa sin errores
- [ ] No hay imports rotos: `HoursSelection`, `ReservationDataScreen`, `RequestReceived`, `RateClientScreen` no deben importarse en App.jsx (rutas usan Navigate o RequestReceivedScreen)

---

## 2. Tests automatizados (ejecutar primero)

```bash
# Suite completa (incluye TODAS las maquinarias)
./scripts/run_qa.sh

# O manualmente:
python -m pytest tests/test_pricing_unit.py tests/test_all_machinery_qa.py -v
REACT_APP_BACKEND_URL=http://localhost:8002 python -m pytest tests/test_pricing_api.py -v
cd backend && bash test_oneclick.sh
```

---

## 3. Flujo Cliente – Arriendo Inmediato (por hora)

**Maquinaria:** Retroexcavadora (o cualquiera por hora)

| Paso | Pantalla | Verificar |
|------|----------|-----------|
| 1 | Welcome | CTAs visibles, "Arriendo · En horas, no días" |
| 2 | ClientHome | "Arrendar maquinaria", "En horas, no días. Paga solo al confirmar." |
| 3 | ClientHome → Arriendo inmediato | Navega a MachinerySelection |
| 4 | MachinerySelection | Lista de maquinarias con descripción mínima por tipo |
| 4b | MachinerySelection | **Selección múltiple:** elegir una, luego otra (ej. Retro + Motoniveladora); ambas quedan con check; botón muestra "Ver opciones (2 seleccionadas)" |
| 5 | HoursSelectionScreen | Horas 4–8, seleccionar 4 |
| 6 | ServiceLocationScreen | Dirección + Comuna obligatorios, validación comuna |
| 7 | ProviderOptionsScreen | Loading spinner, luego 5 proveedores con precios |
| 8 | ConfirmServiceScreen | **Desglose:** "Servicio (4h)" con monto correcto, NO "Valor viaje" |
| 9 | ConfirmServiceScreen | Total = Subtotal + Tarifa MAQGO, matemática correcta |
| 10 | ConfirmServiceScreen | Botón "Enviar solicitud" funciona |
| 11 | Billing/Card | Flujo continúa sin errores |

---

## 4. Flujo Cliente – Arriendo Inmediato (por viaje)

**Maquinaria:** Camión Tolva, Camión Pluma o Camión Aljibe

| Paso | Pantalla | Verificar |
|------|----------|-----------|
| 1 | MachinerySelection | Seleccionar Camión Tolva |
| 2 | HoursSelectionScreen | Horas 4–8 (ventana de disponibilidad) |
| 3 | ConfirmServiceScreen | **Desglose:** "Valor viaje" (NO "Servicio (4h)") |
| 4 | ConfirmServiceScreen | Monto "Valor viaje" = precio base del viaje (NO precio × horas) |
| 5 | ConfirmServiceScreen | Descripción: "Valor viaje · Inicio hoy" (NO "4 horas · Inicio hoy") |
| 6 | ConfirmServiceScreen | Subtotal + Alta demanda + Tarifa = Total correcto |

---

## 5. Flujo Cliente – Arriendo Programado

| Paso | Pantalla | Verificar |
|------|----------|-----------|
| 1 | ClientHome → Programar arriendo | Navega a Calendar |
| 2 | CalendarSelection / MultiDay | Seleccionar fecha(s) |
| 3 | MachinerySelection | Seleccionar maquinaria |
| 4 | ReservationDataScreen | Dirección + Comuna obligatorios |
| 5 | ServiceLocationScreen | Validación comuna |
| 6 | ConfirmServiceScreen | Por hora: "Jornada (8h)" o "X días (8h/día)" |
| 7 | ConfirmServiceScreen | Por viaje: "Valor viaje" o "X viajes" (NO "Jornada 8h") |

---

## 6. OneClick y Pago

| Paso | Pantalla | Verificar |
|------|----------|-----------|
| 1 | CardPaymentScreen | Email obligatorio, botón "Registrar tarjeta" |
| 2 | CardPaymentScreen → Submit | Redirige a Transbank (o error amigable si API falla) |
| 3 | OneClickCompleteScreen | Recibe tbk_user, guarda y navega a Searching |
| 4 | SearchingProviderScreen | Spinner, timer, "Contactando proveedor" |
| 5 | PaymentResultScreen | Éxito o error según flujo |

---

## 7. Validaciones y Errores

| Caso | Verificar |
|------|-----------|
| Comuna inválida | ReservationDataScreen y ServiceLocationScreen muestran "Selecciona una comuna de la lista" |
| Sin ubicación | ConfirmServiceScreen redirige a ServiceLocation |
| Sin proveedor | ConfirmServiceScreen muestra "Elegir proveedor" |
| Sin precio | ConfirmServiceScreen muestra "No pudimos calcular el precio" + botón elegir otro |
| Offline | Banner rojo "Sin conexión" visible |

---

## 8. Accesibilidad y UX

| Elemento | Verificar |
|----------|-----------|
| Skip link | "Saltar al contenido" visible con Tab |
| Focus visible | Botones e inputs muestran outline al navegar con Tab |
| aria-label | Botones "Volver" tienen aria-label |
| Loading states | ProviderOptionsScreen, ConfirmServiceScreen muestran spinner al cargar precio |

---

## 9. Matriz QA – Todas las maquinarias

**Por hora (7):** retroexcavadora, excavadora, bulldozer, motoniveladora, compactadora, minicargador, grúa  
**Por viaje (3):** camion_pluma, camion_aljibe, camion_tolva  
**Con traslado (7):** todas las por hora  
**Sin traslado (3):** las 3 por viaje  

| Maquinaria | Inmediato desglose | Inmediato descripción | Programado desglose | Programado descripción |
|------------|-------------------|----------------------|---------------------|------------------------|
| Retroexcavadora | Servicio (4h) + Alta demanda | 4 horas · Inicio hoy | Jornada (8h) | 8 horas · [fecha] |
| Excavadora | Servicio (4h) + Alta demanda | 4 horas · Inicio hoy | Jornada (8h) | 8 horas · [fecha] |
| Bulldozer | Servicio (4h) + Alta demanda | 4 horas · Inicio hoy | Jornada (8h) | 8 horas · [fecha] |
| Motoniveladora | Servicio (4h) + Alta demanda | 4 horas · Inicio hoy | Jornada (8h) | 8 horas · [fecha] |
| Compactadora | Servicio (4h) + Alta demanda | 4 horas · Inicio hoy | Jornada (8h) | 8 horas · [fecha] |
| Minicargador | Servicio (4h) + Alta demanda | 4 horas · Inicio hoy | Jornada (8h) | 8 horas · [fecha] |
| Grúa Móvil | Servicio (4h) + Alta demanda | 4 horas · Inicio hoy | Jornada (8h) | 8 horas · [fecha] |
| Camión Pluma | Valor viaje + Alta demanda | Valor viaje · Inicio hoy | Valor viaje | Valor viaje · [fecha] |
| Camión Aljibe | Valor viaje + Alta demanda | Valor viaje · Inicio hoy | Valor viaje | Valor viaje · [fecha] |
| Camión Tolva | Valor viaje + Alta demanda | Valor viaje · Inicio hoy | Valor viaje | Valor viaje · [fecha] |

**Multi-día programado:** Por hora: "X días (8h/día)". Por viaje: "X viajes".

---

## 10. Reglas de negocio críticas

| Regla | Dónde verificar |
|-------|-----------------|
| Maquinaria por hora: Servicio (Xh) + Alta demanda | ConfirmServiceScreen desglose |
| Maquinaria por viaje: Valor viaje (sin horas en etiqueta) | ConfirmServiceScreen desglose y descripción |
| Horas inmediato: 4–8 | HoursSelectionScreen |
| Comuna en lista oficial | ReservationDataScreen, ServiceLocationScreen |
| Sin cobro hasta aceptar | ConfirmServiceScreen, CardPaymentScreen |

---

## 11. Matriz de regresión – Cambios frecuentes

Cuando modifiques uno de estos archivos, verifica las filas indicadas:

| Archivo | Verificar sección |
|---------|-------------------|
| `ConfirmServiceScreen.js` | 3, 4, 5, 6, 7, 9 |
| `ReservationDataScreen.js` | 3, 5, 7 |
| `ServiceLocationScreen.js` | 3, 5, 7 |
| `ProviderOptionsScreen.js` | 3, 8 |
| `CardPaymentScreen.js` | 6 |
| `OneClickCompleteScreen.js` | 6 |
| `bookingFlow.js` | 3, 5 |
| `comunas.js` | 7 |
| `pricing/calculator.py` | Tests automatizados, 4, 5 |
| `routes/pricing.py` | Tests automatizados |
| `App.jsx`, `MachinerySelection.js`, `BookingProgress.js`, `UrgencySelectionScreen.js`, `machineryNames.js`, `backend/routes/providers.py`, `backend/server.py` | **Sección 12** (regresiones recientes) |

---

## Resumen ejecutivo

**Antes de mergear:** Ejecutar tests automatizados + al menos secciones 3, 4 y 7 + **sección 12** (regresiones recientes).

**Antes de deploy:** Checklist completo (incluye sección 12).

**Tiempo estimado:** 15–20 min (manual) + 2 min (automático).

---

## 12. Regresiones recientes – Evitar reintroducir

**Objetivo:** Estos fallos ya se corrigieron. Verificar que sigan bien tras cualquier cambio en frontend/backend.

### 12.1 Arranque y compilación

| Verificación | Cómo comprobar |
|--------------|-----------------|
| Sin imports rotos en App.jsx | No debe existir `import RequestReceived from '...RequestReceived'` ni `import RateClientScreen` ni `import HoursSelection` ni `import ReservationDataScreen`. Rutas usan `Navigate` o el componente correcto (RequestReceivedScreen, etc.). |
| Frontend compila | `cd frontend && npm run build` → sin errores de "Failed to resolve import". |
| Backend arranca sin crash | `cd backend && uvicorn server:app --port 8000` → no debe fallar por `ensure_index` en abandonment (ese bloque fue eliminado). |

### 12.2 Reserva hoy – Selección múltiple de maquinaria

| Verificación | Cómo comprobar |
|--------------|-----------------|
| Se pueden elegir varias maquinarias | Inicio HOY → Maquinaria → tocar una (ej. Retroexcavadora) → tocar otra (ej. Motoniveladora). **Ambas** deben quedar con check naranja. |
| El botón refleja la cantidad | Con 2 seleccionadas debe decir "Ver opciones (2 seleccionadas)" (o similar). |
| No se resetea al tocar la segunda | Si al tocar la segunda solo queda una seleccionada, es regresión (toggle debe leer de localStorage para evitar batcheo de React). |
| Texto de ayuda visible | "Puedes elegir más de un tipo de maquinaria" en MachinerySelection. |

### 12.3 Botón Volver (flujo programado)

| Verificación | Cómo comprobar |
|--------------|-----------------|
| Volver desde Ubicación (programado) | En reserva programada, en Service Location al tocar "Volver" debe ir a **Maquinaria** (no a reservation-data, que ya no es pantalla). `getServiceLocationBackRoute()` para scheduled = `/client/machinery`. |

### 12.4 Indicador de progreso

| Verificación | Cómo comprobar |
|--------------|-----------------|
| Solo número de paso | El texto debe ser **solo** "Paso 1 de 6", "Paso 2 de 6", etc. **Sin** nombre del paso (ej. sin "Maquinaria", "Horas / Urgencia"). |
| Rutas con paso correcto | En `/client/machinery` → Paso 1. En `/client/urgency` o `/client/hours-selection` → Paso 2. En `/client/service-location` → Paso 3. |

### 12.5 Pantalla Urgencia (camiones)

| Verificación | Cómo comprobar |
|--------------|-----------------|
| No error de MACHINERY_NAMES | Ir a Cliente → Inicio HOY → Camión Tolva/Aljibe/Pluma → Urgencia. No debe aparecer "MACHINERY_NAMES is not defined". UrgencySelectionScreen debe importar `MACHINERY_NAMES` desde `utils/machineryNames`. |

### 12.6 Info mínima por maquinaria

| Verificación | Cómo comprobar |
|--------------|-----------------|
| Descripciones visibles | En MachinerySelection cada ítem muestra nombre + una línea de descripción (ej. "Excavación, zanjas y movimiento de tierra"). |
| No modificar textos definidos | Las descripciones viven en `MACHINERY_DESCRIPTIONS` en `utils/machineryNames.js`; no cambiarlas sin acuerdo. |

### 12.7 ETA y holgura para proveedores

| Verificación | Dónde verificar |
|--------------|-----------------|
| Camión aljibe: mínimo 30 min | Backend `routes/providers.py`: `MIN_ETA_PREPARATION_MINUTES['camion_aljibe'] == 30`. Match y demo no deben ofrecer ETA &lt; 30 min para aljibe. |
| Camión tolva: mínimo 20 min | `MIN_ETA_PREPARATION_MINUTES['camion_tolva'] == 20`. |
| Camión pluma: mínimo 15 min | `MIN_ETA_PREPARATION_MINUTES['camion_pluma'] == 15`. |
| Cálculo ETA | `get_eta_minutes(distance_km, machinery_type)` = max(preparación, viaje). Match y get_demo_providers usan esta función. |

### 12.8 Archivos sensibles (si tocas estos, corre 12.1–12.6)

| Archivo | Revisar sección |
|---------|------------------|
| `App.jsx` | 12.1 (imports y rutas) |
| `MachinerySelection.js` | 12.2, 12.5 |
| `BookingProgress.js` | 12.3 |
| `UrgencySelectionScreen.js` | 12.4 |
| `machineryNames.js` | 12.5 |
| `backend/routes/providers.py` | 12.1, 12.6 |
| `backend/server.py` | 12.1 (lifespan sin ensure_index de abandonment) |
