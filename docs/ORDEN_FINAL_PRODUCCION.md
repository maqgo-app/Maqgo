# Orden final: correcciones antes de entrar a producción

**MAQGO** – App de arriendo de maquinaria pesada (Chile)  
**Fecha:** Febrero 2026  
**Objetivo:** Checklist de cambios obligatorios antes del lanzamiento en producción.

---

## 1. Variables de entorno (obligatorio)

### Backend (`backend/.env`)

| Variable | Desarrollo | Producción | Notas |
|---------|------------|------------|-------|
| `MONGO_URL` | `mongodb://localhost:27017` | URL de MongoDB Atlas o cluster productivo | Nunca exponer credenciales en código |
| `DB_NAME` | `maqgo_db` | `maqgo_db` o nombre productivo | |
| `MAQGO_DEMO_MODE` | `true` | **`false`** | Obligatorio: desactiva código demo SMS (123456) |
| `TBK_DEMO_MODE` | `true` | **`false`** | Obligatorio: activa Transbank real |
| `TBK_ENV` | `integration` | **`production`** | Ambiente Transbank |
| `TBK_PARENT_COMMERCE_CODE` | 597055555541 | Código comercio real | Obtener de Transbank |
| `TBK_CHILD_COMMERCE_CODE` | 597055555542 | Código tienda real | Obtener de Transbank |
| `TBK_API_KEY_SECRET` | Llave de integración | **Llave de producción** | Nunca commitear |
| `TBK_RETURN_URL` | vacío o ngrok | **URL pública HTTPS** | Ej: `https://app.maqgo.cl/api/payments/oneclick/confirm-return` |
| `FRONTEND_URL` | `http://localhost:5174` | **`https://app.maqgo.cl`** (o tu dominio) | Para redirects y enlaces |
| `CORS_ORIGINS` | `*` (default) | **`https://app.maqgo.cl`** (lista separada por coma) | Restringir orígenes permitidos |

### Twilio (SMS y WhatsApp)

| Variable | Producción |
|---------|------------|
| `TWILIO_ACCOUNT_SID` | Cuenta Twilio productiva |
| `TWILIO_AUTH_TOKEN` | Token de producción |
| `TWILIO_SMS_FROM` | Número comprado (ej: +56912345678) |
| `TWILIO_VERIFY_SERVICE` | (Opcional) Service SID de Verify |

### Frontend (`frontend/.env` o variables de build)

| Variable | Producción |
|---------|------------|
| `REACT_APP_BACKEND_URL` | **`https://api.maqgo.cl`** (o URL del API) |
| `VITE_GOOGLE_MAPS_API_KEY` | API key de Maps (producción) |
| `REACT_APP_WHATSAPP_SUPPORT` | Número de soporte (ej: +56994336579) |

---

## 2. Seguridad (prioridad alta)

### 2.1 CORS

**Problema:** Si `CORS_ORIGINS` no está definido, el backend usa `*` (permite cualquier origen).

**Acción:** En producción, definir explícitamente:

```bash
CORS_ORIGINS=https://app.maqgo.cl,https://www.maqgo.cl
```

### 2.2 Rate limiting

**Problema:** No hay rate limiting en endpoints sensibles (login, SMS, pagos).

**Acción:** Añadir rate limiting en:
- `POST /api/auth/login`
- `POST /api/communications/sms/send-otp`
- `POST /api/communications/sms/verify-otp`
- `POST /api/payments/*`
- `POST /api/chatbot/send`

**Sugerencia:** Usar `slowapi` o middleware de FastAPI para limitar peticiones por IP.

### 2.3 Credenciales demo

**Problema:** Usuarios y códigos demo (`cliente@demo.cl`, `DEMO01`, etc.) no deben existir en producción.

**Acción:**
- No ejecutar `seed_demo_users.py` ni `seed_demo_services.py` en producción
- O crear script de limpieza que elimine usuarios/códigos demo antes del go-live

---

## 3. Transbank OneClick

### 3.1 URL de retorno

**Problema:** Transbank no puede alcanzar `localhost`. La URL de retorno debe ser pública.

**Acción:** Configurar `TBK_RETURN_URL` con la URL real del backend:

```
TBK_RETURN_URL=https://api.maqgo.cl/api/payments/oneclick/confirm-return
```

### 3.2 Ambiente y llaves

**Acción:**
- Cambiar `TBK_ENV=production`
- Usar códigos de comercio y llave secreta de producción (Transbank entrega estos al aprobar el comercio)

---

## 4. Base de datos

### 4.1 MongoDB

**Acción:**
- Usar MongoDB Atlas o cluster gestionado (no localhost)
- Habilitar autenticación y conexión TLS
- Configurar backups automáticos
- Revisar índices para consultas frecuentes

---

## 5. Frontend

### 5.1 URLs

**Acción:** En el build de producción, `REACT_APP_BACKEND_URL` debe apuntar al API real. Ejemplo en Vercel/Netlify:

```
REACT_APP_BACKEND_URL=https://api.maqgo.cl
```

### 5.2 Google Maps

**Acción:** Usar API key de producción con restricciones (dominio, APIs habilitadas).

### 5.3 Console warnings

**Acción:** El `console.warn` de `api.js` cuando no hay `REACT_APP_BACKEND_URL` solo aparece en desarrollo. En producción, la variable debe estar definida.

---

## 6. Infraestructura recomendada

| Componente | Sugerencia |
|------------|------------|
| Backend | Deploy en Railway, Render, AWS, GCP o similar |
| Frontend | Vercel, Netlify o CDN estático |
| Base de datos | MongoDB Atlas |
| Dominio | HTTPS obligatorio (Let's Encrypt o certificado comercial) |
| Logs | Configurar logging centralizado (ej: Papertrail, Logtail) |

---

## 7. Checklist final (orden de ejecución)

- [ ] **1.** Crear archivo `backend/.env.production` (o configurar en el host) con todas las variables de producción
- [ ] **2.** `MAQGO_DEMO_MODE=false` y `TBK_DEMO_MODE=false`
- [ ] **3.** Configurar `CORS_ORIGINS` con dominios permitidos
- [ ] **4.** Configurar Twilio con credenciales reales
- [ ] **5.** Configurar Transbank: `TBK_ENV=production`, códigos y llave reales, `TBK_RETURN_URL` público
- [ ] **6.** `MONGO_URL` apuntando a cluster productivo
- [ ] **7.** `FRONTEND_URL` y `REACT_APP_BACKEND_URL` con URLs finales
- [x] **8.** ~~Implementar rate limiting~~ (hecho: auth, SMS, chatbot, oneclick)
- [x] **8b.** ~~Validación email y celular~~ (frontend + backend)
- [ ] **9.** (Opcional) Eliminar o deshabilitar usuarios/códigos demo
- [ ] **10.** Probar flujo completo: registro → SMS real → reserva → pago Transbank real → WhatsApp

---

## 8. Dependencias nuevas

Tras actualizar el código, instalar dependencias del backend:

```bash
cd backend && pip install -r requirements.txt
```

Se añadió `slowapi` para rate limiting. Si el servidor no inicia, verifica que slowapi esté instalado.

---

## 9. Referencias

- `CREDENCIALES_DEMO.md` – Usuarios y códigos de prueba (solo desarrollo)
- `docs/POLITICA_NOTIFICACIONES.md` – Política de WhatsApp e in-app
- `docs/ONECLICK.md` – Documentación de Transbank OneClick
- `backend/.env.example` – Plantilla de variables
