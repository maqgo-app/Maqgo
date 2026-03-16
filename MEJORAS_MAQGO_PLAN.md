# Plan de Mejoras MAQGO – UX tipo Uber · Máxima tracción

Documento maestro de mejoras priorizadas para maximizar conversión, reducir fricción y facilitar onboarding.

---

## ✅ Completado (esta sesión)

### 1. Corrección de precios – inconsistencia operador vs desglose
- **Problema:** `RequestReceivedScreen` y `ProviderServiceFinishedScreen` usaban multiplicadores incorrectos (1.30, 1.25, 1.20, 1.15, 1.10) vs backend (1.20, 1.175, 1.15, 1.125, 1.10).
- **Solución:** Usar `IMMEDIATE_MULTIPLIERS` desde `utils/pricing.js` (fuente única).
- **Archivos:** `RequestReceivedScreen.js`, `ProviderServiceFinishedScreen.js` – importar desde pricing.js.

### 2. Fotos de maquinaria – captura real
- **Antes:** Placeholders (via.placeholder.com).
- **Ahora:** Input tipo file con `capture="environment"` para abrir cámara en móvil.
- **Regla:** 1 foto frontal obligatoria, lateral y trasera opcionales (máx 3).
- **Archivo:** `MachinePhotosScreen.js`.

### 3. Foto del operador – captura con cámara
- **Antes:** Solo file input sin `capture`.
- **Ahora:** `capture="user"` para cámara frontal al registrar operador.
- **Archivo:** `OperatorDataScreen.js`.

---

## 🔴 Prioridad alta (próximos sprints)

### 4. Mostrar foto del operador al cliente
- **Objetivo:** Cuando el cliente ve "Maquinaria asignada" o "Operador llegó", mostrar la foto del operador para verificación.
- **Ubicación:** `MachineryAssignedScreen.js`, `ProviderArrivedScreen.js`.
- **Backend:** Asegurar que `operator_photo` se guarde en el servicio y se devuelva en el flujo de proveedor asignado.

### 5. Reemplazar `window.confirm` y `alert`
- **Problema:** Rompe la estética de la app.
- **Solución:** Usar `AlertDialog` (componente existente).
- **Pantallas:** `ClientHome.js` (¿Continuar reserva?), `CancelServiceScreen`, rechazar solicitud.
- **Ref:** `UX_PRIME_MEJORAS.md` §4.

### 6. Skeleton loading en listas
- **Pantallas:** `ProviderOptionsScreen`, `HistoryScreen`, `ProviderHistoryScreen`, `AdminDashboard`.
- **Componente:** `Skeleton` ya existe en `components/ui/skeleton.jsx` – integrar en listas.

### 7. Vibración háptica en CTAs
- **`uberUX.vibrate()`** ya existe.
- **Integrar en:** Botón de confirmar, aceptar, pagar; reserva confirmada; operador llegando.
- **Ref:** `UX_PRIME_MEJORAS.md` §1.

---

## 🟡 Prioridad media

### 8. Indicador de progreso en flujo de reserva
- **Flujo:** Maquinaria → Horas → Ubicación → Proveedores → Confirmar → Pago.
- **Mostrar:** "Paso X de 6" con dots.
- **Componente:** `BookingProgress` – revisar si ya cubre.

### 9. Toast con animación de salida
- Posicionamiento bottom en móvil.
- Queue para evitar superposición de toasts.

### 10. Empty states ilustrados
- Historial vacío.
- Sin máquinas (proveedor).
- Sin proveedores: revisar copy de `NoProvidersError`.

### 11. Validación en tiempo real
- Comuna: sugerencias mientras se escribe.
- Dirección: Google Places.
- Teléfono: formato chileno automático.

### 12. Cliente tome foto del operador al llegar (verificación)
- **Idea:** Opción para que el cliente tome una foto del operador al confirmar ingreso.
- **Uso:** Verificación de identidad, trazabilidad.
- **Consideraciones:** Privacidad, consentimiento.

---

## 🟢 Prioridad baja

### 13. Transiciones de pantalla
- Fade-in suave al montar.
- Slide desde abajo en modales.

### 14. Pull-to-refresh
- En historial y listas de servicios.

### 15. Modo offline
- Banner "Sin conexión".
- Deshabilitar acciones que requieran red.

### 16. Onboarding primera vez
- Cliente: 1–2 pantallas con beneficios.
- Proveedor: guía corta para publicar primera máquina.

---

## Reglas UX (UX_REGLAS.md)

- **Guardado:** Siempre guardar en localStorage al avanzar.
- **Progreso:** "Paso X de N" visible.
- **Un CTA principal** por pantalla.
- **Fotos:** 1 frontal obligatoria, lateral/trasera opcionales; preferir cámara inline (`capture`).
- **Notificaciones:** Solo en hitos clave, sin saturar.

---

## Fuentes de verdad

| Área | Archivo |
|------|---------|
| Precios | `backend/pricing/constants.py`, `frontend/utils/pricing.js` |
| UX | `frontend/UX_REGLAS.md`, `UX_PRIME_MEJORAS.md` |
| Navegación | `ANALISIS_MVP_NAVEGACION.md` |
| **Análisis profundo** | `ANALISIS_PROFUNDO_MAQGO.md` |

---

## Próximos pasos sugeridos

1. **Sprint seguridad (crítico):** Rutas sin auth, CORS, headers, validación password. Ver `ANALISIS_PROFUNDO_MAQGO.md` §7.
2. **Sprint 1:** Items 4–7 (foto operador al cliente, diálogos, skeletons, vibración).
3. **Sprint 2:** Items 8–10 (progreso, toast, empty states).
4. **Sprint 3:** Items 11–12 (validación, foto cliente al operador).
