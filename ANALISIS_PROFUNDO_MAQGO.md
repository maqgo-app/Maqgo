# Análisis profundo MAQGO – Informe completo

**Fecha:** Marzo 2025  
**Objetivo:** Evaluación exhaustiva de arquitectura, seguridad, UX, deuda técnica y gaps vs documentación.

---

## 1. Arquitectura y estructura

### 1.1 Frontend

| Capa | Ubicación | Descripción |
|------|-----------|-------------|
| **Screens** | `frontend/src/screens/` | Por rol: `client/`, `provider/`, `operator/`, `admin/` |
| **Components** | `frontend/src/components/` | `base/` (MaqgoButton, MaqgoInput), `ui/` (skeleton, alert-dialog), ErrorStates, BookingProgress |
| **Utils** | `frontend/src/utils/` | api.js, pricing.js, uberUX.js, chileanValidation.js |
| **Context** | `frontend/src/context/` | AuthContext |
| **Constants** | `frontend/src/constants/` | Índice centralizado |

**Flujo de datos:** AuthContext → pantallas → `api.js` (fetchWithAuth) → backend. Token en `localStorage`.

### 1.2 Backend

| Capa | Ubicación | Descripción |
|------|-----------|-------------|
| **Routers** | `backend/routes/` | auth, users, service_requests, payments, providers, pricing, admin_*, etc. |
| **Services** | `backend/services/` | matching_service, payment_service, timer_service |
| **Models** | `backend/models/` | Pydantic (user, service_request, etc.) |
| **Pricing** | `backend/pricing/` | constants, business_rules |

### 1.3 Problemas de arquitectura

| Problema | Ubicación | Impacto |
|----------|-----------|---------|
| Rutas sin protección | `service_requests.py`, `users.py`, `payments.py` | **Crítico** – Cualquiera puede crear solicitudes, usuarios o pagos |
| auth_dependency poco usado | Solo en admin_reports, admin_config, services | Rutas sensibles expuestas |

---

## 2. Seguridad

### 2.1 Autenticación y autorización

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| **Token** | ⚠️ Riesgo | `auth.py:69` usa `secrets.token_urlsafe(32)`, no JWT. Comentario: "Use JWT in production". |
| **Sesiones** | ⚠️ Riesgo | Sin TTL en MongoDB; no hay expiración de sesiones. |
| **Protección de rutas** | 🔴 Crítico | Rutas sensibles sin auth: `service_requests`, `users`, `payments`, `oneclick`. |
| **Admin** | ✅ OK | `get_current_admin` valida `role == "admin"`. |

### 2.2 Validación de inputs

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| **Celular** | ✅ OK | Formato chileno (9 dígitos, empieza con 9). |
| **Email** | ✅ OK | Pydantic `EmailStr`. |
| **Password** | ⚠️ Riesgo | Sin longitud mínima en `RegisterRequest`. |
| **clientId en service_requests** | ⚠️ Riesgo | No se comprueba que coincida con el usuario autenticado. |

### 2.3 CORS y headers

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| **CORS** | ⚠️ Riesgo | `CORS_ORIGINS='*'` por defecto en producción. |
| **Headers de seguridad** | ❌ Ausente | Sin X-Frame-Options, Content-Security-Policy, X-Content-Type-Options. |

### 2.4 Rate limiting

✅ OK: `slowapi` en auth, login, verify-sms, resend-code.

---

## 3. UX y consistencia

### 3.1 `window.confirm` / `alert`

**Documentación:** MEJORAS_MAQGO_PLAN.md §5, UX_PRIME_MEJORAS.md §4.

**ClientHome:** ✅ Usa modal custom (no `window.confirm`).

**Pendientes:**

| Archivo | Línea | Mensaje |
|---------|-------|---------|
| `WaitingConfirmationScreen.js` | 38 | "¿Estás seguro de cancelar la solicitud?" |
| `SelectOperatorScreen.js` | 113 | "¿Cancelar la aceptación del servicio?" |

**Acción:** Sustituir por `AlertDialog` (componente existente).

### 3.2 Estados de carga

**Skeleton** existe en `components/ui/skeleton.jsx` pero no se usa en listas.

| Pantalla | Archivo | Estado actual |
|----------|---------|---------------|
| ProviderOptionsScreen | ProviderOptionsScreen.js | Spinner + "Buscando las mejores opciones..." |
| ProviderHistoryScreen | ProviderHistoryScreen.js | "Cargando..." |
| AdminDashboard | AdminDashboard.js | "Cargando..." |
| HistoryScreen | HistoryScreen.js | localStorage/demo, sin loading |
| TeamManagementScreen | TeamManagementScreen.js | "Cargando..." |
| ServiceChat | ServiceChat.js | "Cargando mensajes..." |

**Acción:** Usar `Skeleton` en listas según UX_PRIME_MEJORAS §2.

### 3.3 Empty states

- **ErrorStates.js:** ✅ NoProvidersError, NoProvidersTryTomorrow, RequestExpiredError.
- **Gaps:** Historial vacío sin ilustración; sin máquinas (proveedor) con CTA poco claro.

