# MAQGO – Integraciones para lanzar (a prueba de tontos)

**Orden:** hacer una por una. Marca ✓ cuando termines cada paso.

---

## Paso 1: Lo que dice tu proyecto (según docs y config)

| Pregunta | Lo que encontré en el proyecto |
|----------|-------------------------------|
| **¿Frontend en Vercel?** | Sí – hay `frontend/vercel.json` y docs de deploy |
| **URL del frontend** | `https://www.maqgo.cl` (o `maqgo-xxx.vercel.app` si aún no tienes dominio) |
| **¿Backend desplegado?** | No se ve en el repo – depende de si lo subiste a Railway |
| **URL del backend (objetivo)** | `https://api.maqgo.cl` (o `xxx.up.railway.app` si usas Railway sin dominio) |
| **Variables actuales** | `frontend/.env`: `REACT_APP_BACKEND_URL=http://localhost:8000` (solo local) |
| **Backend .env** | `MONGO_URL=localhost`, `FRONTEND_URL=localhost`, sin `CORS_ORIGINS` (usa `*`) |

**Resumen:** El frontend está pensado para Vercel y el backend para Railway. Las URLs objetivo son `www.maqgo.cl` y `api.maqgo.cl`. En local todo apunta a localhost.

**Tu caso:** Si ya tienes MAQGO live en Vercel, entra a vercel.com → tu proyecto → la URL será algo como `maqgo-abc123.vercel.app` o `www.maqgo.cl` si configuraste el dominio.

- [ ] Paso 1 revisado

---

## Paso 2: Integración 1 – URL del backend (Vercel)

**Qué hace:** Le dice al frontend dónde está tu API.

**Dónde:** Vercel → tu proyecto MAQGO → Settings → Environment Variables

**Qué hacer:**
1. Clic en **Add New** (o editar si ya existe)
2. **Name:** `REACT_APP_BACKEND_URL`
3. **Value:** La URL de tu backend (ej: `https://api.maqgo.cl` o `https://tu-proyecto.up.railway.app`)
   - Sin barra final
   - Debe ser `https://` en producción
4. **Environment:** marca Production (y Preview si quieres)
5. Guardar
6. **Redeploy:** Deployments → ⋮ del último → Redeploy

**Verificar:** Abre tu app en Vercel. Si al hacer login o ver proveedores no sale "No se pudo conectar", está bien.

- [ ] Paso 2 hecho

---

## Paso 3: Integración 2 – Backend desplegado (Railway u otro)

**Qué hace:** El servidor que guarda usuarios, reservas, etc.

**Si NO tienes backend desplegado:**
- La app se abre pero login, reservas, proveedores fallan
- Necesitas desplegar el backend (Railway es lo más simple)

**Dónde:** https://railway.app

**Qué hacer (resumen):**
1. Conectar tu repo de GitHub
2. Elegir la carpeta `backend` (o `Maqgo1-main/backend`)
3. Railway te da una URL (ej: `https://maqgo-production.up.railway.app`)
4. Esa URL es la que pones en Paso 2 como `REACT_APP_BACKEND_URL`

**Verificar:** Abre `https://tu-url.up.railway.app/api/` en el navegador. Deberías ver algo tipo JSON (no error 404).

- [ ] Paso 3 hecho

---

## Paso 4: Integración 3 – Base de datos (MongoDB Atlas)

**Qué hace:** Donde se guardan usuarios, reservas, proveedores.

**Dónde:** https://cloud.mongodb.com

**Qué hacer (resumen):**
1. Crear cuenta / cluster gratis
2. Crear usuario (ej: maqgouser) y guardar contraseña
3. Añadir IP 0.0.0.0/0 en Network Access
4. Copiar la URL de conexión (mongodb+srv://...)
5. Sustituir `<password>` por tu contraseña
6. Añadir `/maqgo_db` antes del `?` en la URL

**Dónde ponerla:** Railway → tu proyecto → Variables → `MONGO_URL` = esa URL

**Verificar:** Si el backend arranca sin error de conexión a MongoDB, está bien.

- [ ] Paso 4 hecho

---

## Paso 5: Integración 4 – CORS (variables del backend)

**Qué hace:** Permite que tu frontend (Vercel) hable con el backend.

**Dónde:** Railway → tu proyecto → Variables

**Qué añadir/editar:**

| Variable | Valor |
|----------|-------|
| `CORS_ORIGINS` | `https://tu-app.vercel.app,https://www.maqgo.cl` |
| `FRONTEND_URL` | `https://tu-app.vercel.app` (o tu dominio) |

- Usa la URL exacta de tu frontend en Vercel
- Sin espacios, separadas por coma
- Si tienes www.maqgo.cl, inclúyela también

**Verificar:** Abre tu app, intenta login. Si sale error de CORS en la consola (F12), revisa que la URL en CORS_ORIGINS coincida exactamente.

- [ ] Paso 5 hecho

---

## Paso 6: Variables mínimas del backend (Railway)

**Resumen de lo que debe tener el backend en Railway:**

| Variable | Valor ejemplo |
|----------|--------------|
| `MONGO_URL` | mongodb+srv://user:pass@cluster.mongodb.net/maqgo_db?retryWrites=true |
| `DB_NAME` | maqgo_db |
| `CORS_ORIGINS` | https://tu-app.vercel.app |
| `FRONTEND_URL` | https://tu-app.vercel.app |
| `MAQGO_DEMO_MODE` | true (SMS con código 123456) |
| `TBK_DEMO_MODE` | true (pagos en modo demo) |

Con esto la app funciona en modo demo (login 123456, pagos simulados).

- [ ] Paso 6 hecho

---

## Opcionales (después del lanzamiento)

| Integración | Para qué | Sin ella |
|-------------|----------|----------|
| **Twilio** | SMS reales | Código 123456 funciona |
| **Transbank** | Cobros reales | Modo demo / Continuar sin tarjeta |
| **Google Maps** | Autocompletar direcciones | El usuario escribe a mano |

---

## Checklist final

- [ ] Paso 1 – Sabes qué tienes
- [ ] Paso 2 – REACT_APP_BACKEND_URL en Vercel
- [ ] Paso 3 – Backend desplegado
- [ ] Paso 4 – MongoDB configurado
- [ ] Paso 5 – CORS configurado
- [ ] Paso 6 – Variables mínimas en Railway

Cuando todo esté ✓, prueba: registro → código 123456 → flujo cliente hasta ver proveedores.
