# MAQGO - Marketplace de Maquinaria Pesada :tractor:

**ADVERTENCIA CRÍTICA - CONFIGURACIÓN VERCEL:**
IMPORTANTE:
Este proyecto usa Vercel con configuración fija en el dashboard.
NO modificar vercel.json bajo ninguna circunstancia.
NO mover la carpeta /frontend.
NO crear index.html en la raíz del proyecto.
Todo el frontend vive en /frontend y el build genera /frontend/dist.
Cualquier cambio debe respetar que el deploy se construye desde /frontend.

**Trabajo local:** esta carpeta **`Maqgo/`** es la que debés conservar; el remoto es **`maqgo-app/Maqgo`**. Carpetas duplicadas (`Maqgo1-main`, etc.) son opcionales — si borrás una copia extra, no perdés el proyecto mientras tengas el repo en GitHub y clones de nuevo cuando quieras.

Aplicación móvil (PWA) para arriendo de maquinaria pesada con operador en Chile.

## URL de producción

Dominio público objetivo: **`https://www.maqgo.cl`** (canonical en `index.html` y `manifest.json`).

- **Deploy:** modelos **split** (www + API) vs **unificado** → **[docs/MODELOS_DEPLOY.md](docs/MODELOS_DEPLOY.md)** · checklists **[CHECKLIST_SPLIT_WWW_API.md](docs/CHECKLIST_SPLIT_WWW_API.md)** · **[CHECKLIST_WWW_MAQGO_CL.md](docs/CHECKLIST_WWW_MAQGO_CL.md)** · **[DEPLOY_SIN_VERCEL.md](docs/DEPLOY_SIN_VERCEL.md)**.
- **Opción histórica:** frontend en Vercel (`maqgo` → `https://maqgo.vercel.app`) + API en Railway; sigue **[docs/RAILWAY_PRODUCTION.md](docs/RAILWAY_PRODUCTION.md)**.

### Backend en Railway + env (producción)

En **Railway** el proyecto del API suele llamarse p. ej. **`maqgo-prod-backend`** (servicio **Maqgo**). Repo GitHub: **`maqgo-app/Maqgo`**. Guía: **[docs/RAILWAY_PRODUCTION.md](docs/RAILWAY_PRODUCTION.md)**.

**MongoDB (`MONGO_URL`, `DB_NAME` únicos):** [docs/DATABASE.md](docs/DATABASE.md) · verificación: `cd backend && python scripts/verify_db_config_convention.py`

**UX (toasts, errores HTTP, historial en prod):** [docs/UX_FEEDBACK.md](docs/UX_FEEDBACK.md).

**QA embudo cliente (Welcome → pago):** [docs/QA_FUNNEL_CLIENTE.md](docs/QA_FUNNEL_CLIENTE.md) · **Monitoreo mínimo prod:** [docs/MONITOREO_MINIMO_PROD.md](docs/MONITOREO_MINIMO_PROD.md) · **Secretos / `.env`:** [docs/SEGURIDAD_SECRETOS.md](docs/SEGURIDAD_SECRETOS.md).

## 🚀 Correr Localmente

### Requisitos
- Node.js 18+
- Python 3.9+
- MongoDB (local o Atlas)

### 1. Clonar y configurar

```bash
# Clonar el repositorio
git clone <tu-repo>
cd maqgo

# Configurar MongoDB (crear archivo backend/.env; DB_NAME debe coincidir con db_config / .env.example)
echo "MONGO_URL=mongodb://localhost:27017" > backend/.env
echo "DB_NAME=maqgo_db" >> backend/.env
```

### 2. Instalar y correr Backend

