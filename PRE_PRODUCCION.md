# Pre-producción – Revisiones y pruebas

**Guía principal de lanzamiento:** ver **`LANZAMIENTO_MAQGO.md`** (pasos en orden: pre-deploy, env, CORS, checklist, deploy).

Antes de subir a producción, ejecuta estas revisiones y pruebas.

---

## 1. Tests automatizados (sin levantar servidor)

Desde la raíz del proyecto (`Maqgo1-main`):

```bash
# Tests unitarios de pricing (calculator)
./backend/venv/bin/python -m pytest tests/test_pricing_unit.py -v

# Simulación de escenarios cliente/proveedor (usa calculator)
./backend/venv/bin/python -m pytest tests/test_scenarios_simulation.py -v

# QA por tipo de maquinaria (immediate, scheduled, desglose)
./backend/venv/bin/python -m pytest tests/test_all_machinery_qa.py -v
```

**Todos deben pasar.** Los tests que requieren API viva (ej. `test_pricing_api.py`, `backend/tests/test_operators_api.py`) se ejecutan con el backend en marcha:

```bash
# Terminal 1: backend
cd backend && ./venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8000

# Terminal 2: tests de API
REACT_APP_BACKEND_URL=http://localhost:8000 ./backend/venv/bin/python -m pytest tests/test_pricing_api.py -v
```

---

## 2. Variables de entorno en producción

- **Backend:** `MONGO_URL`, `DB_NAME`, `CORS_ORIGINS` (no dejar `*` en prod), `MAQGO_DEMO_MODE=false`, `TBK_DEMO_MODE=false` si usas Transbank real.
- **Frontend:** `REACT_APP_BACKEND_URL` (o `VITE_*` según build) apuntando a la API de producción.
- Revisar que no queden URLs de localhost en el build.

---

## 3. CORS

En producción, en el backend define orígenes concretos, por ejemplo:

```bash
CORS_ORIGINS=https://tu-dominio.com,https://www.tu-dominio.com
```

Si `CORS_ORIGINS=*`, el servidor ya muestra un warning al arrancar.

---

## 4. Revisiones ya aplicadas en código

- **ServiceLocationScreen:** Guarda `serviceLat` / `serviceLng` en `localStorage` cuando hay coordenadas.
- **machineryType:** Al completar onboarding proveedor, el backend sincroniza `machineryType` desde `machineData`; el matching por tipo funciona.
- **Facturas:** Rutas de invoices aceptan `id` y `_id` del servicio (compatibilidad).
- **localStorage:** Endurecido en `providerMachines.js` (getMachines con try/catch) y `abandonmentTracker.js` (visibilitychange con try/catch).
- **console:** No se imprimen credenciales; el único `console.warn` de API está condicionado a desarrollo.

---

## 5. Checklist manual recomendado

- [ ] Flujo completo proveedor: registro → P1–P6 → revisión → confirmar.
- [ ] Flujo cliente: maquinaria → ubicación → proveedores → confirmar → (pago en staging si aplica).
- [ ] Operador: generar código desde Mi Equipo (nombre + RUT) → otro dispositivo ingresar código → éxito.
- [ ] Una reserva de punta a punta (cliente pide → proveedor acepta → en camino → finalizar).

---

## 6. Documentos relacionados

- `docs/QA_PRODUCCION_MVP.md` – QA pre-producción y checklist pre-deploy.
- `CHECKLIST_MVP_CERRADO.md` – Alcance del MVP y conocido pos-MVP.
- `TODO.md` – TODOs pendientes en código (pago real, emails, cámara operador, etc.).
