# MAQGO sin Vercel: dominio propio + un solo servicio (Railway)

Objetivo: que **`https://www.maqgo.cl`** (y opcionalmente `https://maqgo.cl`) sirva **la PWA y el API** desde **un solo despliegue** en Railway, sin depender del hosting de frontend en Vercel.

La guía clásica API-only sigue en [RAILWAY_PRODUCTION.md](RAILWAY_PRODUCTION.md). Este documento es el camino **unificado**.

---

## 1. Qué cambia en el repo

- **`Dockerfile`** en la **raíz** del monorepo: construye `frontend/` (Vite) y copia `dist` a `backend/static`; el contenedor ejecuta solo **uvicorn**.
- **`railway.json`** en la **raíz**: apunta a ese Dockerfile (cuando el servicio Railway usa el repo como raíz).
- **`server.py`**: si existe `backend/static/index.html`, monta el SPA en `/` y deja **`/api`** y **`/healthz`** como hoy.

El **`backend/Dockerfile`** sigue sirviendo para un despliegue **solo API** (sin tocar el frontend en el mismo contenedor).

---

## 2. Railway (migración desde “Root = backend”)

1. Abrí el servicio del API en Railway.
2. **Settings → Root Directory**: dejalo vacío o **`.`** (raíz del repo), **no** `backend`.
3. **Settings → Dockerfile path**: `Dockerfile` (el de la raíz).
4. Asegurate de que Railway use el **`railway.json` de la raíz** (si el dashboard duplica config, alinealo con este archivo).
5. **Variables de entorno** (runtime, como siempre):
   - `MONGO_URL`, `DB_NAME`, `MAQGO_ENV=production`, etc. (ver `backend/.env.example`).
   - **`FRONTEND_URL`** = `https://www.maqgo.cl` (redirects OneClick, emails, abandono).
   - **`CORS_ORIGINS`** debe incluir al menos:
     - `https://www.maqgo.cl`
     - `https://maqgo.cl` (si lo usás)
     - Podés quitar `https://maqgo.vercel.app` cuando ya no uses Vercel.

6. **Build-time** (recomendado): variable disponible en build con la URL pública final del servicio:
   - **`PUBLIC_API_BASE`** = `https://www.maqgo.cl` (sin `/` final)  
   En el Dockerfile se inyecta como `REACT_APP_BACKEND_URL` / `VITE_BACKEND_URL` para que el bundle llame al API en el **mismo origen** que los usuarios usan en el navegador.

   En Railway: creá la variable y marcala **“Available at Build Time”** (o el equivalente) para que exista durante `docker build`.

7. Hacé un **deploy** y verificá:
   - `GET https://www.maqgo.cl/healthz` → `{"status":"ok"}`
   - `GET https://www.maqgo.cl/` → HTML de la app (no el JSON viejo del backend).
   - Login o una pantalla que pegue al API.

---

## 3. DNS (donde compraste `maqgo.cl`)

**Importante:** los registros **no** se configuran en GitHub; la fuente de verdad del CNAME hacia Railway es **Show DNS records** en el panel. Ver **[DNS_RAILWAY_CLOUDFLARE.md](DNS_RAILWAY_CLOUDFLARE.md)**.

Apuntá el dominio al **hostname público que te da Railway** para ese servicio (Settings → Networking → **Generate domain** / dominio custom).

Registros típicos:

| Tipo | Nombre | Valor |
|------|--------|--------|
| **CNAME** | `www` | `tu-proyecto.up.railway.app` (o el target que indique Railway) |
| **A / ALIAS** | `@` (raíz) | Según el proveedor: a veces **CNAME flattening**, **ALIAS** a Railway, o redirección de `maqgo.cl` → `www.maqgo.cl` en el panel del DNS |

No podemos dictar el registro exacto sin ver tu proveedor (NIC Chile, Cloudflare, etc.): usá el asistente de **Custom domain** de Railway y copiá lo que te pida.

**Google Maps / APIs:** en restricciones por referrer agregá `https://www.maqgo.cl/*` y `https://maqgo.cl/*`; quitá `*.vercel.app` cuando ya no use previews en Vercel.

---

## 4. Transbank OneClick

Si antes **`TBK_RETURN_URL`** apuntaba a `https://api.maqgo.cl/api/payments/oneclick/confirm-return`, con todo en un solo host suele ser:

`https://www.maqgo.cl/api/payments/oneclick/confirm-return`

Actualizá **`TBK_RETURN_URL`** en Railway y lo que tengas declarado en el portal de Transbank para que coincida **exactamente** (HTTPS, sin mezclar dominios).

---

## 5. Quitar Vercel (cuando el nuevo deploy esté OK)

1. Verificá tráfico real en `www.maqgo.cl`.
2. En Vercel: desconectá el dominio custom si estaba enlazado; opcionalmente **pausá o borrá** el proyecto `maqgo`.
3. Limpiá referencias externas (Transbank, webhooks, emails) que aún citen `maqgo.vercel.app` o `api.maqgo.cl` si ya no aplican.

---

## 6. Problemas frecuentes

| Síntoma | Causa probable |
|---------|----------------|
| `/` devuelve JSON `maqgo-backend` | Imagen **solo API** (sin `static/`) o build raíz no usado. Revisá Root Directory + Dockerfile raíz. |
| La app carga pero el API falla | `PUBLIC_API_BASE` en build distinto del dominio real, o CORS sin tu origen. |
| 404 en rutas tipo `/client/...` | SPA: el servidor debe servir `index.html` en esas rutas; `StaticFiles(..., html=True)` lo resuelve. |
| OneClick no vuelve | `TBK_RETURN_URL` o `FRONTEND_URL` desalineados con el dominio nuevo. |

---

**Mantenimiento:** un solo dominio canónico para marketing y certificaciones reduce fricción (Transbank, SEO, PWA). Mantener `README` y `RAILWAY_PRODUCTION.md` alineados cuando el equipo deje Vercel del todo.
