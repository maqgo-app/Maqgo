# Revisión MVP – Funcionamiento y mejoras (versión MVP)

## Resumen

Revisión interna del flujo cliente/proveedor, backend/frontend y coherencia de datos. Se aplicaron correcciones críticas y se listan mejoras sugeridas solo para estado MVP.

---

## Correcciones ya aplicadas

### Backend

1. **`service_requests.py`**
   - Se excluye `selectedProviderIds` al armar `create_data` para no pasar campos que no tiene el modelo `ServiceRequest`.
   - Si el cliente envía varios proveedores (`selectedProviderIds`) y no viene `selectedProviderId`, se usa el primero de la lista para el matching.

2. **`providers.py`** (hecho antes)
   - Match ya no filtra por factura: se muestran todos los proveedores; el precio refleja con/sin factura.
   - Respuesta de match incluye `capacity_liters` (aljibe) y `capacity_ton_m` (pluma).
   - Demos incluyen esas capacidades para aljibe y pluma.

### Frontend

- Fotos máquina opcionales; copy de facturación unificado (“emitida a … y cargada en el sistema”); FAQ alineadas.

---

## Flujos revisados (MVP)

### Cliente: reserva

1. **Home → Maquinaria → Horas/Urgencia (según tipo) → Ubicación → Proveedores → Confirmar → Facturación (si aplica) → Tarjeta (OneClick) → OneClickComplete → Searching**
2. **Confirm** guarda en `localStorage`: `totalAmount`, `needsInvoice`, `servicePricing`, `serviceBasePrice`, `serviceTransportFee`; redirige a billing o card.
3. **CardPaymentScreen** registra tarjeta (Transbank OneClick o demo); redirige a `/oneclick/complete?tbk_user=...`.
4. **OneClickCompleteScreen** lee `tbk_user`, guarda OneClick, llama `POST /api/service-requests` con `clientId`, `location`, `basePrice`, `transportFee`, `totalAmount`, `machineryType`, `workdayAccepted`, `selectedProviderId`/`selectedProviderIds`, etc., y luego navega a **Searching**.
5. Backend crea la solicitud, calcula comisiones e inicia matching con `start_matching(..., selected_provider_id)`.

Punto delicado: si el usuario llega a **OneClickComplete** sin haber pasado por Confirm (por ejemplo, vuelve atrás o abre otra pestaña), `serviceBasePrice` o `totalAmount` pueden faltar; OneClickComplete usa fallbacks (`150000`, `0`). Aceptable para MVP.

### Proveedor: onboarding y servicio

1. **Register/Verified → Datos proveedor → Datos máquina → Fotos (opcional) → Precios → Operadores → Review → Home**
2. `bookingFlow.js` define bien los “back” de cada paso.
3. Tras aceptar solicitud, flujo: RequestReceived → SelectOperator → EnRoute → Arrival → ServiceActive → Finished → Upload invoice.

Los datos de máquina (incl. capacidad) se guardan en front en `providerMachines` (localStorage). Para que el **match real** (backend) use tipo de maquinaria, el usuario proveedor en MongoDB debe tener `machineryType` (o equivalente) actualizado; el seed lo pone a nivel raíz. Si en el futuro los datos vienen de otro lugar (p. ej. `machineData`), habría que alinear la query en `matching_service.get_available_providers` (hoy filtra por `machineryType` en el documento de usuario).

---

## Mejoras sugeridas (solo MVP)

### 1. Mensaje cuando falla la creación de la solicitud

- **Dónde:** `OneClickCompleteScreen.js`
- **Qué:** Al fallar `POST /api/service-requests`, se muestra `setError(...)` pero se navega igual a `/client/searching` a los 2 segundos. Para MVP basta con que el usuario vea un mensaje tipo “No pudimos crear la solicitud. Redirigiendo…” y que la redirección sea clara (no solo spinner).
- **Estado:** Opcional; el fallback actual evita bloquear.

### 2. Coherencia machineryType en matching

- **Dónde:** `matching_service.get_available_providers`
- **Qué:** Hoy se filtra por `query['machineryType'] = machinery_type` en el documento de usuario. Si en tu modelo el tipo de maquinaria está solo en `machineData.machineryType`, ningún proveedor pasará el filtro. Verificar que al completar onboarding proveedor (o al sincronizar máquinas) se guarde `machineryType` en el usuario en backend.
- **Estado:** Verificar con tu forma actual de registrar/actualizar proveedores.

### 3. Validación mínima de ubicación antes de Confirm

- **Dónde:** `ConfirmServiceScreen` → `doConfirm`
- **Qué:** Ya se comprueba `if (!location.trim())` y se redirige a `service-location`. Asegurarse de que `serviceLat`/`serviceLng` se guarden al elegir ubicación para que OneClickComplete no envíe siempre el fallback Santiago.
- **Estado:** Revisar que `ServiceLocationScreen` guarde `serviceLat` y `serviceLng` en `localStorage`.

### 4. Tests automatizados

- **Dónde:** `tests/test_pricing_api.py`, `tests/test_scenarios_simulation.py`
- **Qué:** Ejecutar con el venv del backend, por ejemplo:  
  `backend/venv/bin/python -m pytest tests/ -v`  
  (o el comando que uséis con el venv activo).
- **Estado:** Recomendado antes de cada release MVP.

### 5. Número de tarjeta (TC/TD)

- **Dónde:** `CardInput.js`
- **Qué:** Ya tiene `maxLength="16"` y solo dígitos. Si en otra pantalla (p. ej. otra ruta de pago) se pide número de tarjeta, aplicar el mismo criterio: solo dígitos y máximo 16 (o 19 si se define).
- **Estado:** Revisado; sin cambio si solo se usa CardInput.

---

## Lo que no tocar en MVP (post-MVP)

- Filtrar u ordenar proveedores por capacidad elegida por el cliente (clientRequiredLitersList, etc.).
- Mostrar fotos de la máquina al cliente (estilo Uber).
- Matching a varios proveedores a la vez (hoy se envía oferta a uno; si rechaza, se busca el siguiente).
- Cambiar flujo de pago (OneClick vs otro método).

---

## Checklist rápido antes de cerrar MVP

- [ ] Cliente: flujo completo reserva inmediata (maquinaria → ubicación → proveedores → confirmar → tarjeta → searching).
- [ ] Cliente: flujo con factura (billing antes de card).
- [ ] Cliente: flujo por viaje (tolva/aljibe/pluma) con selección de capacidad y que en opciones se vea la capacidad del proveedor.
- [ ] Proveedor: onboarding completo sin obligar fotos; dato que distingue (m³, L, ton·m) según tipo.
- [ ] Proveedor: recibir solicitud, aceptar, en ruta, llegada, finalizar, subir factura (copy “emitida a … y cargada en el sistema”).
- [ ] Backend: crear solicitud con `selectedProviderIds` no rompe; matching usa primer proveedor elegido.
- [ ] Backend: match devuelve todos los proveedores (no filtrar por factura); precios correctos con/sin factura en front.
