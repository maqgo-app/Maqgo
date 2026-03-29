# Runbook de operación MAQGO (MVP)

Documentación mínima para operar con **cliente + proveedor + soporte** cuando la UI admin no unifica toda la operación en una sola vista.

## Dos entidades (no mezclar)

| Colección / API | Rol |
|-----------------|-----|
| **`service_requests`** | Operación en vivo: matching, ofertas, servicio en terreno, estados de reserva. |
| **`services`** (`/api/services/*`) | Pipeline **financiero / facturación** tras el trabajo (p. ej. `pending_review` → `paid`). El panel admin actual está orientado principalmente a este flujo. |

Una reserva vive en `service_requests`; el registro financiero posteriores vive en `services` cuando el proveedor cierra el flujo de facturación según producto.

---

## Autenticación

- **Admin**: JWT con `role: admin` (mismas reglas que el resto de rutas protegidas).
- **Proveedor**: JWT proveedor u operador según endpoint.
- **Cliente**: JWT cliente para sus propias solicitudes.

`BASE` = URL pública del backend (ej. `https://api2.maqgo.cl` o la que tengáis en producción).

---

## Ver solicitudes operativas (`service_requests`)

### Listado (admin u operador con permiso)

```http
GET BASE/api/service-requests
Authorization: Bearer <token>
```

- Rol **admin**: sin filtro devuelve documentos según implementación (query amplia).
- Filtros opcionales típicos: `?service_status=<estado>` (ver estados abajo).

### Pendientes para proveedor (ofertas activas)

```http
GET BASE/api/service-requests/pending
Authorization: Bearer <token>
```

- Pensado para el **proveedor** con oferta dirigida a su cuenta (`currentOfferId` / oferta no expirada según scheduler).

### Detalle de una solicitud

```http
GET BASE/api/service-requests/{request_id}
Authorization: Bearer <token>
```

---

## Estados relevantes (`service_requests`)

Definición de referencia en `backend/models/service_request.py`. Resumen operativo:

| Estado | Significado operativo |
|--------|------------------------|
| `created` | Creada (transición inicial según flujo). |
| `matching` | Buscando proveedor. |
| `offer_sent` | Oferta enviada a un proveedor; cuenta atrás de oferta. |
| `confirmed` | Proveedor aceptó; **cobro al aceptar** según diseño del endpoint de aceptación. |
| `in_progress` | Servicio en ejecución. |
| `last_30` | Ventana final de servicio (scheduler). |
| `finished` | Completado. |
| `rated` | Calificado (cuando aplica). |
| `no_providers_available` | Sin proveedores disponibles. |
| Otros | Cancelaciones (`cancelled_client`, `cancelled_with_fee`, etc.) según reglas de negocio. |

> Nota: no usar etiquetas genéricas “pending/accepted” en Mongo: los nombres reales son los de la tabla anterior.

---

## Cómo destrabar una solicitud (checklist)

1. **Identificar** `id` de la solicitud (cliente, logs o `GET` listado).
2. **Estado actual**: `GET /api/service-requests/{id}` y revisar `status`, `currentOfferId`, `offerExpiresAt`, `paymentStatus` si aplica.
3. **Matching / ofertas**: si queda en `matching` u `offer_sent` demasiado tiempo, revisar **logs del backend**, **scheduler / TimerService** en Railway y carga de proveedores disponibles.
4. **Pagos / Oneclick**:
   - Revisar logs de rutas Oneclick (`start`, `confirm`, `authorize`) y colección de eventos de validación si está activa.
   - Verificar variables TBK y que el cliente tenga inscripción válida antes de cobrar al aceptar.
5. **Inconsistencias cliente vs proveedor**: comparar el mismo `GET /api/service-requests/{id}` con sesión cliente vs proveedor/admin (permisos de lectura según rol).

No hay en este MVP un “panel único” admin que unifique **toda** la operación de `service_requests` con la facturación de `services`; por tanto, para incidencias se usa **API + MongoDB + logs** como fuente de verdad.

---

## Endpoints de salud (comprobación rápida)

```http
GET BASE/api/health
```

---

## Regenerar assets PWA / OG (solo si cambia el logo embebido)

En el repo frontend:

```bash
npm run generate:pwa-assets
```

Genera `public/icons/icon-192.png`, `icon-512.png`, `icon-32.png`, `public/og-image.png`, `public/favicon.ico`.

---

## Variables de entorno frontend (producción)

En el build de producción deben quedar alineadas (ver `frontend/.env.production.example`):

- `VITE_IS_PRODUCTION=true`
- `VITE_MAQGO_ENV=production`
- `VITE_ENABLE_DEMO_MODE=false`

`vite.config.js` inyecta estos valores como **strings** `'true'` / `'false'` para que checks como `import.meta.env.VITE_IS_PRODUCTION === 'true'` funcionen en el bundle.
