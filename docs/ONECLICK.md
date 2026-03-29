# Integración Transbank OneClick Mall - MAQGO

## Flujo

1. **Registro de tarjeta** (`CardPaymentScreen`): El cliente ingresa su email y hace clic en "Registrar tarjeta".
2. **Start** (`POST /api/payments/oneclick/start`): El backend llama a Transbank y obtiene `token` + `url_webpay`.
3. **Redirect**: El usuario es enviado a la página de Transbank para ingresar los datos de su tarjeta.
4. **Retorno** (`GET /api/payments/oneclick/confirm-return`): Transbank redirige aquí con `TBK_TOKEN`. El backend confirma la inscripción y obtiene `tbk_user`.
5. **Complete** (`/oneclick/complete?tbk_user=xxx`): El frontend guarda `tbk_user` y `username` en localStorage y en MongoDB.
6. **Cobro** (cuando el proveedor acepta): El backend usa `tbk_user` + `username` para autorizar el pago vía `authorize_payment`.
7. **Devolución** (cancelaciones / timeouts): `PaymentService.rollback_charge` llama a `POST .../transactions/{buy_order}/refunds` con `commerce_code` de la tienda hija y `detail_buy_order`. Tras un cobro aprobado se guardan `tbkBuyOrder` y `tbkDetailBuyOrder` en `payments` (el detalle viene de `details[0]` en la respuesta de authorize).

### Probar devoluciones (integración)

1. Flujo completo: inscripción → servicio → proveedor **acepta** (cobro real integración).
2. Cliente **cancela** en ventana con reembolso (o esperar job de timeout sin llegada si aplica).
3. Revisar logs del backend: debe aparecer llamada a refund o error explícito de Transbank.
4. Si Transbank falla, la solicitud queda `paymentStatus: refund_pending` (reintento / soporte manual); no se marca `refunded` hasta que el reembolso sea exitoso.

**HTTP manual (solo admin):** `POST /api/payments/oneclick/refund` con Bearer de administrador y body `buy_order`, `detail_buy_order`, `amount` (uso operativo / soporte).

## Pruebas locales

Transbank debe poder alcanzar la URL de retorno. Con `localhost` **no funciona**.

### Opción: ngrok

1. Instala ngrok: `brew install ngrok` (Mac) o desde [ngrok.com](https://ngrok.com)
2. Levanta el backend: `cd backend && python server.py` (o `uvicorn server:app --reload --port 8002`)
3. En otra terminal: `ngrok http 8002`
4. Copia la URL pública (ej. `https://abc123.ngrok.io`)
5. En `backend/.env`:
   ```
   TBK_RETURN_URL=https://abc123.ngrok.io/api/payments/oneclick/confirm-return
   ```
6. Reinicia el backend

El frontend seguirá usando `REACT_APP_BACKEND_URL` para llamar al API; puede ser `http://localhost:8002`. El override de `TBK_RETURN_URL` solo afecta la URL que Transbank usa para redirigir.

### Tarjetas de prueba (ambiente integración)

| Tarjeta | Resultado |
|---------|-----------|
| VISA 4051 8856 0044 6623 | Aprobada |
| MASTERCARD 5186 0595 5959 0568 | Rechazada |

CVV: 123, cualquier fecha de expiración futura.

## Variables de entorno

Ver `backend/.env.example` para la lista completa.

### Endpoints públicos de validación (hardened)

Para exponer `start`, `authorize` y `test-flow` sin sesión durante validación:

- `TBK_ENV=integration`
- `ONECLICK_PUBLIC_VALIDATION_ENABLED=true`
- y además **al menos uno**:
  - `ONECLICK_VALIDATION_TOKEN=<secreto>` (header `x-oneclick-validation-token`)
  - `ONECLICK_VALIDATION_IP_ALLOWLIST=ip1,ip2`

En producción real (`TBK_ENV=production`) estos endpoints públicos quedan bloqueados.

## Errores comunes

- **Página en blanco al registrar**: La URL de retorno no es alcanzable. Usa ngrok.
- **"Falta TBK_TOKEN"**: El usuario canceló en Transbank o hubo un error de red.
- **Cobro falla al aceptar proveedor**: Verifica que el `email` del usuario en la DB coincida con el usado al registrar la tarjeta.

## Endpoint interno de validación automática

`POST /api/payments/oneclick/test-flow` (solo admin).

Permite ejecutar de forma controlada `start -> confirm -> authorize` usando la integración actual (sin bypass, sin cambio de headers).

Body mínimo:

```json
{
  "username": "usuario-validacion",
  "email": "validacion@maqgo.cl",
  "amount": 1000,
  "run_confirm": false,
  "run_authorize": false
}
```

Notas:
- Si no envías `buy_order`, el endpoint crea uno real en DB con `start`.
- Para `run_confirm=true`, debes incluir `token` válido.
- Para `run_authorize=true`, el `buy_order` debe estar `INSCRIBED` y con `tbk_user`.
- Respuesta incluye `buy_order`, resultados por paso y estado real en colección `payments_oneclick`.

## Evidencia estructurada para Transbank

Cada operación guarda evidencia en `oneclick_validation_events` con:
- `buy_order`
- `type` (`inscription_approved`, `inscription_rejected`, `authorize_approved`, `authorize_rejected`, `debit`, `installments`)
- `timestamp`
- `status`
- `detail` (incluye `incident_id` si aparece en errores WAF/Incapsula)

## Checklist pre-validación automática

- inscripción aprobada con `buy_order` real persistido en DB
- inscripción rechazada con evento registrado
- authorize aprobado con `buy_order` real y estado final `AUTHORIZED`
- authorize rechazado con evento registrado
- débito registrado como `type=debit` (cuando `payment_type_code` es `VD/VP`)
- cuotas registradas como `type=installments` (cuando `installments_number >= 2`)

## Logo para formulario de validación

Requisito operativo TBK: usar logo cuyo ancho sea exactamente `130px` (no una captura gigante con CSS).

Para el formulario de Transbank, usar el archivo `frontend/public/maqgo_logo_130.svg` (logo limpio, sin fondo negro, y auto-contenido).
