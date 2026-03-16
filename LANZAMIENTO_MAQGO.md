# Lanzamiento MAQGO – Guía completa pre-producción

Todo lo que hay que revisar y hacer antes del lanzamiento, en orden.

---

## Paso 1: Ejecutar pre-deploy (automatizado)

Desde la raíz del proyecto:

```bash
chmod +x scripts/pre-deploy.sh
./scripts/pre-deploy.sh
```

Esto ejecuta:
- Tests unitarios (pricing, escenarios, QA maquinaria)
- Build de producción del frontend

**Si algo falla,** corregir antes de seguir. Si todo pasa, el script te recordará revisar CORS y variables de producción.

---

## Paso 2: Variables de entorno – Backend

1. Copia y configura:
   ```bash
   cp backend/.env.example backend/.env
   ```
2. En **producción** ajusta al menos:

   | Variable | Desarrollo | Producción |
   |----------|------------|------------|
   | `MONGO_URL` | `mongodb://localhost:27017` | Tu MongoDB Atlas (o servidor) |
   | `DB_NAME` | `maqgo_db` | Mismo o el que uses |
   | `CORS_ORIGINS` | `*` | **Lista de dominios**, ej: `https://app.maqgo.cl,https://maqgo.cl` |
   | `FRONTEND_URL` | `http://localhost:5173` | `https://app.maqgo.cl` (tu dominio front) |
   | `MAQGO_DEMO_MODE` | `true` | `false` para SMS reales (Twilio configurado) |
   | `TBK_DEMO_MODE` | `true` | `false` para Transbank real |
   | `TBK_ENV` | `integration` | `production` |
   | `TBK_RETURN_URL` | (ngrok o vacío) | `https://api.maqgo.cl/api/payments/oneclick/confirm-return` (o tu URL API) |

3. Opcionales: `RESEND_API_KEY`, `SENDER_EMAIL` (emails); Twilio (`TWILIO_*`) para SMS/WhatsApp.

El servidor muestra **warnings** al arrancar si `CORS_ORIGINS=*`, `MAQGO_DEMO_MODE=true` o `TBK_DEMO_MODE=true` para que no se te pasen en producción.

---

## Paso 3: Variables de entorno – Frontend (build producción)

1. Para build de producción:
   ```bash
   cp frontend/.env.production.example frontend/.env.production
   ```
2. En `frontend/.env.production` pon:
   - `REACT_APP_BACKEND_URL` (o `VITE_BACKEND_URL`) = URL de tu API en producción, ej: `https://api.maqgo.cl`
3. Luego:
   ```bash
   cd frontend && npm run build
   ```
   El contenido de `frontend/dist` es lo que subes al hosting (Vercel, Netlify, etc.).

---

## Paso 4: CORS

- En producción **no** dejes `CORS_ORIGINS=*`.
- En `backend/.env`:
  ```bash
  CORS_ORIGINS=https://app.maqgo.cl,https://maqgo.cl
  ```
  (Usa tus dominios reales, separados por coma, sin espacios.)

---

## Paso 5: Checklist manual – Flujos

Antes de dar por cerrado el lanzamiento, prueba una vez cada flujo:

- [ ] **Proveedor:** Registro → Onboarding P1–P6 → Revisión → Confirmar → Home.
- [ ] **Cliente:** Maquinaria → Ubicación → Proveedores → Confirmar → (pago en staging si aplica) → Búsqueda.
- [ ] **Operador:** Desde Mi Equipo generar invitación (nombre + RUT) → En otro dispositivo/navegador ingresar código → Unirse.
- [ ] **Una reserva completa:** Cliente pide → Proveedor acepta → En camino → Llegada → Servicio activo → Finalizar → (subir factura si aplica).

---

## Paso 6: Desplegar

1. **Backend:** Despliega la API (Railway, Render, Fly.io, etc.) con las variables de `backend/.env` configuradas en el panel del servicio.
2. **Frontend:** Despliega `frontend/dist` (o conecta el repo y que el hosting haga `npm run build` con `.env.production`).
3. Verifica que la app en producción llame a la URL correcta de la API (sin localhost).

---

## Resumen rápido

| Qué | Dónde | Acción |
|-----|--------|--------|
| Tests + build | Raíz | `./scripts/pre-deploy.sh` |
| Env backend | `backend/.env` | CORS, FRONTEND_URL, MONGO, demo flags |
| Env frontend prod | `frontend/.env.production` | REACT_APP_BACKEND_URL |
| CORS | `backend/.env` | `CORS_ORIGINS=https://tudominio.cl` |
| Flujos | Manual | Checklist Paso 5 |

---

## Documentos relacionados

- `PRE_PRODUCCION.md` – Resumen de revisiones y pruebas.
- `docs/QA_PRODUCCION_MVP.md` – QA pre-producción y correcciones aplicadas.
- `CHECKLIST_MVP_CERRADO.md` – Alcance MVP y conocido pos-MVP.
- `CORRER.md` – Cómo correr backend y frontend en local.
