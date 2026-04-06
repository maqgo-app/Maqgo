# Regla: Cliente pide factura pero proveedor no emite

## Contexto (típico en Chile)

El cliente solicita factura (needsInvoice=true) y paga con IVA incluido. Sin embargo, muchos proveedores de maquinaria operan en la informalidad y **no emiten factura**. Esto genera una **diferencia de IVA** que debe revisarse.

---

## Flujo actual (cuando todo funciona)

| Paso | Actor | Acción | IVA |
|------|-------|--------|-----|
| 1 | Cliente | Paga a MAQGO (subtotal + IVA 19% + tarifa MAQGO) | Paga IVA |
| 2 | MAQGO | Debe emitir factura al cliente | Recibe IVA del cliente |
| 3 | Proveedor | Sube factura a MAQGO (neto + IVA menos comisión) | Proveedor factura IVA a MAQGO |
| 4 | MAQGO | Paga al proveedor tras recibir factura | Usa factura proveedor como **crédito fiscal** |
| 5 | MAQGO | Declara IVA al SII | IVA ventas − crédito fiscal = IVA a pagar |

---

## El problema: proveedor no sube factura

Cuando el **proveedor no emite/sube factura**:

1. **Cliente**: Ya pagó con IVA. Espera factura de MAQGO.
2. **MAQGO**: Tiene el pago del cliente (con IVA). Debe emitir factura al cliente.
3. **Proveedor**: No factura a MAQGO. No recibe el pago (el flujo actual exige factura para pagar).
4. **Diferencia de IVA**: MAQGO recaudó IVA del cliente pero **no tiene factura del proveedor** como crédito fiscal. MAQGO termina pagando más IVA al SII de lo que debería.

### Ejemplo numérico

- Cliente paga: **$1.498.805** (incluye IVA ~$239.305 sobre base facturable)
- Proveedor debería facturar a MAQGO: **$1.008.745** (incluye IVA del proveedor)
- Si proveedor NO factura:
  - MAQGO emite factura al cliente por $1.498.805 ✓
  - MAQGO no tiene factura de compra (proveedor) → sin crédito fiscal
  - MAQGO paga IVA completo al SII sobre la venta
  - **Costo extra para MAQGO** ≈ IVA que habría sido crédito fiscal

---

## Opciones de política

### Opción A: MAQGO absorbe el costo (actual implícito)

- MAQGO emite factura al cliente igual (obligación legal).
- Proveedor no recibe pago hasta subir factura (flujo actual).
- Si proveedor nunca sube: MAQGO tiene el dinero pero no puede pagar sin factura. El IVA ya cobrado al cliente debe declararse; MAQGO no tiene crédito fiscal.
- **Riesgo**: Costo fiscal para MAQGO si hay muchos proveedores informales.

### Opción B: Pago sin factura con retención

- Si proveedor no sube factura en X días (ej. 30), MAQGO puede:
  - Pagar al proveedor el neto (sin IVA) o con retención.
  - Emitir boleta de honorarios o documento interno.
- **Complejidad**: Requiere definir régimen (factura vs boleta) y retenciones.

### Opción C: Proveedores “con/sin factura” al registrarse

- Al onboarding, el proveedor declara si puede emitir factura.
- Si el cliente pide factura pero el proveedor está marcado “sin factura”:
  - **Opción C1**: No permitir la combinación (bloquear reserva con factura).
  - **Opción C2**: Mostrar aviso al cliente: “Este proveedor no emite factura; si la necesitas, elige otro”.
  - **Opción C3**: Cobrar sin IVA extra al cliente (precio base) y MAQGO emite factura por su comisión solamente (modelo distinto).

### Opción D: Plazo y escalación

- Proveedor tiene 30 días para subir factura.
- Si no sube: recordatorios automáticos, luego escalación a admin.
- Admin puede: (a) marcar “pagado sin factura” con documentación interna, (b) contactar proveedor, (c) aplicar política de penalización.

---

## Decisión (Opción B) – Implementada

**Política:** MAQGO factura al cliente. Si el proveedor no sube factura, MAQGO retiene el IVA (19%) del pago al proveedor para cubrir la diferencia fiscal.

- **Cliente:** Paga con IVA. MAQGO emite factura al cliente.
- **Proveedor sin factura:** Admin puede marcar "Pagar sin factura". MAQGO retiene `net_total × 0.19` y paga al proveedor `net_total × 0.81`.
- **Campos:** `paid_without_invoice`, `retention_amount`, `amount_paid_to_provider`.

---

## Recomendación adicional para MVP

1. **Documentar** en TyC/FAQ que el proveedor debe facturar a MAQGO para recibir el pago.
2. **Recordatorios** al proveedor: si tiene servicios approved sin factura, notificar (email/push) para que suba.
3. **Implementado:** Botón "Pagar sin factura" en AdminDashboard para servicios approved.
4. **Implementado (Opción C1):** Si el cliente necesita factura, solo aparecen proveedores que emiten factura. El proveedor declara "¿Emites factura?" en onboarding (`providerData.emitsInvoice`). El cliente selecciona "¿Necesitas factura?" en ubicación del servicio.

---

## Campos a revisar en código

- `needsInvoice` / `needs_invoice`: se propaga desde service_request hasta services.
- Servicios con `needs_invoice=true` pero sin `invoice_image`: son los “cliente pidió factura, proveedor no subió”.
- Dashboard admin: filtrar o alertar por “MAQGO debe facturar al cliente” vs “proveedor no ha subido factura”.

---

## Referencias

- `docs/EJERCICIO_RESERVA_RETRO_5H_MAS_1_DIA.md` – Flujo de facturación
- `backend/routes/invoices.py` – Validación y subida de factura
- `frontend/src/screens/provider/ProviderHistoryScreen.js` – `needsInvoice`, “Subir factura”
