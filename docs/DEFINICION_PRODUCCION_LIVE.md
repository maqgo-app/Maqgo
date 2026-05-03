# Qué está “liberado en producción” cuando `maqgo.cl` está LIVE

**Regla única:** En producción **no está** “lo que el código local tiene sin commitear”. Está **lo que el último deploy de producción instaló** desde el repositorio conectado a **Vercel (frontend)** y **Railway (backend)** — normalmente la rama **`main`** en el commit que muestra el panel de deploy.

**Fuente de verdad del commit desplegado:** Vercel → proyecto MAQGO → **Production** → último deployment (**commit SHA**). Eso es lo que define el binario que sirve `www.maqgo.cl` (o el dominio canónico configurado).

---

## 1. Alcance de producto que ese deploy expone (MVP)

Si el build de producción apunta al API público (`REACT_APP_BACKEND_URL` según `PRODUCCION.md` / `MODELOS_DEPLOY.md`), los usuarios pueden usar **lo que implementa ese commit**, incluyendo de forma típica:

### Cliente (marketplace / arriendo)

- Portada, login por **SMS**, flujo de **reserva/solicitud**: maquinaria → ubicación → lista de proveedores → confirmación (P5) → registro tarjeta OneClick (P6) → búsqueda de proveedor → estados posteriores según rutas del front.
- Referencia de rutas: `FLUJO_RESERVA_ACTUAL.md`, `bookingFlow.js`.

### Proveedor

- Onboarding, máquinas, disponibilidad, aceptación/rechazo de solicitudes, flujos operativos según el código desplegado.

### Pagos y auth

- Comportamiento acorde a variables en **Railway** (`MAQGO_DEMO_MODE`, `TBK_DEMO_MODE`, Twilio, etc.). **Modo LIVE** = SMS y/o TBK reales solo si esas variables y credenciales están en producción (`PRODUCCION.md`).

### Admin

- Lo que habilite el mismo commit + usuarios/roles en base de datos (`ADMIN_INSTRUCCIONES.md`).

---

## 2. Qué **no** implica automáticamente “maqgo.cl LIVE”

- Que **Preview** de Vercel o **otra rama** tengan el mismo comportamiento (pueden apuntar a otro API o otro commit).
- Que **localhost** o un fork sin merge sean iguales a prod.
- Que el subdominio **API** (`api2.maqgo.cl` u otro) esté en el mismo commit que el front: son **dos deploys** (Vercel + Railway); deben ser **compatibles** por contrato de API y CORS.

---

## 3. Cómo alinear “lo que quiero en prod” con “lo que está en prod”

1. Merge a **`main`** (o la rama que Vercel use para Production).
2. Esperar deploy **Ready** en Vercel Production.
3. Anotar **SHA** y, si aplica, anotar en `DEPLOY_LOG.md`.
4. Ejecutar smoke según `RELEASE_CHECKLIST.md` §1.

---

## 4. Resumen en una frase

**Producción = el commit desplegado en Vercel Production + el servicio API desplegado en Railway con sus env vars LIVE** — no el estado de tu carpeta local ni una URL de preview, salvo que explícitamente configures lo contrario.
