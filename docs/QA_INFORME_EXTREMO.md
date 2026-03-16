# QA Extremo – MAQGO
**Fecha:** 4 Mar 2025  
**Alcance:** Frontend, Backend, Rutas, ESLint, Tests, Flujos críticos

---

## 1. RESUMEN EJECUTIVO

| Área | Estado | Detalle |
|------|--------|---------|
| Build frontend | ✅ OK | Compila correctamente |
| Rutas / Imports | ✅ OK | Corregidos RequestReceived, ReservationDataScreen |
| Tests backend | ⚠️ Parcial | 11/17 pasan (6 fallan por fixtures DB) |
| ESLint | ❌ Errores | ~20+ errores/warnings |
| Flujos críticos | ✅ Verificados | Rutas definidas y coherentes |

---

## 2. BUILD Y ESTRUCTURA

### Frontend
- **Build:** `npm run build` → ✅ Exitoso
- **Rutas:** 60+ rutas definidas en App.jsx
- **Correcciones recientes:**
  - Eliminado import inexistente `RequestReceived`
  - `ReservationDataScreen` → reemplazado por `ServiceLocationScreen` en `/client/reservation-data`

### Backend
- **Tests:** 17 tests en `backend/tests/test_operators_api.py`
- **Resultado:** 11 passed, 6 failed
- **Causa de fallos:** "Dueño no encontrado" / "Usuario no encontrado" – tests requieren DB con usuarios de prueba o fixtures

---

## 3. ERRORES ESLINT (Prioridad alta)

### App.jsx
- `userRole`, `userId` declarados pero no usados (líneas 126-127)

### ChatBot.js
- `error` en catch no usado (línea 115)
- `process` no definido (línea 384) – usar `import.meta.env` en Vite

### AddressAutocomplete.js
- `comunaValue`, `comunaPlaceholder` no usados
- `setUseGooglePlaces(true)` dentro de useEffect – riesgo de cascading renders

### ChatFloatingButton.js
- `setHasNewMessage(true)` dentro de useEffect – mismo patrón

### ServiceChat.js
- `userName` no usado
- `fetchMessages` y `scrollToBottom` usados antes de declararse (orden de funciones)

### ServiceDetailBreakdown.js
- Componente `Row` definido dentro del render – se recrea en cada render

---

## 4. FLUJOS CRÍTICOS VERIFICADOS

### Cliente – Reserva
| Paso | Ruta | Componente | Estado |
|------|------|------------|--------|
| Inicio | `/` | WelcomeScreen | ✅ |
| Arrendar | `/client/home` | ClientHome | ✅ |
| Maquinaria | `/client/machinery` | MachinerySelection | ✅ |
| Horas | `/client/hours-selection` | HoursSelectionScreen | ✅ |
| Urgencia | `/client/urgency` | UrgencySelectionScreen | ✅ |
| Calendario | `/client/calendar-multi` | CalendarMultiDayScreen | ✅ |
| Reserva data | `/client/reservation-data` | ServiceLocationScreen | ✅ (corregido) |
| Ubicación | `/client/service-location` | ServiceLocationScreen | ✅ |
| Proveedores | `/client/providers` | ProviderOptionsScreen | ✅ |
| Confirmar | `/client/confirm` | ConfirmServiceScreen | ✅ |

### Proveedor – Onboarding
| Paso | Ruta | Componente | Estado |
|------|------|------------|--------|
| Registro | `/provider/register` | ProviderRegisterScreen | ✅ |
| Verificación | `/provider/verify-sms` | ProviderVerifySMSScreen | ✅ |
| Datos | `/provider/data` | ProviderDataScreen | ✅ |
| Máquina | `/provider/machine-data` | MachineDataScreen | ✅ |
| Fotos | `/provider/machine-photos` | MachinePhotosScreen | ✅ |
| Precios | `/provider/pricing` | PricingScreen | ✅ |
| Operador | `/provider/operator-data` | OperatorDataScreen | ✅ |
| Revisión | `/provider/review` | ReviewScreen | ✅ |
| Home | `/provider/home` | ProviderHomeScreen | ✅ |

### WelcomeScreen (cambios recientes)
- Footer: "Ir a mi cuenta" O "Iniciar sesión" (no ambos)
- Banner "¿Continuar donde quedaste?" solo si hay maquinaria seleccionada
- Admin solo visible para rol admin
- Eliminado "Ver onboarding cliente" (redundante)

---

## 5. RUTAS POTENCIALMENTE HUÉRFANAS

Rutas definidas pero sin navegación directa desde la UI principal:
- `/client/hours` – HoursSelection (¿usado o reemplazado por hours-selection?)
- `/client/calendar` – CalendarSelection (usa reservation-data)
- `/client/detalle-servicio` – ServiceDetailDemoScreen (demo)

---

## 6. RECOMENDACIONES PRIORITARIAS

### P0 – Crítico
1. **Corregir ESLint en ChatBot.js:** `process` → `import.meta.env.VITE_*` o variable de entorno válida
2. **ServiceChat.js:** Mover `fetchMessages` y `scrollToBottom` antes del useEffect que los usa

### P1 – Importante
3. **App.jsx:** Usar o eliminar `userRole`, `userId` (o prefijar con `_` si son intencionalmente no usados)
4. **ServiceDetailBreakdown.js:** Extraer `Row` y `Divider` fuera del componente
5. **AddressAutocomplete / ChatFloatingButton:** Revisar setState en useEffect (considerar inicialización en useState)

### P2 – Mejora
6. **Tests backend:** Crear fixtures o seed data para tests de operadores/invitaciones
7. **Documentar** flujo exacto cliente inmediato vs programado (CalendarSelection vs CalendarMultiDayScreen)

---

## 7. CHECKLIST QA MANUAL SUGERIDO

- [ ] Welcome: Los 3 CTAs navegan correctamente
- [ ] Cliente: Flujo Inicio HOY → Maquinaria → Horas → Ubicación → Proveedores → Confirmar
- [ ] Cliente: Flujo Programar → Calendario → Ubicación → Proveedores → Confirmar
- [ ] Proveedor: Registro completo hasta ProviderHome
- [ ] Operador: Join con código → OperatorHome
- [ ] ChatBot: Preguntas de registro muestran botones "Ir a arrendar" / "Ofrecer mi maquinaria"
- [ ] Footer Welcome: Solo un enlace de sesión (Ir a mi cuenta O Iniciar sesión)
- [ ] Admin: Solo visible con userRole=admin

---

*Generado por QA extremo – Revisar y priorizar correcciones según impacto.*