### 3.4 Vibración háptica

✅ Integrada en RequestReceivedScreen, MachineryAssignedScreen, ProviderArrivedScreen, etc.

---

## 4. Deuda técnica

### 4.1 Código duplicado

| Tipo | Ubicación | Detalle |
|------|-----------|---------|
| **RequestReceived vs RequestReceivedScreen** | `screens/provider/` | Ambos en rutas; unificar y eliminar duplicado. |
| **vibrate** | `uberUX.js` vs `alertSound.js` | `alertSound.js` define `vibrate` duplicado; ArrivalScreen usa alertSound. |
| **formatPrice** | Varias pantallas | Múltiples implementaciones con `Intl.NumberFormat`. |

### 4.2 Componentes legacy

| Componente | Detalle |
|------------|---------|
| RequestReceived.js | Versión antigua; RequestReceivedScreen.js es la moderna. |
| HistoryScreen.js | Usa datos demo y localStorage en lugar de API real. |

### 4.3 CancelServiceScreen

Simula API con `setTimeout(1500)`; no hay llamada real ni manejo de errores.

---

## 5. Bugs potenciales

### 5.1 Manejo de errores

- Muchos `try/catch` solo hacen `console.error` sin feedback al usuario.
- HistoryScreen: no hay manejo de errores de red.

### 5.2 Race conditions

- **Aceptar solicitud:** Posible doble clic en "Aceptar" en RequestReceivedScreen.
- **Cancelar:** WaitingConfirmationScreen navega tras 5s; cancel puede ejecutarse antes de la respuesta.

### 5.3 Validaciones faltantes

- Password sin longitud mínima.
- `clientId` en service_requests no se valida contra el usuario autenticado.

---

## 6. Gaps vs documentación

### 6.1 MEJORAS_MAQGO_PLAN.md

| Item | Estado |
|------|--------|
| §1 Corrección precios | ✅ Completado |
| §2 Fotos maquinaria | ✅ Completado |
| §3 Foto operador | ✅ Completado |
| §4 Foto operador al cliente | ⏳ Pendiente |
| §5 Reemplazar window.confirm | 🔶 Parcial (2 pendientes) |
| §6 Skeleton loading | ⏳ Pendiente |
| §7 Vibración háptica | ✅ Completado |
| §8 Indicador progreso | 🔶 Parcial |
| §9 Toast animación | ⏳ Pendiente |
| §10 Empty states | 🔶 Parcial |

### 6.2 UX_PRIME_MEJORAS.md

| Item | Estado |
|------|--------|
| §1 Vibración | ✅ Completado |
| §2 Skeleton loading | ⏳ Pendiente |
| §3 Transiciones | ⏳ Pendiente |
| §4 Diálogos | 🔶 Parcial |
| §5 Toast | ⏳ Pendiente |
| §6 Indicador progreso | 🔶 Parcial |
| §7 Empty states | 🔶 Parcial |
| §8 Accesibilidad | ⏳ Pendiente |

---

## 7. Resumen priorizado por impacto

### 🔴 Crítico

1. **Rutas sin autenticación** – Proteger `service_requests`, `users`, `payments` con `Depends(get_current_user)`.
2. **CORS en producción** – Configurar `CORS_ORIGINS` con dominios explícitos.
3. **Tokens de sesión** – Valorar migración a JWT con expiración.

### 🟠 Alto

4. **window.confirm** – WaitingConfirmationScreen, SelectOperatorScreen → usar AlertDialog.
5. **Headers de seguridad** – X-Frame-Options, Content-Security-Policy, X-Content-Type-Options.
6. **Validación de contraseña** – Longitud mínima en registro.
7. **CancelServiceScreen** – Implementar llamada real a API y manejo de errores.

### 🟡 Medio

8. **Skeleton loading** – ProviderOptionsScreen, ProviderHistoryScreen, AdminDashboard, HistoryScreen.
9. **Empty states** – Historial vacío y sin máquinas.
10. **RequestReceived vs RequestReceivedScreen** – Unificar y eliminar duplicado.
11. **HistoryScreen** – Conectar con API real.

### 🟢 Bajo

12. **Unificar vibrate** – Un solo módulo (uberUX).
13. **Transiciones de pantalla** – Según UX_PRIME_MEJORAS.
14. **Accesibilidad** – aria-live, contraste.

---

## 8. Próximos pasos sugeridos

### Sprint seguridad (prioridad inmediata)

1. Auditar y proteger rutas con auth.
2. Configurar CORS para producción.
3. Añadir headers de seguridad.
4. Validación de contraseña (mín. 8 caracteres).

### Sprint UX (alta prioridad)

5. Sustituir 2 `window.confirm` por AlertDialog.
6. Skeleton loading en 4–6 pantallas clave.
7. Empty states para historial vacío y sin máquinas.

### Sprint deuda técnica (media prioridad)

8. Unificar RequestReceived / RequestReceivedScreen.
9. Implementar CancelServiceScreen con API real.
10. Conectar HistoryScreen con API.

---

*Informe generado por análisis profundo del codebase MAQGO*
