# Railway + Vercel — guía a prueba de errores (MAQGO)

Objetivo: que **cualquiera del equipo** despliegue sin romper CORS, URLs ni el admin paginado.

**Nombre en Railway:** el **proyecto** suele llamarse p. ej. **`maqgo-prod-backend`**; el **servicio** dentro puede llamarse **Maqgo** y apuntar al repo **`maqgo-app/Maqgo`**. En el dashboard, abrí ese proyecto para variables, deploys y logs (no buscar solo la palabra “maqgo” si tu proyecto tiene otro nombre).

---

## 1. Orden sagrado (no negociable)

1. **Railway (backend API)** desplegado y **verde** (`/healthz` OK).
2. Copiar la **URL pública HTTPS** del servicio (ej. `https://tu-api.up.railway.app`).
3. **Vercel (frontend)**: variable `REACT_APP_BACKEND_URL` = esa URL **sin barra final**.
4. **Rebuild** del frontend en Vercel (nuevo build = URL de API “horneada” en el bundle).

> Si cambias solo Vercel sin rebuild, o el front apunta a `localhost` en el build de prod, **la app “no conecta”** y no es bug misterioso: es configuración.

---

## 2. Railway: qué servicio desplegar

- En el repo hay `backend/railway.json` y `backend/Dockerfile` → el **root del servicio** en Railway debe ser la carpeta **`backend`** (o el repo con *Root Directory* = `backend`).
- No despliegues la raíz del monorepo sin Dockerfile en raíz: fallará o construirá mal.

---

## 3. Variables de entorno mínimas (Railway → servicio API)

| Variable | Obligatorio | Notas |
|----------|-------------|--------|
| `MONGO_URL` | Sí | Atlas SRV o Mongo de Railway; **sin** comillas raras al pegar. |
| `DB_NAME` | Sí | Debe coincidir con la DB real en Atlas. Default en código: `maqgo_db` (`db_config.py`); en prod **definir explícito** si tu cluster usa otro nombre. |
| `CORS_ORIGINS` | Producción: Sí | Lista separada por comas. Incluye **`https://maqgo.vercel.app`** y tu dominio custom si existe. **No** uses `*` en prod si puedes evitarlo. |
| `FRONTEND_URL` | Muy recomendado | URL del front en prod (`https://maqgo.vercel.app`) para redirects/emails. |
| `MAQGO_ENV` | Recomendado | `production` cuando sea prod real (evita demos peligrosas). |

El resto (Twilio, Transbank, Redis, etc.) según `backend/.env.example`. **No** subas `.env` a Git.

---

## 4. Comprobar que el backend vivo responde

Desde el navegador o terminal:

```bash
curl -sS "https://TU-API.up.railway.app/healthz"
```

Debe devolver JSON con estado OK (no 404). Si 502/503: revisa logs de Railway (build fallido, crash al arrancar, Mongo inalcanzable).

---

## 5. Vercel: frontend

**Nombre en Vercel:** el proyecto del frontend se llama **`maqgo`** (URL pública típica **`https://maqgo.vercel.app`**). En el dashboard de Vercel, buscá **`maqgo`** para variables, deploys y dominios.

1. **Environment Variables** (Production):
   - `REACT_APP_BACKEND_URL` = `https://TU-API.up.railway.app` (sin `/` al final).
2. Opcional: `VITE_GOOGLE_MAPS_API_KEY` si usas mapas en prod.
3. Tras cambiar variables: **Redeploy** (ideal **Clear build cache** si el bundle parece viejo).

### Error típico en consola del navegador

`PRODUCCIÓN: BACKEND_URL apunta a localhost` → el build se hizo con URL incorrecta; corrige env y **vuelve a build**.

---

## 6. Admin paginado (backend nuevo)

El dashboard admin usa `GET /api/services/admin/all` con **`finances`** y paginación.  
**Despliega el backend nuevo antes** que el front que lo consume; si no, verás avisos en consola y métricas vacías.

Detalle técnico: `docs/DEPLOY_LOG.md` (entrada admin performance).

---

## 7. Tabla de “me equivoqué y ahora…”

| Síntoma | Causa probable | Qué hacer |
|---------|----------------|-----------|
| Front carga, todo falla al API | `REACT_APP_BACKEND_URL` mal / build viejo | Env + Redeploy Vercel |
| CORS error en consola | `CORS_ORIGINS` no incluye el dominio del front | Añadir origen exacto (https + host) en Railway, redeploy API |
| 502 en Railway | Crash Python / Mongo | Logs del servicio; validar `MONGO_URL` |
| Primera request muy lenta | Cold start (plan free/sleep) | Normal; o plan always-on |
| Admin lento con muchos datos | Backend viejo sin paginación | Desplegar último `services.py` admin |

---

## 8. Seguridad (no negociable)

- API pública: **JWT / admin** en rutas sensibles; no exponer claves en el repo.
- **Transbank / Twilio**: solo variables en Railway/Vercel, nunca en el cliente salvo las que sean públicas por diseño.

---

## 9. Checklist rápido antes de decir “está en prod”

- [ ] `GET /healthz` OK en la URL de Railway  
- [ ] `CORS_ORIGINS` incluye el dominio de Vercel  
- [ ] Vercel `REACT_APP_BACKEND_URL` = URL Railway (sin `/` final)  
- [ ] Redeploy frontend tras cambiar env  
- [ ] Login y una pantalla que llame API funcionan en incógnito  

---

**Mantenimiento:** si alguien cambia de dominio (custom domain), actualizar **CORS**, **FRONTEND_URL** y **rebuild** del front en el mismo día.
