# MAQGO RC — Definición oficial de Geolocalización (cierre definitivo)

Este documento define una **única** regla oficial para el RC sobre ubicación y geolocalización. Su objetivo es eliminar contradicciones entre policy, backend, frontend, matching, tracking/timers, telemetría y documentación.

## 1) Regla oficial (única) — Ubicación de la maquinaria

1. La **ubicación base** de una maquinaria en MAQGO es la **base declarada** por el proveedor (depósito/origen logístico).
2. La **ubicación en vivo** de una maquinaria, cuando existe, proviene de una **fuente de telemetría** configurada por el proveedor (p. ej. Komatsu/CAT/otra).
3. El **GPS del operador** **no** es la ubicación base de la maquinaria.

Fuentes de evidencia vigentes en RC:

- Onboarding de maquinaria (explicita base vs telemetría y descarta GPS operador como base): [MachineDataScreen.js](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/provider/MachineDataScreen.js)
- Términos: [TermsScreen.js](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/TermsScreen.js)
- FAQ: [FAQScreen.js](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/FAQScreen.js)

## 2) Rol del GPS del operador en el RC

El GPS del operador existe solo como **insumo operativo**, no como fuente de verdad de ubicación de maquinaria.

- **Obligatorio**: No.
- **Opcional**: Sí.
- **Fallback técnico**: Sí, en ausencia de telemetría.
- **Ayuda operacional**: Sí (mejora matching/ETA y automatizaciones cuando aplica).

### 2.0 Principio de exposición al cliente

El GPS del operador es una **señal logística interna**. En el RC:

- **Nunca** se debe mostrar al cliente como ubicación visible en mapa ni como “ubicación de la máquina”.
- Si el producto muestra ubicación visible al cliente, esa ubicación debe corresponder a:
  - la **ubicación base** (depósito/origen declarado), o
  - la **ubicación viva de la maquinaria** por telemetría (si existe).

### 2.1 En qué casos participa

- Como **ubicación del proveedor/operador** (campo `users.location`) para:
  - mejorar cálculo de ETA cuando no hay telemetría;
  - mejorar matching/dispatch cuando no hay ubicación viva de la máquina;
  - habilitar automatizaciones de tracking solo cuando hay frescura/edad aceptable.

Evidencia de fallback y jerarquía en RC:

- Auto-arrival prioriza `machine.location` y cae a `provider.location` cuando falta telemetría: [timer_service.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/services/timer_service.py)
- Matching prioriza `machineData.location`, luego `provider.location`, y finalmente depósito: [matching_service.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/services/matching_service.py)

### 2.2 En qué casos NO participa

- No define por sí solo la ubicación base de la maquinaria.
- No debe ser presentado como “desde dónde sale la máquina” como concepto contractual.

## 3) Fuente de verdad vigente para “ubicación” por uso

Para evitar ambigüedad, MAQGO distingue tres usos de “ubicación”:

1. **Ubicación base de maquinaria** (logística): base declarada.
2. **Ubicación viva de maquinaria** (tracking de equipo): telemetría (si existe).
3. **Ubicación del proveedor/operador** (dispatch/ETA): GPS del operador/proveedor como insumo no contractual.

Estas tres existen hoy en el RC a nivel de producto (copy/UX) y a nivel de código (matching/timers/telemetría).

## 4) Regla oficial de “llegada verificada”

En el RC, “llegada verificada” significa:

- existe una llegada registrada (`arrivalDetectedAt`), y
- cuando hay coordenadas, la verificación se basa en distancia a la ubicación de obra dentro del radio establecido.

Además, el RC soporta un camino operativo donde la llegada puede ser registrada sin coordenadas (fuente `manual`). En ese caso, la verificación no representa GPS; representa una marca operativa registrada como `source=manual`.

En el RC actual, cuando la llegada se registra como `source=manual`, el sistema la registra con `arrivalLocation.verified=true`.

Fuentes:

- Policy radius: [POLICY_ENGINE_V1.md](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/docs/POLICY_ENGINE_V1.md)
- Implementación llegada con/ sin coordenadas: [service_requests.py](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/backend/routes/service_requests.py)

## 5) Compatibilidad con Push Notifications

- Push Notifications no dependen del permiso de ubicación.
- Activar Push no activa GPS.

Fuente:

- [pushNotifications.js](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/utils/pushNotifications.js)

## 6) Clasificación de inconsistencias y solución mínima

Este RC adopta la regla oficial (sección 1) como definición única. Cualquier texto o comentario que indique “GPS operador = ubicación maquinaria” o “arrival verified solo por GPS” debe ser tratado como contradictorio.

La solución mínima permitida en RC para cerrar el tema es:

- actualizar documentación/copy/comentarios que contradicen esta definición;
- declarar explícitamente los fallbacks técnicos (qué son y qué no son).
