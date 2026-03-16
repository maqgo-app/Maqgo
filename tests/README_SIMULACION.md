# Simulación de escenarios MAQGO

## Cómo ejecutar los tests

```bash
cd "/Users/tomasvillalta/Desktop/Repositorios Github/Respaldo Maqgo1-main4/Maqgo1-main"
source backend/venv/bin/activate
REACT_APP_BACKEND_URL=http://localhost:8000 python -m pytest tests/test_scenarios_simulation.py tests/test_pricing_unit.py -v
```

**Requisito:** El backend debe estar corriendo en el puerto 8000.

---

## Escenarios cubiertos

| Escenario | Tipo | Verifica |
|-----------|------|----------|
| Cliente inmediata | Retroexcavadora 4h + traslado | Precio correcto, transport_cost |
| Cliente inmediata | 8h sin traslado | Transport 0 |
| Cliente inmediata | Camión pluma (por viaje) | Cobro flat, no por hora |
| Cliente inmediata | Precios con decimales | No rompe con 45250.5 |
| Cliente programada | 1 día, 8h | service_cost = base*8 |
| Cliente programada | Múltiples días | base*8*days |
| Cliente programada | Camión por viaje | base*days |
| Cliente híbrido | Hoy 4h + 2 días extra | Hoy con multiplier, días sin |
| Cliente híbrido | base_price_hr | Formato frontend |
| Consistencia | Cliente vs proveedor | Comisiones coherentes |
| Redondeo | Valores monetarios | Sin fracciones raras |
| Edge cases | Horas inválidas | 400/422 |
| Edge cases | base_price=0 | Rechazado |
| Edge cases | Todos los tipos maquinaria | Aceptados |

---

## Bugs corregidos durante la simulación

1. **ProviderOptionsScreen multiplicadores** – Estaban 1.30/1.25/... en lugar de 1.20/1.175/... (backend). Lista de proveedores mostraba precios distintos a ConfirmServiceScreen.

2. **ConfirmServiceScreen sin machinery_type** – Las llamadas a `/immediate` y `/hybrid` no enviaban `machinery_type`. Para camiones (por viaje) el backend usaba default "retroexcavadora" y cobraba mal.

3. **Quote endpoint base_price_hr** – El endpoint `/api/pricing/quote/client` solo aceptaba `base_price`. Si el frontend enviaba `base_price_hr`, devolvía 500. Corregido en `backend/routes/pricing.py`.

4. **ProviderOptionsScreen maquinaria por viaje** – Para camiones usaba `basePrice * hours * multiplier` en lugar de `basePrice * multiplier`. Para programada usaba `basePrice * 8` en lugar de `basePrice * days`.

5. **ProviderOptionsScreen programada multi-día** – No consideraba `selectedDates` para días. Ahora usa `days = selectedDates.length` para calcular correctamente.

---

## Tests unitarios (sin servidor)

```bash
cd backend
python -m pytest ../tests/test_pricing_unit.py -v
```

No requieren backend corriendo. Validan el calculator directamente.
