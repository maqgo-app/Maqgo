# Checklist: `www.maqgo.cl` (público) + API en otro host (ej. `api2.maqgo.cl`)

Dominio que ve el usuario: **`https://www.maqgo.cl`**. El API puede tener **otro nombre** en DNS; no es error si CORS y el build están bien.

## Backend (Railway, carpeta `backend`)

1. **Root Directory:** `backend` · Dockerfile: `backend/Dockerfile` (como ahora).
2. **Custom domain:** `api2.maqgo.cl` → DNS según **Show DNS records** · puerto **8080**.
3. **Variables:** `FRONTEND_URL=https://www.maqgo.cl` · `CORS_ORIGINS=https://www.maqgo.cl,https://maqgo.cl` · `TBK_RETURN_URL=https://api2.maqgo.cl/api/payments/oneclick/confirm-return` (mismo host que atiende el API).

## Frontend (build)

4. En Vercel (o donde construyas): **`REACT_APP_BACKEND_URL=https://api2.maqgo.cl`** (sin `/` final) · redeploy tras cambiar.

## DNS (Cloudflare)

5. **`www`** → tu front (ej. Vercel) o CNAME que corresponda.
6. **`api`** → CNAME a Railway (**valor exacto** de Show DNS records).

## Probar

7. `https://api2.maqgo.cl/healthz` · abrir `https://www.maqgo.cl` y un flujo que llame al API (consola sin CORS).

Ver [MODELOS_DEPLOY.md](MODELOS_DEPLOY.md) y [DNS_RAILWAY_CLOUDFLARE.md](DNS_RAILWAY_CLOUDFLARE.md).
