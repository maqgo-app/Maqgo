# MAQGO – Documentación de lo implementado

**Fecha:** Marzo 2025  
**Propósito:** Archivo de respaldo con todo lo realizado y configurado.

---

## 1. MEJORAS DE QA (sesión previa)

### 1.1 Crítico
- **handle401 (api.js):** Se añadió `localStorage.removeItem('ownerId')` en la limpieza de sesión tras 401, para evitar que un operador con sesión expirada deje datos que afecten a otro usuario.

### 1.2 Alto
- **OneClickCompleteScreen:** Botones "Reintentar" y "Volver a pago" cuando falla la creación del servicio.
- **Empezar otra reserva (ClientHome):** Limpieza completa de claves de localStorage (ubicación, proveedores, facturación, fechas, etc.).
- **BOOKING_BACK_ROUTES:** Rutas añadidas: `/client/searching`, `/client/payment-result`, `/client/assigned`, `/oneclick/complete`.

### 1.3 Medio
- **safeStorage:** Migración de `JSON.parse(localStorage.getItem(...))` a `getObject`/`getArray` en ProviderOptionsScreen, UrgencySelectionScreen, abandonmentTracker.
- **validateEmail:** Unificación en CardPaymentScreen usando `chileanValidation.validateEmail`.
- **Accesibilidad:** `htmlFor` e `id` en formularios (BillingDataScreen, CardPaymentScreen).

### 1.4 Logo
- **Pantallas de entrada:** RegisterScreen, ProviderRegisterScreen, SelectChannelScreen, ProviderSelectChannelScreen → logo `medium`.
- **Pantallas internas:** Todas con logo `small` (PaymentResultScreen, MachineryAssignedScreen, ServiceFinishedScreen unificados).

---

## 2. RAILWAY – Backend

### 2.1 Configuración
- **Root Directory:** `backend`
- **Builder:** Dockerfile (detectado automáticamente al apuntar a `backend`)
- **Archivo:** `backend/railway.json` (opcional, fuerza uso de Dockerfile)

### 2.2 Variables requeridas
| Variable | Descripción |
|----------|-------------|
| `MONGO_URL` | URI de MongoDB Atlas (mongodb+srv://...) |
| `DB_NAME` | `maqgo_db` |
| `CORS_ORIGINS` | URLs del frontend (ej: https://maqgo.vercel.app) |
| `FRONTEND_URL` | URL del frontend |
| `MAQGO_DEMO_MODE` | `true` para demo, `false` para producción |

### 2.3 Dominio público
- Generar dominio en Railway → Public Networking → Generate Domain
- URL tipo: `https://maqgo-xxx.up.railway.app`

---

## 3. IMPLEMENTACIONES VIABLES (sesión actual)

### 3.1 CancelServiceScreen → API real
- **Antes:** Simulaba cancelación con `setTimeout`.
- **Ahora:** Llama a `PUT /api/service-requests/{id}/cancel` con la razón.
- Si no hay `currentServiceId` (demo), mantiene comportamiento anterior.
- Muestra error en pantalla si la API falla.

### 3.2 Notificación al proveedor (services.py)
- **Aprobado (pending_review → approved):** Obtiene teléfono del proveedor (o dueño si es operador) y llama `notify_service_approved_for_invoice` (WhatsApp).
- **Pagado (invoiced → paid):** Obtiene teléfono y llama `notify_payment_sent`.
- Requiere Twilio configurado para enviar mensajes.

---

## 4. VERCEL – Frontend

### 4.1 URL
- **Producción:** maqgo.vercel.app

### 4.2 Variables requeridas
| Variable | Descripción |
|----------|-------------|
| `REACT_APP_BACKEND_URL` | URL del backend en Railway (ej: https://maqgo-xxx.up.railway.app) |
| `VITE_GOOGLE_MAPS_API_KEY` | API key de Google Maps (Places API) para autocompletado de direcciones |

### 4.3 Google Maps
- **Guía completa:** `docs/GOOGLE_MAPS_SETUP.md`
- **Uso:** AddressAutocomplete en ServiceLocationScreen (direcciones en Chile)

---

## 5. MONGODB ATLAS

### 5.1 Estado
- **Cluster:** maqgo-cluster
- **URL:** Configurada en Railway como `MONGO_URL`
- **Base de datos:** maqgo_db

### 5.2 Network Access
- Debe permitir `0.0.0.0/0` para que Railway pueda conectarse.

---

## 6. INTEGRACIONES PENDIENTES

| # | Integración | Estado | Próximo paso |
|---|-------------|--------|-------------|
| 1 | MongoDB | ✅ Activo | — |
| 2 | Twilio | Pendiente | Crear cuenta, obtener SID, Auth Token, número. Variables en Railway. |
| 3 | Google Maps | En proceso | Ver `docs/GOOGLE_MAPS_SETUP.md` – Crear proyecto, habilitar APIs, API key en Vercel. |
| 4 | OneClick (Transbank) | Pendiente | Cuenta Transbank, credenciales, configurar en backend. |

---

## 7. COSTOS ESTIMADOS (mensual)

| Servicio | Costo aprox. |
|----------|--------------|
| Railway (backend) | ~US$ 10-15 |
| Vercel (frontend) | Gratis (Hobby) |
| Twilio (1000 SMS) | ~US$ 12 |
| Google Maps | US$ 0 (crédito $200/mes) |
| MongoDB Atlas | US$ 0 (M0 Free) |
| **Total** | **~US$ 22-27** |

---

## 8. ESTRUCTURA DEL REPO (GitHub)

```
maqgo-app/Maqgo
├── backend/
│   ├── Dockerfile
│   ├── railway.json
│   ├── requirements.txt
│   ├── server.py
│   └── ...
├── frontend/
│   └── ...
└── ...
```

---

## 9. ORDEN DE IMPLEMENTACIÓN SUGERIDO

1. ~~MongoDB~~ ✅
2. Twilio
3. Google Maps
4. OneClick (Transbank)

---

*Documento generado como respaldo de la configuración e implementaciones realizadas.*
