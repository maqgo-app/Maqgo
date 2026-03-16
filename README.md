# MAQGO - Marketplace de Maquinaria Pesada 🚜

Aplicación móvil (PWA) para arriendo de maquinaria pesada con operador en Chile.

> **MVP cerrado** — Ver `CHECKLIST_MVP_CERRADO.md` para el alcance entregado.

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

# Configurar MongoDB (crear archivo backend/.env)
echo "MONGO_URL=mongodb://localhost:27017/maqgo" > backend/.env
echo "DB_NAME=maqgo" >> backend/.env
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

Ejecutar **`./scripts/pre-deploy.sh`** (tests + build) y seguir la guía **`LANZAMIENTO_MAQGO.md`** (env, CORS, checklist y deploy).

---

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
        ├── App.js
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
