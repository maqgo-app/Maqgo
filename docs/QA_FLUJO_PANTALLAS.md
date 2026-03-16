# MAQGO – Revisión QA completa por pantallas

Documento detallado de todas las pantallas de la app.  
**Última actualización:** Feb 2025

---

# ÍNDICE

1. [Públicas / Welcome](#1-públicas--welcome)
2. [Autenticación](#2-autenticación)
3. [Cliente – Reserva](#3-cliente--reserva)
4. [Cliente – Pago](#4-cliente--pago)
5. [Cliente – Servicio activo](#5-cliente--servicio-activo)
6. [Cliente – Post servicio](#6-cliente--post-servicio)
7. [Proveedor – Onboarding](#7-proveedor--onboarding)
8. [Proveedor – Operación](#8-proveedor--operación)
9. [Operador](#9-operador)
10. [Admin](#10-admin)
11. [Legales y perfil](#11-legales-y-perfil)

---

# 1. PÚBLICAS / WELCOME

## 1.1 WelcomeScreen
**Rutas:** `/`, `/welcome`

### Contenido
- **Logo:** MaqgoLogo (145px móvil, 200px desktop)
- **Badge:** "ARRIENDO POR HORAS, DÍAS O SEMANAS"
- **Título:** "Maquinaria pesada donde la necesitas"
- **Subtítulo:** "Arriendo inmediato o programado. Sin contratos. Paga solo cuando aceptan tu reserva."

### CTAs principales
| CTA | Destino | Subtítulo |
|-----|---------|-----------|
| Arrendar maquinaria | `/client/home` | "Inmediato o programado · Empezar sin registro" |
| Ofrecer mi maquinaria | `/provider/register` | "Proveedor · Recibe solicitudes" |
| Soy operador | `/operator/join` | "Unirme con código de equipo" |

### Footer
- **"Ir a mi cuenta"** (si `localStorage.userId`) → según rol: `/admin`, `/provider/home`, `/operator/home`, `/client/home`
- **"Ya tengo cuenta"** → `/login`
- **FAQ** → `/faq`
- **Términos** → `/terms`
- **Privacidad** → `/privacy`
- **Admin** → `/admin` (badge si `adminPending > 0`)

### localStorage
- `userId`, `userRole`, `providerRole`, `token` (lectura para `hasSession`)

### Verificaciones QA
- [ ] Logo responsive en móvil y desktop
- [ ] Los 3 CTAs navegan correctamente
- [ ] "Ir a mi cuenta" solo con sesión
- [ ] Footer y rutas legales funcionan
- [ ] `document.title` = "MAQGO - Maquinaria pesada donde la necesitas"

---

# 2. AUTENTICACIÓN

## 2.1 LoginScreen
**Ruta:** `/login`

### Contenido
- Email, contraseña
- Logo
- Mensajes de error

### CTAs
- **Iniciar sesión** → `/admin`, `/client/home` o `/provider/home` según rol
- **¿Olvidaste contraseña?** → `/forgot-password`
- **Regístrate** → `/register`

### localStorage
- `userId`, `userRole`, `providerRole`, `token` (escritura)

### Validación
- Email y contraseña obligatorios

### API
- POST `/api/auth/login`

---

## 2.2 RegisterScreen
**Ruta:** `/register`

### Contenido
- Nombre, apellido, email, celular (+56), contraseña
- Checkbox T&C
- TermsModal

### CTAs
- **Continuar** → `/select-channel`
- **Inicia sesión** → `/login`

### localStorage
- `registerData` (escritura)

### Validación
- Todos los campos + checkbox T&C
- Celular máx. 9 dígitos

---

## 2.3 SelectChannelScreen
**Ruta:** `/select-channel`

### Contenido
- Número de teléfono formateado
- Envío de código SMS

### CTAs
- **Enviar código SMS** → `/verify-sms`
- **Volver** → -1

### localStorage
- `registerData`, `verificationChannel` (lectura/escritura)

### API
- POST `/api/communications/sms/send-otp`

---

## 2.4 VerifySMSScreen
**Ruta:** `/verify-sms`

### Contenido
- 6 inputs OTP
- Timer expiración 5 min
- Cooldown reenvío 30 s

### CTAs
- **Verificar** → `/verified`
- **Reenviar código**

### localStorage
- `registerData`, `verificationChannel`, `phoneVerified`

### Validación
- Código 6 dígitos
- Expiración

### API
- POST `/api/communications/sms/verify-otp`

---

## 2.5 VerifiedScreen
**Ruta:** `/verified`

### Contenido
- Icono éxito
- Mensaje de verificación

### CTAs
- **Continuar** → `/select-role` (auto-redirección 2.5 s)

---

## 2.6 RoleSelection
**Ruta:** `/select-role`

### Contenido
- Opciones Cliente / Proveedor

### CTAs
- **Cliente** → `/client/home` (o `returnUrl`)
- **Proveedor** → `/provider/data`

### localStorage
- `registerData`, `userId`, `userRole`, `providerOnboardingCompleted`, `providerReturnUrl`

### API
- POST `/api/users`

---

## 2.7 CodeExpiredScreen / CodeIncorrectScreen
**Rutas:** `/code-expired`, `/code-incorrect`

### Contenido
- Mensaje de error
- **Reintentar** → `/verify-sms`

---

# 3. CLIENTE – RESERVA

## 3.1 ClientHome
**Ruta:** `/client/home`

### Contenido
- Logo
- Título: "Arrendar maquinaria"
- **Tarjeta Inicio HOY** (prioritaria)
- **Tarjeta Programar arriendo**
- Microcopy: "En horas, no días. Paga solo al confirmar."

### Lógica al elegir
- **Inmediato:** `reservationType='immediate'`, limpia `selectedHours`, `clientBookingStep='machinery'` → `/client/machinery`
- **Programado:** `reservationType='scheduled'`, `selectedHours='8'`, `clientBookingStep='machinery'` → `/client/machinery`

### Modal "Reserva en progreso"
- Si `clientBookingStep` + `selectedMachinery` en localStorage
- **Continuar** → ruta guardada
- **Nuevo arriendo** → limpia `clientBookingStep`, `selectedMachinery`, `selectedHours`, `reservationType`, `priceType`

### Verificaciones QA
- [ ] Inicio HOY y Programar navegan a maquinaria
- [ ] Modal aparece cuando corresponde
- [ ] "Nuevo arriendo" limpia todo correctamente

---

## 3.2 MachinerySelection
**Ruta:** `/client/machinery`

### Contenido
- Lista de maquinarias con iconos
- BookingProgress

### Lógica de navegación
- **Si programado:** → `/client/calendar`
- **Si inmediato + por viaje** (camion_pluma, camion_aljibe, camion_tolva): → `/client/urgency`
- **Si inmediato + por hora** (resto): → `/client/hours-selection`

### localStorage
- `selectedMachinery`, `priceType`, `clientBookingStep`

### Verificaciones QA
- [ ] Programado → calendario
- [ ] Camiones → UrgencySelection
- [ ] Retroexcavadora, excavadora, etc. → HoursSelection

---

## 3.3 UrgencySelectionScreen
**Ruta:** `/client/urgency`  
**Solo para maquinaria por viaje (camiones).**

### Opciones
| Opción | Horas | Destino |
|--------|-------|---------|
| Urgente | 4 | `/client/service-location` |
| Express | 5 | `/client/service-location` |
| Hoy | 6 | `/client/service-location` |
| Programado | 8 | `/client/calendar` |

### localStorage
- `urgencyType`, `urgencyBonus`, `selectedHours`, `reservationType`, `clientBookingStep`

### Verificaciones QA
- [ ] `reservationType='immediate'` al elegir Urgente/Express/Hoy
- [ ] `reservationType='scheduled'` al elegir Programado
- [ ] `selectedHours` correcto (4, 5, 6 u 8)

---

## 3.4 HoursSelectionScreen
**Ruta:** `/client/hours-selection`  
**Solo para maquinaria por hora.**

### Contenido
- Selector de horas (4–8)
- Badge "INICIO HOY"
- Texto: "¿Cuántas horas necesitas?"

### CTAs
- **Continuar** → `/client/service-location`

### localStorage
- `selectedHours`, `additionalDays`, `reservationType`, `todayMultiplier`

### Verificaciones QA
- [ ] Horas se leen de localStorage al volver
- [ ] Horas 4–8 válidas
- [ ] Navega a service-location con datos correctos

---

## 3.5 CalendarSelection
**Ruta:** `/client/calendar`

### Contenido
- Calendario mensual
- Selector de fecha
- Navegación prev/next mes
- Días pasados y domingos bloqueados

### CTAs
- **Continuar** → `/client/reservation-data`

### localStorage
- `selectedDate` (escritura)

### Validación
- Solo fechas futuras
- Domingos bloqueados
- Requiere fecha seleccionada

---

## 3.6 CalendarMultiDayScreen
**Ruta:** `/client/calendar-multi`

### Contenido
- Calendario multi-día (2 meses)
- Selector múltiple de fechas
- Badge según tipo (viaje vs hora)

### CTAs
- **Continuar** → `/client/service-location` o `/client/machinery` según tipo

### localStorage
- `selectedDates`, `selectedDate`, `selectedHours`, `priceType`, `selectedMachinery`

### Validación
- Al menos una fecha
- Domingos y pasadas bloqueadas

---

## 3.7 ReservationDataScreen
**Ruta:** `/client/reservation-data`  
**Solo para programado.**

### Contenido
- Dirección, comuna (ComunaAutocomplete)
- Horas fijas 8
- Resumen (modalidad, maquinaria, fecha)

### CTAs
- **Continuar** → `/client/service-location`

### localStorage
- `reservationType`, `selectedDate`, `selectedMachinery`, `serviceLocation`, `serviceComuna`, `reservationData`, `clientBookingStep`, `selectedHours`

### Validación
- Comuna en `COMUNAS_NOMBRES`
- Dirección y comuna obligatorias

---

## 3.8 ServiceLocationScreen
**Ruta:** `/client/service-location`

### Contenido
- Dirección, comuna (ComunaAutocomplete), referencia opcional
- Resumen de maquinaria y horas

### CTAs
- **Ver proveedores disponibles** → `/client/providers`

### localStorage
- `selectedMachinery`, `selectedHours`, `reservationType`, `selectedDate`, `serviceLocation`, `serviceComuna`, `serviceReference`

### Validación
- Comuna en `COMUNAS_NOMBRES`
- Dirección y comuna obligatorias

### Verificaciones QA
- [ ] Horas correctas según tipo (immediate vs scheduled)
- [ ] `saveBookingProgress('location')`

---

## 3.9 ProviderOptionsScreen
**Ruta:** `/client/providers`

### Contenido
- Lista de 5 proveedores con precio total
- Badge: "HOY · Prioritario" o "Programado"
- Info: "Servicio prioritario · X horas" o "Jornada fija 8 horas"
- ETA, distancia, rating por proveedor

### Estados especiales
- **NoProvidersTryTomorrow:** si inmediato + isDemo + tomorrowAvailable
- **NoProvidersError:** si no hay proveedores

### CTAs
- **Seleccionar** (por proveedor) → `/client/confirm`
- **Reservar para mañana** → `/client/reservation-data` (con mañana preseleccionada)
- **Modificar solicitud** → `/client/home`

### localStorage
- `selectedProvider`, `matchedProviders`, `totalAmount` (escritura)

### Validación
- Precio con `calculateClientPrice()` (utils/pricing.js)
- Horas sincronizadas con localStorage

### Verificaciones QA
- [ ] Precio coincide con fórmula compartida
- [ ] Horas mostradas correctas
- [ ] "No hay proveedores hoy pero sí mañana" cuando aplica
- [ ] totalAmount guardado correcto

---

## 3.10 ConfirmServiceScreen
**Ruta:** `/client/confirm`

### Contenido
- ¿Necesitas factura? (Sí/No)
- Total a pagar
- Desglose de precio (expandible)
- Botón confirmar

### CTAs
- **Confirmar** → `/client/billing` (con factura) o `/client/card` (sin factura)
- **Elegir otro proveedor** → `/client/providers`

### localStorage
- `totalAmount`, `maxTotalAmount`, `needsInvoice` (escritura)

### API
- POST `/api/pricing/immediate` o `scheduled` o `hybrid`
- Fallback: `buildPricingFallback()` en utils/pricing.js

### Verificaciones QA
- [ ] Precio coincide con ProviderOptionsScreen (sin factura)
- [ ] Con factura, IVA correcto
- [ ] totalAmount = precio mostrado

---

# 4. CLIENTE – PAGO

## 4.1 BillingDataScreen
**Ruta:** `/client/billing`

### Contenido
- Tipo facturación: Persona / Empresa
- Formulario según tipo (nombre/RUT o razón social, RUT, giro, dirección)

### CTAs
- **Continuar** → `/client/card`

### localStorage
- `registerData`, `billingData`

### Validación
- RUT con `validateRut`
- Persona: nombre + RUT
- Empresa: razón social + RUT + giro

---

## 4.2 CardPaymentScreen
**Ruta:** `/client/card`

### Contenido
- Email
- Datos facturación (si needsInvoice)
- Nota Transbank
- LegalChargeNotice

### CTAs
- **Registrar tarjeta** → redirección Transbank
- **Modificar datos** → `/client/billing`

### localStorage
- `registerData`, `billingData`, `needsInvoice`, `clientEmail`

### Validación
- Email requerido, formato válido

### API
- POST `/api/payments/oneclick/start`

---

## 4.3 OneClickCompleteScreen
**Ruta:** `/oneclick/complete`

### Contenido
- Pantalla de carga con spinner
- Recibe `tbk_user` por query (retorno Transbank)

### Comportamiento
- Si no hay `tbk_user` → `/client/card`
- POST `/api/payments/oneclick/save`
- Redirige a `/client/searching`

### localStorage
- `tbk_user`, `oneclick_username`, `clientEmail`, `currentServiceId`

---

## 4.4 CardInput
**Ruta:** `/client/card-input`

### Contenido
- Formulario tarjeta (número, mes, año, CVC)
- Alerta de cobro $50

### CTAs
- **Continuar** → `/client/searching`

### Validación
- Número ≥15 dígitos, mes/año, CVC ≥3

### API
- POST `/api/payments/validate`

---

## 4.5 SearchingProviderScreen
**Ruta:** `/client/searching`

### Contenido
- Búsqueda secuencial de proveedores
- Timer 60s por proveedor
- Estados: loading, searching, found, not_found, no_eligible
- Garantía de precio

### CTAs
- **Cancelar búsqueda** → `/client/providers`
- **Ver otras opciones** → `/client/providers`
- **Elegir otra fecha** → `/client/home`
- **Reintentar** → reinicia búsqueda

### localStorage
- `selectedProvider`, `matchedProviders`, `selectedHours`, `maxTotalAmount`, `acceptedProvider`, `serviceTotal`, `serviceStatus`

### Comportamiento
- Demo acepta en 1.5–3 s
- Al encontrar → `/client/payment-result`
- Sonidos y vibración

---

## 4.6 WaitingConfirmationScreen
**Ruta:** `/client/waiting-confirmation`

### Contenido
- Mensaje de búsqueda
- Reloj animado
- Tiempo transcurrido
- Nota de no cobro

### CTAs
- **Cancelar solicitud** → `/client/home` (con confirm)

### Comportamiento
- Tras 5 s → `/client/assigned`
- Contador y animación

---

## 4.7 PaymentResultScreen
**Ruta:** `/client/payment-result`

### Contenido
- Estados: processing, success, error
- Desglose de cobro
- Operador asignado
- Mapa
- WhatsApp

### CTAs
- **Ver seguimiento** → `/client/assigned`
- **Reintentar** → `/client/card`
- **Ver otros proveedores** → `/client/providers`

### localStorage
- `selectedProvider`, `selectedHours`, `reservationType`, `serviceLocation`, `selectedMachinery`, `selectedDate`, `orderNumber`, `userPhone`
- `clientBookingStep` (remove)
- `clearBookingProgress`

### Comportamiento
- Simula pago 2.5 s
- POST `/api/auth/login`

---

# 5. CLIENTE – SERVICIO ACTIVO

## 5.1 MachineryAssignedScreen
**Ruta:** `/client/assigned`

### Contenido
- Mapa OnTheWayMap
- Operador asignado
- ETA
- Banner "operador cerca"
- Incidentes
- No-Show
- Demo: "Simular llegada"

### CTAs
- **Simular llegada** → `/client/provider-arrived`
- **Reportar No-Show** → modal
- **Confirmar y cancelar** → `/client/home`

### localStorage
- `selectedProvider`, `selectedMachinery`, `serviceLocation`, `selectedHours`, `serviceTotal`, `serviceStatus`, `serviceAssignedTime`, `activeIncident`, `operatorArrived`, `noShowEvents`, `cancelReason`, `cancelCharge`

### Comportamiento
- ETA + 30 min → opción No-Show
- Chequeo de `operatorArrived` cada 2 s
- Sonidos y vibración

---

## 5.2 ProviderArrivedScreen
**Ruta:** `/client/provider-arrived`

### Contenido
- Timer 30 min
- Patente
- Datos operador
- Recordatorios 5/15/25 min
- ChatFloatingButton

### CTAs
- **¡Ya voy!** → avisa al operador
- **Permitir entrada** → `/client/service-active`

### localStorage
- `acceptedProvider`, `selectedProvider`, `selectedMachinery`, `selectedHours`, `currentServiceId`, `userName`, `clientAcceptedEntry`, `autoStartedService`, `serviceStartTime`, `clientOnTheWay`, `clientOnTheWayTime`

### Comportamiento
- Auto-inicio si no responde en 30 min
- Recordatorios con vibración

---

## 5.3 ServiceActiveScreen
**Ruta:** `/client/service-active`

### Contenido
- Badge SERVICIO EN CURSO
- Detalles maquinaria/proveedor

### CTAs
- **Finalizar servicio** (Demo) → `/client/service-finished`

### localStorage
- `currentServiceId`, `selectedMachinery`

### Comportamiento
- Polling cada 5 s
- Demo con botón de finalizar

---

## 5.4 ServiceInProgress
**Ruta:** `/client/in-progress`

### Contenido
- Icono activo
- Badge ACTIVO
- Detalles de servicio

### localStorage
- `currentServiceId`

### Comportamiento
- Polling cada 5 s
- Si `last_30` → `/client/last-30`
- Si `finished` → `/client/finished`

---

## 5.5 Last30Minutes
**Ruta:** `/client/last-30`

### Contenido
- Alerta últimos 30 min
- Mensaje de cierre automático

### CTAs
- **Volver a Servicio** → `/client/in-progress`

### Comportamiento
- Sonido y vibración al cargar

---

# 6. CLIENTE – POST SERVICIO

## 6.1 ServiceFinishedScreen
**Ruta:** `/client/service-finished`
**Ruta alternativa:** `/client/finished`

### Contenido
- Flujo en 3 pasos: reporte → rating → done
- Desglose de costos
- Estrellas 1–5
- Comentario opcional

### CTAs
- **Continuar a evaluación** → paso rating
- **Enviar evaluación** → `/client/home`
- **Omitir** → `/client/home`

### localStorage
- `selectedMachinery`, `selectedProvider`, `selectedHours`, `serviceLocation`, `servicePricing`, `needsInvoice`, `currentServiceId`, `userId`

### Validación
- Rating obligatorio (1–5 estrellas)

### API
- POST `/api/ratings`

---

## 6.2 RateService
**Ruta:** `/client/rate`

### Contenido
- Estrellas 1–5
- Comentario opcional

### CTAs
- **ENVIAR EVALUACIÓN** → `/client/summary`

### localStorage
- `currentServiceId`, `userId`

### API
- POST `/api/ratings`

---

## 6.3 ServiceSummary
**Ruta:** `/client/summary`

### Contenido
- Resumen (fecha, maquinaria, horas, total)

### CTAs
- **Nuevo arriendo** → `/client/home`

### localStorage
- `currentServiceId` (read/remove)

### API
- GET `/api/service-requests/:id`

---

## 6.4 ServiceConfirmed
**Ruta:** `/client/service-confirmed`

### Contenido
- Icono éxito
- Resumen de servicio
- Desglose de costos

### CTAs
- **VER SERVICIO EN CURSO** → `/client/in-progress`

### API
- GET `/api/service-requests/:id`

---

## 6.5 HistoryScreen
**Ruta:** `/client/history`

### Contenido
- Tabs Completados / Cancelados
- Lista de servicios
- Máscaras de privacidad (nombre, ubicación)

### CTAs
- **Repetir** → `/client/providers`
- **Volver / Nuevo arriendo** → `/client/home` o `/provider/home`

### localStorage
- `userRole`, `serviceHistory`
- `selectedMachinery`, `selectedHours`, `reservationType` (write en Repetir)

### Comportamiento
- Diferencia cliente/proveedor
- Demo si no hay historial

---

## 6.6 CancelServiceScreen
**Ruta:** `/client/cancel`

### Contenido
- Razones de cancelación
- Cargo según estado
- Modal de confirmación

### CTAs
- **Cancelar servicio** → abre modal
- **Confirmar** → `/client/home`
- **Volver** → -1

### localStorage
- `serviceTotal`, `totalAmount`, `maxTotalAmount`, `serviceStatus`, `currentServiceId`, `selectedProvider`

### Comportamiento
- Cargos: pending 0%, assigned 20%, en_route 40%, arrived 60%
- Doble confirmación

---

## 6.7 ServiceNotificationScreen
**Ruta:** `/client/notification`

### Contenido
- Estados según `type`: provider_cancelled, cancelled_valid, cancelled_charge, request_expired, provider_rejected
- Componentes ErrorStates

### CTAs
- Según ErrorState: onSearchOther → `/client/providers`; onClose/onViewOthers → `/client/home`

### localStorage
- `serviceNotification`, `cancellationCharge`
- `amount` por query

---

## 6.8 WorkdayConfirmation
**Ruta:** `/client/workday-confirmation`

### Contenido
- Jornada estándar 8h + 1h colación
- Checkbox aceptación

### CTAs
- **Confirmar Jornada** → `/client/billing`

### Validación
- Checkbox obligatorio

---

## 6.9 ServiceDetailDemoScreen
**Ruta:** `/client/detalle-servicio`

### Contenido
- Selector client/provider/admin
- ServiceDetailBreakdown con ejemplo

### CTAs
- **Back** → -1

### Comportamiento
- Demo con EXAMPLE_SERVICE

---

# 7. PROVEEDOR – ONBOARDING

## 7.1 ProviderRegisterScreen
**Ruta:** `/provider/register`

### Contenido
- Nombre, apellido, email, celular, contraseña
- Checkbox T&C
- Propuesta: "Recibe solicitudes. Tú decides cuándo."

### CTAs
- **Continuar** → `/provider/select-channel`

### localStorage
- `registerData` (con role: 'provider')

### API
- POST `/api/auth/register`

---

## 7.2 ProviderSelectChannelScreen / ProviderVerifySMSScreen / ProviderVerifiedScreen
**Rutas:** `/provider/select-channel`, `/provider/verify-sms`, `/provider/verified`

### Flujo
- Similar a cliente pero con flujo propio de proveedor
- `/provider/verified` → `/provider/data`

---

## 7.3 ProviderDataScreen
**Ruta:** `/provider/data`

### Contenido
- Nombre empresa, RUT, giro, comuna, dirección
- Hora de cierre
- Validación RUT
- Autocompletado comunas

### CTAs
- **Continuar** → `/provider/machine-data`
- **Volver** → `/select-role`

### localStorage
- `providerData`, `providerOnboardingStep`

---

## 7.4 MachineDataScreen
**Ruta:** `/provider/machine-data`  
**Rutas alternativas:** `/provider/add-machine`, `/provider/edit-machine/:id`

### Contenido
- Tipo de maquinaria
- Datos técnicos
- Modo edición para máquinas existentes

### CTAs
- **Continuar** → `/provider/machine-photos` o `/provider/machines`
- **Volver** → según modo

---

## 7.5 MachinePhotosScreen
**Ruta:** `/provider/machine-photos`

### Contenido
- Subida de fotos de maquinaria

### CTAs
- **Continuar** → `/provider/pricing`

---

## 7.6 PricingScreen
**Ruta:** `/provider/pricing`

### Contenido
- Precio por hora o por servicio
- Referencias según tipo de maquinaria

### CTAs
- **Continuar** → `/provider/operator-data`

---

## 7.7 OperatorDataScreen
**Ruta:** `/provider/operator-data`

### Contenido
- Datos del operador (nombre, RUT, teléfono)

### CTAs
- **Continuar** → `/provider/review`
- **Volver** → `/provider/pricing`

---

## 7.8 ReviewScreen
**Ruta:** `/provider/review`

### Contenido
- Resumen del onboarding
- Confirmación final

### CTAs
- **Confirmar** → `/provider/home` o `returnUrl`
- **Volver** → `/provider/operator-data`

---

# 8. PROVEEDOR – OPERACIÓN

## 8.1 ProviderHomeScreen
**Ruta:** `/provider/home`

### Contenido
- Estado de disponibilidad
- Accesos rápidos
- Solicitudes pendientes

### CTAs
- **Solicitud recibida** → `/provider/request-received`
- **Perfil** → `/provider/profile`
- **Completar onboarding** → `/provider/data`

---

## 8.2 ProviderAvailability
**Ruta:** `/provider/availability`

### Contenido
- Toggle disponibilidad

### CTAs
- **Volver** → `/provider/request`

---

## 8.3 RequestReceivedScreen / RequestReceived
**Rutas:** `/provider/request`, `/provider/request-received`

### Contenido
- Detalle de solicitud
- Aceptar / Rechazar
- Timer de expiración

### CTAs
- **Aceptar** → `/provider/select-operator` o `/provider/en-route`
- **Rechazar** → `/provider/availability`
- **Expirado** → `/provider/home`

---

## 8.4 ServiceAccepted
**Ruta:** `/provider/accepted`

### Contenido
- Confirmación de aceptación

---

## 8.5 SelectOperatorScreen
**Ruta:** `/provider/select-operator`

### Contenido
- Selección de operador para el servicio

### CTAs
- **Continuar** → `/provider/en-route`

---

## 8.6 EnRouteScreen
**Ruta:** `/provider/en-route`

### Contenido
- Operador en camino

### CTAs
- **Llegué** → `/provider/arrival`

---

## 8.7 ArrivalScreen
**Ruta:** `/provider/arrival`

### Contenido
- Confirmación de llegada

### CTAs
- **Iniciar servicio** → `/provider/service-active`

---

## 8.8 ProviderServiceActiveScreen
**Ruta:** `/provider/service-active`

### Contenido
- Servicio en curso

---

## 8.9 Last30MinutesProvider
**Ruta:** `/provider/last-30`

### Contenido
- Alerta últimos 30 min

### CTAs
- **Continuar** → `/provider/finished`

---

## 8.10 ProviderServiceFinishedScreen / ServiceFinishedProvider
**Rutas:** `/provider/service-finished`, `/provider/finished`

### Contenido
- Servicio finalizado

### CTAs
- **Volver** → `/provider/home`

---

## 8.11 RateClient / RateClientScreen
**Rutas:** `/provider/rate`, `/provider/rate-client`

### Contenido
- Evaluación del cliente

### CTAs
- **Enviar** → `/provider/availability`

---

## 8.12 MyMachinesScreen
**Ruta:** `/provider/machines`

### Contenido
- Lista de maquinarias
- Agregar / Editar

### CTAs
- **Agregar** → `/provider/add-machine`
- **Editar** → `/provider/edit-machine/:id`

---

## 8.13 ProviderDashboardSimple
**Rutas:** `/provider/cobros`, `/provider/my-services`, `/provider/dashboard`

### Contenido
- Cobros y facturación

---

## 8.14 ProviderHistoryScreen
**Ruta:** `/provider/history`

### Contenido
- Historial de servicios

### CTAs
- **Subir factura** → `/provider/upload-invoice/:id`

---

## 8.15 ProviderProfileScreen
**Ruta:** `/provider/profile`

### Contenido
- Perfil del proveedor
- Accesos: Empresa, Banco, Operadores, Historial, FAQ, Términos

### CTAs
- **Inicio** → `/provider/home`
- **Mis máquinas** → `/provider/machines`
- **Cobros** → `/provider/cobros`
- **Empresa** → `/provider/profile/empresa`
- **Banco** → `/provider/profile/banco`
- **Operadores** → `/operator/home`
- **Historial** → `/provider/history`

---

## 8.16 UploadInvoiceScreen
**Rutas:** `/provider/upload-invoice`, `/provider/upload-invoice/:serviceId`

### Contenido
- Subida de factura

### CTAs
- **Continuar** → `/provider/cobros`

---

## 8.17 EmpresaScreen / BancoScreen
**Rutas:** `/provider/profile/empresa`, `/provider/profile/banco`

### Contenido
- Datos de empresa y banco

### CTAs
- **Guardar** → `/provider/profile`

---

# 9. OPERADOR

## 9.1 OperatorJoinScreen
**Ruta:** `/operator/join`

### Contenido
- Paso 1: Código de equipo (4+ caracteres)
- Paso 2: Nombre, RUT, celular
- Paso 3: Éxito

### CTAs
- **Validar código** → paso 2
- **Unirse** → paso 3
- **Ir al home** → `/operator/home`

### localStorage
- `userId`, `userRole`, `providerRole`, `ownerId`, `operatorName`, `operatorPhone`

### API
- POST `/api/operators/join`

---

## 9.2 OperatorHomeScreen
**Ruta:** `/operator/home`

### Contenido
- Servicios asignados
- Estado de operación

### CTAs
- **Solicitud** → `/provider/request-received`
- **Historial** → `/operator/history`

---

## 9.3 OperatorHistoryScreen
**Ruta:** `/operator/history`

### Contenido
- Historial de servicios del operador

---

## 9.4 OperatorServiceCompletedScreen
**Ruta:** `/operator/completed`

### Contenido
- Servicio completado

### CTAs
- **Volver** → `/operator/home`

---

# 10. ADMIN

## 10.1 AdminDashboard
**Ruta:** `/admin`

### Contenido
- Lista de servicios
- Stats (pending_review, approved, invoiced, paid, disputed)
- Finanzas (totalGross, totalNet, comisiones)
- Filtros
- Modal de factura

### CTAs
- **Usuarios** → `/admin/users`
- **Precios** → `/admin/pricing`
- **Volver** → `/`

### API
- GET `/api/services/admin/all`

---

## 10.2 AdminPricingScreen
**Ruta:** `/admin/pricing`

### Contenido
- Precios de referencia por maquinaria

### CTAs
- **Volver** → `/admin`

---

## 10.3 AdminUsersScreen
**Ruta:** `/admin/users`

### Contenido
- Lista de usuarios

### CTAs
- **Volver** → `/admin`

---

# 11. LEGALES Y PERFIL

## 11.1 FAQScreen
**Ruta:** `/faq`

### Contenido
- Tabs Clientes / Proveedores / Operadores
- Acordeón de preguntas

### CTAs
- **Términos** → `/terms`
- **Privacidad** → `/privacy`
- **Volver** → -1

---

## 11.2 TermsScreen
**Ruta:** `/terms`

### Contenido
- 10 secciones de términos y condiciones

### CTAs
- **Volver** → -1

---

## 11.3 PrivacyScreen
**Ruta:** `/privacy`

### Contenido
- 9 secciones de política de privacidad

### CTAs
- **Volver** → -1

---

## 11.4 ProfileScreen
**Ruta:** `/profile`

### Contenido
- Avatar, nombre, apellido, email, celular
- Modo edición
- FAQ, Términos, Cerrar sesión

### CTAs
- **Editar / Cancelar**
- **Guardar cambios**
- **FAQ** → `/faq`
- **Términos** → `/terms`
- **Cerrar sesión** → modal → `/`

### localStorage
- `registerData`, `userRole`
- `localStorage.clear()` en logout

---

# RESUMEN DE CONSISTENCIA DE PRECIOS

| Pantalla | Fuente del precio |
|----------|-------------------|
| ProviderOptionsScreen | `calculateClientPrice()` (utils/pricing.js) |
| ConfirmServiceScreen | API `/api/pricing/immediate` o `scheduled`; fallback `buildPricingFallback()` |
| Sin factura | Confirm usa `pricing.final_price` de la API |

---

# RESUMEN DE RUTAS POR MÓDULO

| Módulo | Rutas principales |
|--------|-------------------|
| Público | `/`, `/welcome` |
| Auth | `/login`, `/register`, `/select-channel`, `/verify-sms`, `/verified`, `/select-role` |
| Cliente reserva | `/client/home`, `/client/machinery`, `/client/urgency`, `/client/hours-selection`, `/client/calendar`, `/client/calendar-multi`, `/client/reservation-data`, `/client/service-location`, `/client/providers`, `/client/confirm` |
| Cliente pago | `/client/billing`, `/client/card`, `/oneclick/complete`, `/client/card-input`, `/client/searching`, `/client/waiting-confirmation`, `/client/payment-result` |
| Cliente servicio | `/client/assigned`, `/client/provider-arrived`, `/client/service-active`, `/client/in-progress`, `/client/last-30` |
| Cliente post | `/client/provider-arrived`, `/client/service-finished`, `/client/rate`, `/client/summary`, `/client/history`, `/client/cancel`, `/client/notification`, `/client/workday-confirmation` |
| Proveedor | `/provider/register` → `/provider/verified` → `/provider/data` → `/provider/machine-data` → `/provider/machine-photos` → `/provider/pricing` → `/provider/operator-data` → `/provider/review` → `/provider/home` |
| Operador | `/operator/join` → `/operator/home` |
| Admin | `/admin`, `/admin/pricing`, `/admin/users` |
| Legales | `/faq`, `/terms`, `/privacy`, `/profile` |
