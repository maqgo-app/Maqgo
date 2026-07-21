# Pruebas Oneclick (Transbank) — ambiente integración

## Objetivo
Validar que:
- La inscripción (registro de tarjeta) funciona y retorna a MAQGO.
- La autorización (cobro) aprueba/rechaza según tarjetas de prueba Transbank.
- Se puede extraer evidencia (buy_order, tbk_user, response_code, etc.) para certificación/soporte.

## Variables necesarias (no commitear secretos)
Configurar en el entorno donde corre el backend:
- `TBK_ENV=integration`
- `TBK_PARENT_COMMERCE_CODE` (código mall entregado por Transbank)
- `TBK_CHILD_COMMERCE_CODE` (código hijo entregado por Transbank)
- `TBK_API_KEY_SECRET` (Api Key Secret entregada por Transbank)
- `TBK_RETURN_URL` (URL pública que apunte a `/api/payments/oneclick/confirm-return`)
- `FRONTEND_URL` (URL del frontend para que el retorno redirija a `/oneclick/complete`)

## Login por SMS (dev)
En dev, si no hay proveedor SMS/Redis, se puede activar OTP de desarrollo (solo no-prod):
- `OTP_DEV_MODE=true`
- `OTP_DEV_CODE=123456`
- `OTP_DEV_PHONES=+569XXXXXXXX,+569YYYYYYYY`

## Evidencia para Transbank (panel admin)
En `Admin → Marketing & CAC`, sección “Evidencia Oneclick (Transbank)”.
- Buscar por email del cliente.
- Copiar `buy_order`, `tbk_user`, `status`, `confirm_rc`, `auth_rc`, `auth_code`, `pay_type`.

## Credenciales de autenticación en Webpay (cuando aparezca)
- RUT: `11.111.111-1`
- Clave: `123`

