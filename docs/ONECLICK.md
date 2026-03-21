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

## Errores comunes

- **Página en blanco al registrar**: La URL de retorno no es alcanzable. Usa ngrok.
- **"Falta TBK_TOKEN"**: El usuario canceló en Transbank o hubo un error de red.
- **Cobro falla al aceptar proveedor**: Verifica que el `email` del usuario en la DB coincida con el usado al registrar la tarjeta.
