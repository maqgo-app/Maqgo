# Checklist Producción LIVE MAQGO

> **Proceso y velocidad:** ver también [QA_Y_LANZAMIENTO.md](QA_Y_LANZAMIENTO.md) (diagnóstico previo, Definition of Done, una sola fuente de verdad).

## Regla de despliegue (CTO)

No se autoriza deploy si no se cumple lo siguiente en este orden:

1. `./scripts/quality-gate.sh` en verde (frontend: `npm ci`, tests unit, build; ver script).
2. `./scripts/pre-deploy.sh` en verde **si tenés `backend/venv`** (tests Python + build); si no, la paridad backend queda en **GitHub Actions** al hacer push.
3. Registro del intento en `docs/DEPLOY_LOG.md`.

Script recomendado para centralizar la validación:

```bash
chmod +x scripts/quality-gate.sh scripts/deploy-cto.sh  # una vez
./scripts/deploy-cto.sh
```

`deploy-cto.sh` ejecuta `quality-gate.sh` y, si existe el venv del backend, `pre-deploy.sh`.

## Modo producción = inscripciones reales

Cuando `REACT_APP_BACKEND_URL` apunta a tu API de producción (no localhost):
- Los botones "Simular solicitud (Demo)" se ocultan automáticamente
- SMS reales vía Twilio (no código 123456)
- Transbank real (cobros reales si TBK_DEMO_MODE=false)

---

## Frontend (Vercel / Netlify / Railway unificado)

### 1. Variable obligatoria
**Split** (usuarios en `www`, API en otro host — típico `api.maqgo.cl` en Railway):
```
REACT_APP_BACKEND_URL=https://api.maqgo.cl
```
**Unificado** (mismo host `www` + `/api`, Dockerfile raíz en Railway):
```
REACT_APP_BACKEND_URL=https://www.maqgo.cl
```
Ver [MODELOS_DEPLOY.md](MODELOS_DEPLOY.md).
**Crítico:** Si no se define, el build usa `localhost:8000` y las llamadas fallan.

### 2. Build
```bash
cd frontend
REACT_APP_BACKEND_URL=https://api.maqgo.cl npm run build
# o unificado: REACT_APP_BACKEND_URL=https://www.maqgo.cl npm run build
```

---

## Backend (Railway / Render / etc.)

### 1. Copiar template producción
```bash
cp backend/.env.production.example backend/.env
# Editar .env y rellenar credenciales
```

### 2. Variables obligatorias para LIVE

| Variable | Producción | Descripción |
|----------|------------|-------------|
| `MAQGO_DEMO_MODE` | `false` | SMS reales (Twilio) |
| `TBK_DEMO_MODE` | `false` | Cobros Transbank reales |
| `TWILIO_ACCOUNT_SID` | (tu valor) | Obligatorio si MAQGO_DEMO_MODE=false |
| `TWILIO_AUTH_TOKEN` | (tu valor) | Obligatorio |
| `TWILIO_SMS_FROM` | +56... | Número Twilio Chile |
| `CORS_ORIGINS` | https://... | Dominios del frontend |

### 3. Transbank producción
- `TBK_ENV=production`
- Códigos de comercio y llave de producción
- `TBK_RETURN_URL` = URL pública (no localhost)

### 4. Verificar
```bash
curl https://www.maqgo.cl/api/
# o si el API está en subdominio: curl https://api.maqgo.cl/api/
```

---

## Toggle Disponibilidad

Si falla: usuario debe existir en MongoDB (colección `users`, campo `id`).

---

## Admin en producción

Para crear o activar el usuario admin en producción, ver **[ADMIN_INSTRUCCIONES.md](./ADMIN_INSTRUCCIONES.md)**.
