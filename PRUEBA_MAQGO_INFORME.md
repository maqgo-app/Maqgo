# Informe de prueba MAQGO (revisión completa)

**Fecha:** 9 feb 2026  
**Alcance:** Revisión de código, rutas, APIs y dependencias.  
**Actualización:** Toda dependencia de Emergent eliminada; la app puede correr solo con MongoDB y los .env.

---

## 1. Lo que está bien

### Frontend (React)

- **Rutas:** App.js define rutas claras para onboarding, cliente, proveedor, operador y admin. Rutas legacy redirigen bien (`/provider/dashboard` → `/provider/cobros`, etc.).
- **Navegación:** WelcomeScreen redirige por sesión (client/home, provider/home, operator/home). ClientHome guarda progreso en `localStorage` y ofrece continuar reserva.
- **Backend URL:** Toda la app usa `process.env.REACT_APP_BACKEND_URL`. Con `frontend/.env` (`REACT_APP_BACKEND_URL=http://localhost:8000`) el frontend apunta al API correcto.
- **Flujo cliente (inmediata):** Home → Maquinaria → Horas → Service Location → Providers → Confirm → Billing → Card → Payment Result → Searching/Waiting → Assigned → Provider Arrived → Service Active → Finished.
- **Flujo proveedor:** Registro → Verificación SMS → Datos → Máquina → Fotos → Pricing → Operador → Review → Home. RequestReceived, SelectOperator, EnRoute, Arrival, Service Active/Finished y Rate Client están enrutados.
- **BottomNavigation:** Solo en pantallas de SCREENS_WITH_NAV. Botón Reset Demo en esquina superior derecha.

### Backend (FastAPI)

- **Server:** FastAPI con CORS, lifespan con timer_scheduler (Mongo), montaje de todos los routers bajo `/api`.
- **Health:** `GET /api/` devuelve mensaje y lista de endpoints.
- **Rutas:** auth, users, service_requests, payments, ratings, providers, pricing, communications, abandonment, services, operators, invoices, messages, admin_reports. Sin chatbot; sin dependencia de Emergent.
- **Invoices:** Validación de factura sin IA externa; acepta para revisión manual.
- **Abandonment:** Recordatorios WhatsApp vía Twilio (si `TWILIO_*` configurado); enlace usa `FRONTEND_URL` (default localhost:3000).

---

## 2. Sin dependencia Emergent

- **Chatbot:** Eliminado del MVP (ruta, componente y archivo).
- **Invoices:** Ya no usa `emergentintegrations`; validación devuelve aceptado con aviso de revisión manual.
- **Abandonment:** Ya no usa `emergentintegrations`; usa Twilio directo si está configurado; enlace configurable con `FRONTEND_URL`.
- **Tests y plugin:** URL por defecto localhost:8000; CORS y git del plugin sin referencias a emergent.

---

## 3. Entorno para correr la app

- **Backend:** `backend/.env` con `MONGO_URL`, `DB_NAME`. Opcional: `FRONTEND_URL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` para recordatorios WhatsApp.
- **Frontend:** `frontend/.env` con `REACT_APP_BACKEND_URL=http://localhost:8000`.
- **MongoDB:** Necesario para el API y el timer_scheduler.

---

## 4. Resumen

| Área           | Estado | Notas                                           |
|----------------|--------|-------------------------------------------------|
| Rutas frontend | OK     | Flujos cliente y proveedor coherentes.         |
| Backend URL    | OK     | REACT_APP_BACKEND_URL en todo el frontend.      |
| APIs backend   | OK     | Endpoints usados por el frontend existen.      |
| Emergent       | Eliminado | Cero dependencia técnica de Emergent.      |
| Arranque       | OK     | Backend arranca con MongoDB y .env.             |

**Conclusión:** La app puede correr de punta a punta en localhost con MongoDB y los .env, sin ninguna dependencia de Emergent.
