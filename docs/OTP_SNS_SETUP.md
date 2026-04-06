# OTP con Redis + LabsMobile – Guía rápida

Sistema OTP interno de MAQGO:
- código de 6 dígitos
- expiración 5 minutos
- máximo 3 intentos por código
- rate limit 3 solicitudes por 10 minutos

## Variables necesarias (backend)

Configurar en Railway (servicio backend):

```
REDIS_URL=rediss://...
LABSMOBILE_USERNAME=tomas@ejemplo.com
LABSMOBILE_API_TOKEN=TOKEN...
LABSMOBILE_SENDER=MAQGO
MAQGO_DEMO_MODE=false
MAQGO_ENV=production
```

## Verificación de readiness

1. Redeploy backend.
2. Revisar `GET /healthz/otp-readiness`.
3. Esperado:
   - `ready: true`
   - `redis_url_set: true`
   - `labsmobile_username_set: true`
   - `labsmobile_api_token_set: true`
   - `labsmobile_sender_set: true`

## Probar OTP

1. `POST /api/auth/send-otp`
   ```json
   {"phone":"+56912345678"}
   ```
2. `POST /api/auth/verify-otp`
   ```json
   {"phone":"+56912345678","code":"123456"}
   ```

## Errores frecuentes

- `Formato de teléfono inválido. Usa +569XXXXXXXX.`  
  El número no está en formato chileno válido.

- `Demasiados intentos...`  
  Se alcanzó el límite de 3 OTP cada 10 minutos.

- `Código expirado...`  
  El OTP venció (5 min), solicitar uno nuevo.

- `LabsMobile error XXX`  
  Revisar `LABSMOBILE_USERNAME`, `LABSMOBILE_API_TOKEN`, `LABSMOBILE_SENDER` y saldo/ruteo en LabsMobile.
