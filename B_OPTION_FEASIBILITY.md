# B_OPTION_FEASIBILITY

Alternativa B
- Reserva Confirmada
- Seguimiento (Asignado + En Camino)
- Operador Llegó
- Servicio En Curso
- Servicio Finalizado
- Valoración

## 1. Qué pantallas actuales permanecen sin cambios
- `PaymentResultScreen` (`/client/payment-result`) — `frontend/src/screens/client/PaymentResultScreen.jsx`
- `MachineryAssignedScreen` (`/client/assigned`) — `frontend/src/screens/client/MachineryAssignedScreen.js` (ya contempla `assigned` y `en_route` en la misma ruta)
- `ProviderArrivedScreen` (`/client/provider-arrived`) — `frontend/src/screens/client/ProviderArrivedScreen.js`
- `ServiceActiveScreen` (`/client/service-active`) — `frontend/src/screens/client/ServiceActiveScreen.js`
- `ServiceFinishedScreen` (`/client/service-finished`) — `frontend/src/screens/client/ServiceFinishedScreen.jsx`
- `RateService` (`/client/rate`) — `frontend/src/screens/client/RateService.js`

## 2. Qué pantallas actuales se fusionarían
- `ClientEnRouteScreen` se absorbe dentro de la vista `en_route` de `MachineryAssignedScreen`.
  - Evidencia de que la app ya tiene `en_route` en `/client/assigned`: existen screenshots “en-camino” bajo el set de `/client/assigned` (`service-flow-premium-full/en-camino_*.png`).

## 3. Qué rutas desaparecerían
- `/client/en-route`
  - Evidencia de que hoy existe solo como ruta dedicada: [App.jsx:L387](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx#L387)
  - Evidencia de que no hay navegación interna dependiente (solo declarada en router): única referencia en código: [App.jsx:L387](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx#L387)

## 4. Qué rutas permanecerían
- `/client/payment-result`
- `/client/assigned`
- `/client/provider-arrived`
- `/client/service-active`
- `/client/service-finished`
- `/client/rate`

## 5. Riesgo técnico
- **Bajo**
  - La ruta a retirar (`/client/en-route`) no tiene dependencias internas (no hay `navigate('/client/en-route')` ni links; solo está declarada en `App.jsx`).
  - El estado “en camino” ya existe y se renderiza dentro de `/client/assigned` (capturas QA existentes `en-camino_*`).

## 6. Si esta alternativa puede implementarse sin rediseñar UX
- **SI**
  - Reusa pantallas y componentes ya existentes; el cambio principal es de routing (retirar una ruta dedicada que duplica UI) sin alterar la estructura visual de las pantallas que se mantienen.

