# Source of Truth Decision

## 1) Modelo implementado actualmente

**B) Flujo de 7 pantallas**

Evidencia de código
- Existen rutas dedicadas con componentes React propios para estados que la Consolidada define como “estados internos”:
  - `/client/assigned` → `MachineryAssignedScreen` ([App.jsx:L382](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx#L382)).
  - `/client/provider-arrived` → `ProviderArrivedScreen` ([App.jsx:L391](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx#L391), import lazy [App.jsx:L135](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx#L135)).

## 2) Modelo definido por la documentación vigente

**A) Flujo de 5 pantallas**

Evidencia documental
- La Consolidada define “Seguimiento del Servicio (pantalla independiente con 3 estados internos)” y explicita “sin crear pantallas nuevas” ([MAQGO_UX_FINAL_CONSOLIDADA.md:L109-L125](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L109-L125)).
- El PRD de 3 pantallas define que “asignado → en camino” evoluciona “sin cambiar de ruta” ([PRD_UI_3…:L37-L40](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/.trae/documents/PRD_UI_3_Pantallas_Estados_Servicio_Cliente.md#L37-L40)).
- El diseño 3 pantallas fija “Operador asignado (ruta /client/assigned)” y define estado `en_route` como parte de la misma pantalla (estructura y copy) ([Diseno_UI_3…:L40-L60](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/.trae/documents/Diseno_UI_3_Pantallas_Estados_Servicio_Cliente.md#L40-L60)).

## 3) Resultado

**NO ALINEADAS**

Notas
- Este repo no contiene actualmente la ruta `/client/en-route` ni el componente `ClientEnRouteScreen` en el router principal.
- Regla de frescura: cualquier ruta mencionada como “implementada” debe existir en `frontend/src/App.jsx`.

## 4) Si NO ALINEADAS

**Código**
