# Checklist: todo en `www.maqgo.cl` (Railway unificado + Cloudflare)

Si el front está en **www** y el API en **api** (split), usá **[CHECKLIST_SPLIT_WWW_API.md](CHECKLIST_SPLIT_WWW_API.md)**.

**El repo ya está listo** (`Dockerfile` raíz, `server.py` sirve el SPA). **Lo del panel lo hacés vos** en Railway/Cloudflare.

## A. Railway (una vez)

1. **Settings → Root Directory:** vacío o `.` (**no** `backend`).
2. **Build:** Dockerfile = **`Dockerfile`** en la **raíz** del repo (no `backend/Dockerfile`).
3. Variable de **build** (marcar disponible en build): **`PUBLIC_API_BASE`** = `https://www.maqgo.cl`
4. Variables **runtime:** `FRONTEND_URL=https://www.maqgo.cl`, `CORS_ORIGINS=https://www.maqgo.cl,https://maqgo.cl`, `TBK_RETURN_URL=https://www.maqgo.cl/api/payments/oneclick/confirm-return` (+ Mongo, etc.).
5. **Networking:** si estás en el **límite de dominios**, **eliminá** cualquier custom `api*.maqgo.cl` que no uses.
6. **Add custom domain:** `www.maqgo.cl` → **Show DNS records** → copiá CNAME (y TXT si pide).
7. **Puerto de destino del dominio:** **8080** (igual que `*.up.railway.app`).
8. **Deploy** y esperá build verde.

## B. Cloudflare

9. **DNS:** CNAME **`www`** → valor **exacto** de **Show DNS records** (no uses `cname.vercel-dns.com` si ya migraste el front a Railway).
10. Opcional: redirigir **`maqgo.cl`** → `https://www.maqgo.cl`.

## C. Probar

11. `https://www.maqgo.cl/healthz` → `ok`
12. `https://www.maqgo.cl/` → carga la app

## D. Después

13. Transbank / Maps referrers: dominio `www.maqgo.cl`.
14. Vercel: sacar dominio / proyecto si ya no se usa.

Más detalle: [DEPLOY_SIN_VERCEL.md](DEPLOY_SIN_VERCEL.md).
