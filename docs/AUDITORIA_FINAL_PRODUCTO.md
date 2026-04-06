# Auditoría final — producto medible, consistente y confiable

Complementa [QA_FUNNEL_CLIENTE.md](./QA_FUNNEL_CLIENTE.md), [SELLADO_PLAYWRIGHT.md](./SELLADO_PLAYWRIGHT.md) y [MONITOREO_MINIMO_PROD.md](./MONITOREO_MINIMO_PROD.md).  
**Principio:** cerrar el producto sin nuevos flujos ni plataformas de analítica pesadas.

---

## 1. Métricas de funnel

### Qué medir (4 ratios base)

| Métrica | Definición mínima | Uso |
|--------|-------------------|-----|
| **% avance entre pantallas** | Usuarios (o sesiones) que llegan al paso *B* entre los que vieron el paso *A* en un mismo intento de reserva | Detectar abandono por paso |
| **% solicitudes enviadas** | Reservas/solicitudes creadas en backend y en estado “oferta enviada / en búsqueda” (o equivalente) ÷ intentos que llegaron a confirmar | Conversión al “envío” |
| **% match exitoso** | Solicitudes con proveedor/operador asignado o aceptado ÷ solicitudes enviadas | Oferta vs demanda |
| **% cierre (cobro)** | Pagos confirmados (Transbank/estado de cobro en DB) ÷ match exitoso (o ÷ solicitudes, según negocio; **una sola definición** y no cambiarla) | Ingreso real |

### Cómo medir sin complejidad innecesaria

**Fuente de verdad recomendada (MVP):** Mongo / API ya persisten `service-requests`, pagos y estados. Definir **consultas o jobs diarios** (script interno o panel admin) que cuenten transiciones por `createdAt` / `status`, **sin** duplicar lógica en el cliente.

**Opcional y acotado (si ya hay GTM/GA4):** hasta **5 eventos con nombre fijo** en puntos ya estables (ej. `booking_step_view` con `step: machinery|location|providers|confirm|payment`), disparados en una sola capa (helper único). No añadir segundo proveedor de analítica ni feature flags nuevos solo para métricas.

**No hacer en MVP:** warehouse propio, event streaming, A/B framework, tableros en tiempo real.

---

## 2. Estados vacíos y errores

Comportamiento estándar: **un mensaje claro + un CTA principal** (secundario solo si es imprescindible legalmente).

| Caso | Mensaje (intención) | CTA único de salida (ejemplo) |
|------|---------------------|-------------------------------|
| **No hay proveedores disponibles** | Hoy no hay opciones para esta búsqueda; qué puede hacer el usuario ahora | Volver a inicio / ajustar búsqueda (una acción dominante) |
| **Error en solicitud** | La solicitud no pudo completarse; si reintentar o contactar | Reintentar **o** volver a home (elegir **uno** por pantalla) |
| **Fallo en carga** | No pudimos cargar datos; red o servidor | Reintentar (mismo pantalla) o ir a inicio si el reintento no aplica |

**Estado actual en código:** componentes de error en el embudo cliente (p. ej. `NoProvidersError`, `NoProvidersTryTomorrow` en `ProviderOptionsScreen`) y patrones similares en `ErrorStates`. **Auditoría de cierre:** revisar que cada variante cumpla “1 CTA protagonista” y que el texto no contradiga otros pasos (“no se cobra hasta…”).

**Sin nuevos flujos:** no agregar pantallas intermedias; solo alinear copy y botones.

---

## 3. Persistencia de flujo

### Validar explícitamente

- El usuario puede **salir** (home, otra app) y **volver** sin perder el embudo hasta donde el producto lo promete.
- **Datos críticos** (maquinaria, horas, ubicación, selección de proveedores, IDs de servicio) se recuperan de `localStorage` / progreso guardado según reglas ya definidas en `abandonmentTracker` y pantallas P4–P6.
- Tras **login / expiración de sesión**, el retorno a `/login` y la limpieza de token no dejan el usuario en estados imposibles (ver fixes recientes de sesión en login).

### Límites (simplicidad)

- No prometer reanudación ilimitada: documentar **ventana** (p. ej. 24 h) si aplica en código.
- Tras **pago confirmado** o **cancelación explícita**, invalidar progreso de reserva en curso para no mezclar dos solicitudes.

---

## 4. Consistencia de CTAs

### Objetivo

- **Una acción principal** por pantalla (botón naranja / estilo primario único).
- **Mismo verbo** para la misma intención (ej. “Ver proveedores”, “Continuar”, “Iniciar sesión”).

### Auditoría (checklist manual)

- [ ] Embudo cliente: CTAs de continuación vs “Volver” (secundario).
- [ ] Login / registro / OTP: un “Continuar” o “Iniciar sesión” claro por paso.
- [ ] Proveedor / operador: mismo criterio en onboarding.
- [ ] Eliminar variantes innecesarias (“Siguiente” vs “Continuar” en el mismo tipo de paso).

**Sin refactors masivos:** corregir solo divergencias que generen duda en usuario real; dejar glosario mínimo en [UX_GUIDE.md](./UX_GUIDE.md) o una tabla de 10–15 strings canónicos si el equipo lo necesita.

---

## Criterio de cierre

El producto se considera **cerrado en este eje** cuando:

1. Las **4 métricas** tienen definición escrita y fuente (DB y/o ≤5 eventos opcionales).
2. Los **tres tipos de vacío/error** tienen mensaje + CTA único revisados en las pantallas que los muestran.
3. **Persistencia** verificada en checklist manual + casos límite (sesión expirada, reabrir app).
4. **CTAs** revisados en el embudo principal sin acciones primarias duplicadas.

---

*Última ampliación: métricas, vacíos, persistencia y CTAs — sin nuevos flujos ni arquitectura.*
