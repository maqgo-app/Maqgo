# QA MAQGO – Informe clase mundial

**Fecha:** Febrero 2025  
**Objetivo:** Análisis profundo para llevar la app a estándar clase mundial.

---

## 1. Propuesta de valor – Alineación

### Definición
> **MAQGO conecta a quienes necesitan maquinaria pesada con quienes la tienen, con arriendo en horas (no días), sin contratos y pagando solo al confirmar.**

### Ubicaciones donde está definida

| Pantalla | Mensaje |
|----------|---------|
| **Welcome** | Arriendo · En horas, no días / Simple. Sin contratos. Paga solo al confirmar. |
| **ClientHome** | En horas, no días. Paga solo al confirmar. |
| **ProviderRegister** | Ofrecer mi maquinaria / Recibe solicitudes. Tú decides cuándo. |
| **ConfirmServiceScreen** | Sin cobro hasta que acepten tu solicitud |
| **ProviderOptionsScreen** | No se realizará ningún cobro hasta que un operador acepte tu solicitud |
| **CardPaymentScreen** | Solo se realizará el cobro si un operador acepta tu solicitud |
| **index.html** | meta description + title con propuesta de valor |

### Terminología unificada
- **Arriendo** (no "reserva") en copy orientado al usuario
- **Arrendar maquinaria** (no "Reservar maquinaria")
- **Programar arriendo** (no "Programar reserva")
- **Nuevo arriendo** (no "Nueva reserva")

---

## 2. Correcciones aplicadas

### Copy y consistencia
- [x] ClientHome: "Reservar" → "Arrendar maquinaria"
- [x] ClientHome: microcopy "En horas, no días. Paga solo al confirmar."
- [x] ClientHome: "Programar reserva" → "Programar arriendo"
- [x] ClientHome modal: "Reserva en progreso" → "Arriendo en progreso"
- [x] ProviderRegisterScreen: añadida propuesta de valor
- [x] document.title: "necesites" → "necesitas"
- [x] index.html: lang="en" → lang="es", meta description
- [x] ReservationDataScreen: "Ubicacion" → "Ubicación", "direccion" → "dirección"
- [x] ServiceSummary: "Hacer Nueva Reserva" → "Nuevo arriendo"
- [x] HistoryScreen: "Nueva reserva" → "Nuevo arriendo"

### Accesibilidad
- [x] WelcomeScreen: aria-label en CTAs principales
- [x] Botones "Volver" ya tenían aria-label en flujos clave

---

## 3. Checklist clase mundial

### Propuesta de valor
- [x] Clara en primera pantalla
- [x] Consistente en flujo cliente
- [x] Presente en onboarding proveedor
- [x] Refuerzo en puntos de cobro/pago

### Onboarding
- [x] Guest-first (Empezar sin cuenta)
- [x] CTAs por rol (Cliente, Proveedor, Operador)
- [x] Social proof sutil
- [x] Modal para reanudar arriendo en progreso

### Flujo cliente
- [x] Regla: primero maquinaria
- [x] Horas 4–8 para inmediato
- [x] Back dinámico según flujo
- [x] BookingProgress visible

### SEO y metadatos
- [x] lang="es"
- [x] meta description con propuesta de valor
- [x] title coherente

### Accesibilidad
- [x] aria-label en CTAs principales
- [x] Botones de navegación con aria-label
- [ ] Pendiente: revisar contraste de colores (WCAG AA)
- [ ] Pendiente: focus visible en navegación por teclado

---

## 4. Mejoras MVP Top (aplicadas)

### Completadas
- [x] **"Saltar para pruebas":** Oculto en producción (`import.meta.env.DEV`)
- [x] **ReservationDataScreen:** Ubicación obligatoria, botón deshabilitado sin dirección
- [x] **Focus visible:** `:focus-visible` en botones, inputs, tarjetas (WCAG 2.4.7)
- [x] **Contraste:** Placeholder #888, descripciones 0.65 opacity
- [x] **Reduced motion:** `@media (prefers-reduced-motion: reduce)`
- [x] **Skip link:** "Saltar al contenido" para teclado
- [x] **LoginScreen:** Mensajes de error sin mencionar puerto
- [x] **MACHINERY_NAMES:** Acentos (Camión, Grúa, Hidráulica)
- [x] **ErrorBoundary:** Mejor UX, role="alert", aria-label

### Pendientes (opcional)
- [ ] Loading states con skeleton
- [ ] Mensaje offline

---

## 5. Resumen

La app MAQGO tiene una propuesta de valor bien definida y alineada en las pantallas principales. La terminología está unificada (arriendo, arrendar) y el mensaje "En horas, no días. Paga solo al confirmar." se refuerza en puntos clave del flujo.

**Estado actual:** Lista para producción con los ajustes aplicados. Los pendientes son mejoras incrementales para alcanzar un estándar aún más alto.

---

## 6. Proceso QA y regresión

Para evitar que correcciones introduzcan regresiones:

1. **Checklist de regresión:** `docs/QA_REGRESSION_CHECKLIST.md`
2. **Suite automatizada:** `./scripts/run_qa.sh` (build + tests pricing + OneClick)
3. **Antes de merge:** Ejecutar `run_qa.sh` y verificar flujos 3, 4 y 7 del checklist
