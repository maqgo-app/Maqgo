# QA pre-producción MVP – MAQGO

**Fecha:** Marzo 2025  
**Objetivo:** Determinar si la app puede pasar a producción y qué se corrigió/queda pendiente.

---

## 1. Veredicto

**Sí puede pasar a producción**, con estas condiciones:

- **Backend estable** (MongoDB, endpoints de operadores, usuarios, pagos).
- **Flujos críticos endurecidos** (onboarding proveedor P1–P6, operador solo código, invitación con nombre+RUT).
- **Riesgos conocidos** (ver abajo) aceptables para un MVP y monitoreables.

---

## 2. Correcciones aplicadas en este QA

### 2.1 Onboarding proveedor (P1 → P6)

| Paso | Problema | Solución |
|------|----------|----------|
| P1 (Datos empresa) | `JSON.parse` de `providerData`/`registerData` podía romper si localStorage corrupto | Uso de `getObject('providerData', {})` y `getObject('registerData', {})` desde `safeStorage.js` |
| P2 (Datos máquina) | `JSON.parse` de `machineData` sin protección | Uso de `getObject('machineData', {})` |
| P3 (Fotos) | `JSON.parse` de `machinePhotos` sin protección | Uso de `getArray('machinePhotos', [])` |
| P4 (Tarifas) | Falta de import de `PRICE_CAP_RULE_LABEL` → ReferenceError al validar máximo; `machineType` con mayúsculas no coincidía con constantes; useEffect sin try/catch | Import añadido; normalización de `machineType` a minúsculas; try/catch en useEffect; `setError('')` al continuar |
| P5 (Operador) | `JSON.parse` de `operatorsData` y de `registerData`/`providerData` en handleContinue podían lanzar | try/catch y fallbacks en useEffect; try/catch en handleContinue para registerData/providerData |
| P6 (Revisión) | `JSON.parse` de providerData, machineData, operatorsData, machinePhotos sin protección | Función `safeParse` con fallbacks y arrays validados |

### 2.2 Operador (solo código)

| Problema | Solución |
|----------|----------|
| Botón "Continuar" llamaba a `validateCode` (no definido) → **ReferenceError** y no avanzaba | Botón cambiado a `onClick={handleJoinWithCode}` |
| Bloque JSX `step === 'data'` usaba `name`, `rut`, `phone`, `formatRut`, `handleJoin` no definidos → riesgo de crash si step === 'data' | Bloque eliminado; flujo queda solo código → éxito |

### 2.3 Invitación operadores (empresa)

- Backend exige nombre y RUT al crear invitación; al usar código exige que la invitación tenga nombre y RUT.
- Frontend (Mi Equipo → Invitar) pide nombre y RUT del operador antes de generar código.

---

## 3. Flujos verificados

| Flujo | Estado | Notas |
|-------|--------|--------|
| **Proveedor: registro → onboarding P1–P6** | OK | Lectura de localStorage endurecida en todos los pasos; P4→P5 y P5→P6 sin crashes por JSON |
| **Cliente: maquinaria → ubicación → proveedores → confirmar** | OK | ConfirmServiceScreen ya usa `getObject`/`getArray`; UrgencySelectionScreen usa `getMachineryCapacityOptions` con fallback |
| **Operador: ingresar código → enrolarse** | OK | Un solo paso (código); botón corregido; sin pantalla "Tus datos" |
| **Empresa: invitar operador (nombre + RUT)** | OK | Validación backend + frontend; operador no puede enrolarse sin datos en invitación |

---

## 4. Riesgos conocidos (post-MVP o monitoreo)

- **Más pantallas con `JSON.parse(localStorage...)` sin try/catch:** Perfil, Historial, pantallas de servicio activo, etc. Si el usuario tiene datos corruptos, esas pantallas podrían fallar. Mitigación: ir migrando a `getObject`/`getArray` o envolver en try/catch cuando se toquen.
- **Backend caído o timeout:** Cliente/Proveedor verán errores de red; ya hay mensajes tipo "No se pudo conectar". Aceptable para MVP.
- **Pagos (Transbank):** Flujo de pago y OneClick dependen de configuración y ambiente; probar en staging con tarjetas de prueba antes de producción.
- **Admin:** Acceso restringido por rol; en dev se puede simular con `localStorage`. En producción, solo usuarios admin reales.

---

## 5. Checklist pre-deploy recomendado

- [ ] Variables de entorno de producción (API URL, MongoDB, Transbank, etc.).
- [ ] CORS y dominios permitidos para el front desplegado.
- [ ] Probar una vez el flujo completo: registro proveedor → P1–P6 → revisión → confirmar.
- [ ] Probar flujo cliente: maquinaria → confirmar → (pago en staging si aplica).
- [ ] Probar operador: generar código desde Mi Equipo (con nombre+RUT) → otro dispositivo/navegador ingresar código → éxito.
- [x] Revisar que no queden `console.log` sensibles o credenciales en el bundle. *(Revisado: no se imprimen credenciales; el único `console.warn` de API está en `NODE_ENV === 'development'`.)*

### Revisiones aplicadas (pre-deploy)

- **ServiceLocationScreen:** Guarda `serviceLat` y `serviceLng` en `localStorage` al continuar (líneas 136-137); si no hay Google Places, no hay coordenadas y se usa fallback Santiago (documentado).
- **machineryType para matching:** Al completar onboarding, el backend ahora sincroniza `machineryType` desde `machineData` al usuario (PATCH users); el frontend también envía `machineryType` en el payload de ReviewScreen. El matching por tipo de maquinaria funciona con proveedores recién registrados.

---

## 6. Resumen

El problema de **no poder pasar de P4 a P5** y los fallos relacionados con **avanzar en onboarding** y **operador** se debían a:

1. Referencias a variables no definidas (`PRICE_CAP_RULE_LABEL`, `validateCode`, etc.).
2. `JSON.parse` de localStorage sin protección en varios pasos.
3. Paso "Tus datos" del operador con estado y funciones eliminados pero JSX aún presente.

Con las correcciones aplicadas, los flujos críticos están endurecidos y **la app puede pasar a producción** asumiendo un MVP y el checklist anterior. Los riesgos restantes son acotados y se pueden ir cubriendo en iteraciones posteriores.
