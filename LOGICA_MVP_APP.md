# Cómo se ve la app en lógica MVP

Resumen de flujos, datos y puntos a tener en cuenta para el MVP.

> **MVP cerrado** — Ver `CHECKLIST_MVP_CERRADO.md` para el estado de cierre.

---

## 1. Dos “mundos” de datos

Hay **dos colecciones** con roles distintos:

| Colección          | Uso                    | Estados típicos |
|--------------------|------------------------|-----------------|
| **service_requests** | Operativo: reserva en vivo | matching → accepted → en_route → arrived → in_progress → last_30 → finished → rated |
| **services**        | Facturación / Pago Ágil | pending_review → approved → invoiced → paid (o disputed) |

- **service_requests**: lo que ve cliente y proveedor durante la reserva (búsqueda, asignación, en camino, en obra, finalizado, calificación). Identificador: `id` (string).
- **services**: lo que usa admin y proveedor para facturar y cobrar después del trabajo. Se crea cuando el proveedor termina el servicio y el frontend llama a `POST /api/services/create`. Identificador: `_id` (ObjectId).

---

## 2. Flujo cliente (operativo)

1. Registro / login (SMS demo 123456) → Rol “Cliente”.
2. Home → Reserva inmediata o programada.
3. Maquinaria → Horas → Ubicación → Proveedores → Confirmar → Datos facturación → Pago (mock).
4. Se crea **service_request** (matching). Estados: searching → accepted → en_route → arrived → in_progress → last_30 → finished.
5. Timer (cada minuto): pasa a `last_30` 30 min antes de `endTime`, a `finished` en `endTime`.
6. Cliente puede calificar (rated).

Todo esto vive en **service_requests** y en el estado que el frontend guarda en `localStorage` para la demo.

---

## 3. Flujo proveedor (operativo + facturación)

**Durante el servicio**

- Recibe solicitud (RequestReceived) → Acepta o selección de operador → En camino → Llegada → Servicio activo → Finalizar.
- Si hay operadores: flujo con SelectOperator; el operador puede aceptar y cambia estado (en_route, etc.) en **service_requests**.

**Al finalizar el servicio**

- ProviderServiceFinishedScreen: datos de facturación al cliente (si aplica), número de factura.
- Ahí el frontend llama a **POST /api/services/create** y se crea un documento en **services** con:
  - `status: "pending_review"`
  - `provider_id`, `client_id`, `gross_total`, `net_total`, `invoice_total`, etc.
- Ese documento es el que después recorre: pending_review → approved → invoiced → paid.

**Subida de factura**

- Proveedor va a “Mis servicios” / historial y sube factura para un servicio **approved**.
- **POST /api/services/{service_id}/invoice** (body: `invoice_number`, `invoice_image` base64).
- Backend pone el servicio en `invoiced`, guarda `invoice_number`, `invoice_image`, `invoice_uploaded_at`.
- Admin ve “Factura subida” y puede revisar y marcar como pagado.

(La ruta de **invoices** con archivo y validación cruce monto usa `db.services` con campo `id`; la subida desde el frontend actual usa **services** por `_id`. Son dos formas de “subir factura”; la que usa el admin hoy es la de **services** con `_id`.)

---

## 4. Flujo admin (facturación)

- **GET /api/services/admin/all**: lista todos los **services** (pending_review, approved, invoiced, paid, disputed).
- Tarjetas: “X servicios por revisar”, “X factura(s) subida(s) · Revisar si correcta”, disputas.
- Acciones:
  - pending_review: Aprobar → `approved` o Disputar → `disputed`.
  - approved: el proveedor debe subir factura (queda en approved hasta que sube).
  - invoiced: admin ve factura subida, revisa y puede “Marcar pagado” → `paid`.
- Timer (cada minuto): servicios en `pending_review` con más de 6 h se auto-aprueban a `approved` (Pago Ágil).

Todo esto es sobre la colección **services** y sus estados de facturación.

---

## 5. Comisiones y cruce de factura

- **Cliente:** 10% + IVA sobre (servicio + bono + traslado); se suma a lo que paga.
- **Proveedor:** 10% + IVA sobre ese subtotal; se descuenta al pago.
- **Cruce factura:** El total que debe tener la factura del proveedor es  
  `(subtotal - tarifa_plataforma) * 1.19`  
  donde `subtotal = serviceAmount + bonusAmount + transportAmount` y `tarifa_plataforma = subtotal * 0.10 * 1.19`.  
  Implementado en `invoices.py` (expected_invoice_total_from_service, validación, voucher).

---

## 6. Cómo lo veo para el MVP

**Qué está claro y cerrado**

- Flujo cliente de reserva (inmediata/programada) hasta finalizado y rating.
- Flujo proveedor durante el servicio (aceptar, en camino, llegar, terminar).
- Creación del “servicio de facturación” al finalizar (POST /services/create) y pipeline admin: revisar → aprobar → factura subida → marcar pagado.
- Auto-aprobación a las 6 h (Pago Ágil) sobre **services**.
- Comisiones definidas y cruce de total de factura documentado en código.
- Admin informa “Factura subida” y permite revisar antes de pagar.
- Timers operativos (last_30, finished) sobre **service_requests**.
- Matching (service_requests), comunicaciones (SMS/OTP demo), abandonment (recordatorios con FRONTEND_URL/Twilio opcional).

**Puntos a vigilar (1–3 solucionados en código)**

1. **Dos formas de “subir factura”**  
   - Una por **services**: POST `/api/services/{id}/invoice` (JSON con `invoice_number` e `invoice_image`), usa `_id` del servicio.  
   - Otra por **invoices**: upload con archivo y `service_id` (por `id` string).  
   Conviene unificar criterio (por ejemplo que el flujo principal sea uno solo y el otro quede como alternativo o deprecado) para no duplicar lógica.

2. **Identificador del servicio**  
   - **services** se identifica por `_id` (ObjectId) en admin y en POST `/services/{id}/invoice`.  
   - **invoices** (rutas de factura con archivo) usa `service_id` y en backend busca por `service["id"]`; si los documentos en **services** no tienen campo `id` string, esa ruta no encontrará el servicio. Revisar que o bien todos los servicios de facturación tengan `id` cuando se use esa ruta, o que esa ruta use `_id` también.

3. **Operadores y colección “services”**  
   - En **operators** se consulta **services** con `status` en `["pending", "searching"]` y `provider_id` = owner.  
   - En el flujo actual, los únicos documentos que se crean en **services** son los de POST /services/create (status `pending_review`). No se crean servicios con status `pending`/`searching` en **services**.  
   - Por tanto, esa consulta de “servicios pendientes para operador” en **services** hoy no devolvería nada a menos que otro flujo o seed cree esos estados. El flujo operativo “pendiente de aceptación” vive en **service_requests**. Para MVP tiene sentido decidir: o los operadores trabajan solo sobre **service_requests**, o se define quién y cuándo crea documentos en **services** con pending/searching.

4. **Demo / datos de prueba**  
   - Admin y proveedor usan datos demo cuando el API falla (localStorage, listas hardcodeadas). Para probar facturación de punta a punta conviene tener al menos un servicio real en **services** (creado por POST /services/create) y seguir el flujo hasta “factura subida” y “marcar pagado”.

---

## 7. Resumen en una frase

En lógica MVP la app se ve como **dos tuberías**: una operativa (**service_requests**: reserva, matching, en obra, timers, rating) y otra de facturación (**services**: crear al terminar el trabajo → revisión admin → factura subida → pago), con comisiones y cruce de factura definidos y el admin pudiendo revisar que la factura esté correcta antes de marcar como pagado.
