# Onboarding y funnel de conversión – Revisión MAQGO

Revisión del flujo de entrada (Welcome), onboarding cliente y proveedor, y sugerencias para maximizar conversión.

---

## 1. Funnel actual

### Cliente (arrendar maquinaria)
- **Welcome** → "Arrendar maquinaria" (CTA principal) → **ClientHome** (sin login).
- ClientHome → Inicio HOY / Programar → **Machinery** → Horas o Urgencia (según tipo) → **Ubicación** → **Proveedores** → **Confirmar** → **Pago**.
- **Recuperación**: banner "Arriendo sin terminar" en Welcome si hay `clientBookingStep` guardado (abandonmentTracker).
- **Progreso**: BookingProgress en cada pantalla (Paso X de 6 · [nombre]).

**Fortalezas**
- Cliente puede empezar **sin registro** (solo se pide datos al confirmar/pago). Muy bueno para conversión.
- Progreso visible (pasos) y recuperación de reserva abandonada.

### Proveedor (ofrecer maquinaria)
- **Welcome** → "Ofrecer mi maquinaria" → **Register** (nombre, email, celular) → Verify SMS → **RoleSelection** (preselección provider) → **ProviderData** (paso 1) → **MachineData** (2) → **MachinePhotos** (3) → **Pricing** (4) → **OperatorData** (5) → **Review** (6) → ProviderHome.
- Si no completa onboarding: al volver a ProviderHome se redirige al último paso guardado (`providerOnboardingStep`).
- **Progreso**: ProviderOnboardingProgress (Paso X de 6 · [Datos empresa, Datos máquina, Fotos, Tarifas, Operador, Revisión]).

**Fortalezas**
- Progreso por pasos y reanudación automática.
- Mensaje "Tu progreso se guarda. Puedes continuar después." en pasos 1 y 2 para reducir miedo al abandono.
- Último paso (Revisión) con refuerzo "¡Casi listo!".

---

## 2. Mejoras ya aplicadas (esta revisión)

| Cambio | Objetivo |
|--------|----------|
| **BookingProgress** muestra "Paso X de 6 · [nombre del paso]" | Que el usuario sepa en qué etapa está (ej. "Horas / Urgencia", "Ubicación"). |
| **Welcome**: subtexto CTA cliente "Sin registro para empezar" | Reforzar que no hay fricción para explorar. |
| **Welcome**: subtexto CTA proveedor "Regístrate y recibe solicitudes de clientes" | Clarificar beneficio. |
| **Welcome**: línea "Tu progreso se guarda en cada paso" | Confianza y reducción de ansiedad. |
| **ProviderDataScreen y MachineDataScreen**: "Tu progreso se guarda. Puedes continuar después." | Reducir abandono por pensar que hay que completar todo de una vez. |
| **ReviewScreen**: "¡Casi listo!" antes del resumen | Refuerzo positivo al final del onboarding. |

---

## 3. Sugerencias adicionales (para implementar después)

### Cliente – máximo impacto
- **Reducir pasos percibidos**: En Confirm, recordar "Paga solo cuando un proveedor acepte" cerca del botón de enviar solicitud.
- **Urgencia suave**: En ProviderOptionsScreen, si hay pocos proveedores, mensaje tipo "X opciones disponibles ahora" (sin exagerar).
- **Reserva abandonada**: Considerar recordatorio por email/WhatsApp si el backend lo soporta (abandonmentTracker ya guarda progreso).

### Proveedor – máximo impacto
- **Reducir fricción en registro**: Valorar un flujo "Solo celular + SMS" para el primer paso y dejar nombre/email para después del primer paso de onboarding.
- **Pantalla "Cómo funciona"** (opcional): Antes de Register, una sola pantalla con 3 bullets (ej. "Regístrate", "Completa datos y máquina", "Recibe solicitudes") y CTA "Empezar" → Register. Ayuda a compromiso.
- **Guardar por campo**: Ya se guarda por paso; si en el futuro se guarda también por campo (localStorage por formulario), se reduce pérdida si cierran la app a mitad de un paso.
- **Mensaje de progreso** en más pasos (Fotos, Tarifas, Operador) si se ve abandono en analytics en esos pasos.

### General
- **A/B tests**: Probar variantes de copy en Welcome (ej. "Sin tarjeta para explorar" vs "Sin registro para empezar").
- **Métricas**: Tasa de conversión Welcome → ClientHome vs Welcome → Register; por paso en cliente (machinery → confirm) y en proveedor (paso 1 → paso 6).

---

## 4. Resumen

- **Cliente**: Funnel ya es corto y sin registro inicial; las mejoras refuerzan confianza y claridad del progreso.
- **Proveedor**: Onboarding largo (6 pasos); las mejoras reducen ansiedad ("progreso guardado", "casi listo") y clarifican beneficios en Welcome.
- Para **máxima conversión**, priorizar: (1) mantener "sin registro para empezar" en cliente, (2) mensajes de progreso guardado en proveedor, (3) medir abandono por paso y atacar el paso con mayor drop-off.
