# DNS: Railway + Cloudflare (fuente de verdad)

## Errores frecuentes

1. **“Ya lo configuré en GitHub”**  
   **GitHub no sirve registros DNS** para `maqgo.cl`. Los registros viven en **Cloudflare** (o en el DNS que uses). Lo que haya en el repo son **ejemplos o documentación**, no lo que resuelve el mundo.

2. **CNAME `api` → `maqgo-production.up.railway.app`**  
   La URL pública por defecto del servicio (`*.up.railway.app`) **no tiene por qué ser** el **destino del CNAME** que Railway exige para un **dominio personalizado** (`api.maqgo.cl`).  
   Para dominios custom, Railway suele mostrar un **hostname distinto** (ej. `abcd1234.up.railway.app`) en **Networking → Custom domain → Show DNS records**.

   **Regla:** copiá **exactamente** lo que dice **Show DNS records** en el momento. Si Railway cambia el target tras recrear el dominio, **actualizá Cloudflare**.

3. **TXT `_railway-verify`**  
   Si Railway lo muestra, agregalo en Cloudflare hasta que el dominio pase de *Waiting for DNS* a activo. Luego podés dejarlo según la doc actual de Railway.

## Checklist mínimo (api.maqgo.cl)

1. Railway → servicio → **Settings → Networking** → dominio `api.maqgo.cl` → **Show DNS records**.
2. Cloudflare → **DNS** → mismo **Type / Name / Value** que Railway (normalmente **CNAME** `api` → valor que indique Railway).
3. Proxy: **DNS only** (nube gris) mientras validás; después podés probar proxy naranja.
4. Esperá propagación (minutos; a veces más).

## www y Vercel

Si **`www`** apunta a `cname.vercel-dns.com`, el front sigue en Vercel hasta que cambiés ese CNAME (por ejemplo hacia el target que dé Railway para `www.maqgo.cl`). Eso es **independiente** del arreglo de `api`.