```bash
cd backend
# Opción A: usar venv existente
./venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload
# Opción B: crear venv e instalar
python3 -m venv venv && source venv/bin/activate  # o venv\Scripts\activate en Windows
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Instalar y correr Frontend

```bash
cd frontend
# El archivo .env con REACT_APP_BACKEND_URL=http://localhost:8000 ya está configurado
npm install
npm run start
# o: yarn install && yarn start
```

### 4. Abrir en navegador
- Frontend: http://localhost:5174
- Backend API: http://localhost:8000/api/

---

## 📱 Demo Rápida

### Credenciales de prueba:
- **Código SMS**: `123456` (hardcodeado para demo)

### Flujo Cliente:
1. Abrir http://localhost:5174
2. Click "Empezar ahora"
3. Registrarse con cualquier email/teléfono
4. Código SMS: `123456`
5. Seleccionar "Soy Cliente"
6. Elegir "Reserva inmediata"
7. Seguir el flujo completo

### Flujo Proveedor:
1. Registrarse como nuevo usuario
2. Seleccionar "Soy Proveedor"
3. Completar onboarding (datos, máquina, fotos, operador)
4. Activar toggle "Disponible"
5. Click "Simular solicitud entrante" para ver el flujo

---

## 🚀 Antes de producción / Lanzamiento

| Script | Qué hace |
|--------|-----------|
| `./scripts/quality-gate.sh` | Frontend: `npm ci`, tests unit, build (igual job frontend en GitHub Actions). |
| `./scripts/pre-deploy.sh` | Si existe `backend/venv`: tests Python + build frontend + avisos de `.env`. |
| `./scripts/deploy-cto.sh` | Ejecuta `quality-gate.sh` + `pre-deploy.sh` cuando hay venv. |

```bash
chmod +x scripts/quality-gate.sh scripts/deploy-cto.sh   # una vez
./scripts/deploy-cto.sh
```

**Checklist y variables LIVE:** `docs/PRODUCCION.md` · **QA y una sola fuente de verdad:** `docs/QA_Y_LANZAMIENTO.md` · **Setup local:** `CORRER.md`.

---
---

## 🗺️ Google Maps en Producción

Para que el autocompletado de direcciones funcione en producción:

1. Crear una API key nueva en Google Cloud.
2. Habilitar solo estas APIs:
   - Maps JavaScript API
   - Places API
3. Restringir la key por **HTTP referrers**:
   - `https://maqgo.cl/*`
   - `https://www.maqgo.cl/*`
   - `https://*.vercel.app/*` (si usas previews)
4. Restringir la key por **API restrictions** a Maps JavaScript + Places.
5. Configurar en deploy (Railway build/env o Vercel si aún usás front ahí):
   - `VITE_GOOGLE_MAPS_API_KEY=<tu_key>`
6. Redeploy y prueba rápida:
   - En ubicación escribe una dirección (ej: "Av. Providencia 1234")
   - Verifica que aparezcan sugerencias y permita continuar

> Seguridad: nunca subas una key real al repositorio. Usa variables de entorno.


## 🏗️ Estructura del Proyecto

```
/app
├── backend/
│   ├── server.py          # API FastAPI principal
│   ├── routes/
│   │   ├── auth.py        # Autenticación
│   │   ├── providers.py   # Proveedores
│   │   └── service_requests.py  # Solicitudes
│   └── requirements.txt
│
└── frontend/
    ├── public/
    │   ├── maqgo-logo-transparent.png
    │   └── notification.wav
    └── src/
        ├── App.jsx
        ├── components/
        │   ├── BottomNavigation.js
        │   └── MaqgoComponents.js
        ├── screens/
        │   ├── client/      # 15+ pantallas cliente
        │   └── provider/    # 10+ pantallas proveedor
        └── styles/
            └── maqgo.css
```

---

## 🎨 Diseño

- **Tema**: Industrial oscuro (#1A1A1A, #2D2D2D)
- **Accent**: Naranja MAQGO (#EC6819)
- **Inputs**: Crema (#F5EFE6)
- **Estilo**: Flat, sin gradientes ni sombras

---

## ⚙️ Integraciones Pendientes (Mockeadas)

| Servicio | Estado | Para qué |
|----------|--------|----------|
| Twilio | ✅ Real | SMS y WhatsApp reales (configurar credenciales en .env) |
| MercadoPago | 🔶 Mock | Pagos reales |
| Google Maps | 🔶 Mock | Ubicación/mapa |
| Firebase | ❌ | Push notifications |

---

## 📋 Funcionalidades MVP

### Cliente ✅
- [x] Registro/Login con SMS
- [x] Reserva inmediata y programada
- [x] Selección de maquinaria (10 tipos)
- [x] Ver proveedores disponibles
- [x] Confirmación con desglose de precios
- [x] Tracking de llegada
- [x] Timer 30 minutos
- [x] Rating bidireccional
- [x] Historial de servicios

### Proveedor ✅
- [x] Onboarding completo
- [x] Registro de maquinaria con fotos
- [x] Toggle de disponibilidad
- [x] Recepción de solicitudes (60s countdown)
- [x] Alerta con sonido/vibración
- [x] Desglose de ganancia neta (con tarifa plataforma)
- [x] Voucher PDF y subida de factura a MAQGO
- [x] Rating a clientes
- [x] Historial de trabajos

### Reglas de Negocio ✅
- [x] Comisión MAQGO 10% + IVA cliente · 10% + IVA proveedor
- [x] Colación 1hr para servicios ≥6hrs
- [x] Regla 30 minutos de acceso
- [x] Garantía precio/ETA
- [x] Sin contacto directo (anti-bypass)

---

## 🇨🇱 Hecho para Chile

- Prefijo telefónico +56
- Formato RUT chileno
- Moneda CLP
- IVA 19%
- Español chileno

---

**MAQGO** - Maquinaria pesada donde la necesites 🚜
deploy real Tue Mar 31 13:40:41 -03 2026
