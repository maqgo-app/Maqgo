# Cómo correr MAQGO

> Última actualización: marzo 2025

---

## Paso 1: Abrir terminal e ir al proyecto

```bash
cd /ruta/a/tu/Maqgo1-main
```

---

## Paso 2: Backend (Terminal 1)

**Primera vez (opcional):** Si quieres usuarios y servicios de prueba:

```bash
cd backend
./venv/bin/python seed_demo_users.py
./venv/bin/python seed_demo_services.py
```

El segundo comando crea cobros demo para el proveedor (proveedor@demo.cl). Así Mis Cobros mostrará datos.

Para QA con usuarios reales, registra desde la app (Empezar ahora).

**SMS de verificación (Twilio):** Por defecto usa código demo `123456`. Para recibir SMS reales, añade en `backend/.env`:

```
MAQGO_DEMO_MODE=false
TWILIO_ACCOUNT_SID=tu_account_sid
TWILIO_AUTH_TOKEN=tu_auth_token
TWILIO_SMS_FROM=+1234567890
```

(Opcional) Si usas Twilio Verify: `TWILIO_VERIFY_SERVICE=VA...` en lugar de `TWILIO_SMS_FROM`.

Luego iniciar el servidor:

```bash
./venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

**Si sale "Address already in use"** (puerto 8000 ocupado):

- Opción A – Liberar el puerto (matar el proceso que lo usa):
  ```bash
  lsof -ti:8000 | xargs kill -9
  ```
  Luego vuelve a ejecutar el comando de uvicorn.

- Opción B – Usar otro puerto (ej. 8002):
  ```bash
  ./venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8002 --reload
  ```
  Si usas 8002, después en el frontend tendrás que poner en `.env`:  
  `REACT_APP_BACKEND_URL=http://localhost:8002`

---

## Paso 3: Frontend (Terminal 2 – nueva ventana)

**Primero** vuelve a la carpeta del proyecto (no dentro de `backend`):

```bash
cd frontend
npm install
npm run start
```

La URL que debes abrir es la que muestre Vite en la terminal. Suele ser:
**http://localhost:5174**

**Si el puerto 5174 está ocupado**, Vite usará otro (5175, etc.). Mira en la terminal la línea que dice `➜  Local:   http://localhost:XXXX/` y abre esa URL.

**Si quieres liberar el 5174:**
```bash
lsof -ti:5174 | xargs kill -9
```

---

## Resumen

| Qué        | Dónde ejecutar              | Comando |
|-----------|-----------------------------|---------|
| Backend   | `.../Maqgo1-main/backend`   | `./venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload` |
| Frontend  | `.../Maqgo1-main/frontend`  | `npm run start` |

**No pegues todo en una sola terminal:** cada bloque va en su propia terminal (una para backend, otra para frontend). Los comentarios con `#` no se ejecutan; solo los comandos.

---

## Quality Gate (recomendado antes de merge/deploy)

En la raiz del proyecto:

```bash
./scripts/quality-gate.sh
```

Este comando valida:

- tests backend (unit + escenarios),
- lint frontend,
- tests unitarios frontend,
- build frontend.

Para pre-lanzamiento puedes usar:

```bash
./scripts/pre-deploy.sh
```

Para flujo controlado de despliegue (rol CTO):

```bash
./scripts/deploy-cto.sh production
```

---

## Si el frontend no arranca

1. **Reinstalar dependencias:**
   ```bash
   cd frontend
   rm -rf node_modules package-lock.json
   npm install
   npm run start
   ```

2. **Borrar caché de Vite:**
   ```bash
   rm -rf node_modules/.vite
   npm run start
   ```

3. **Verificar versión de Node:** se recomienda Node 18 o superior (`node -v`).
