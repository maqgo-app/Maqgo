# Source of Truth Decision

## 1) Modelo implementado actualmente

**B) Flujo de 7 pantallas**

Evidencia de código
- Existen rutas dedicadas con componentes React propios para estados que la Consolidada define como “estados internos”:
  - `/client/en-route` → `ClientEnRouteScreen` ([App.jsx:L387](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx#L387), import lazy [App.jsx:L125](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx#L125)).
  - `/client/provider-arrived` → `ProviderArrivedScreen` ([App.jsx:L396](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx#L396), import lazy [App.jsx:L133](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx#L133)).

## 2) Modelo definido por la documentación vigente

**A) Flujo de 5 pantallas**

Evidencia documental
- La Consolidada define “Seguimiento del Servicio (pantalla independiente con 3 estados internos)” y explicita “sin crear pantallas nuevas” ([MAQGO_UX_FINAL_CONSOLIDADA.md:L109-L125](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L109-L125)).
- El PRD de 3 pantallas define que “asignado → en camino” evoluciona “sin cambiar de ruta” ([PRD_UI_3…:L37-L40](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/.trae/documents/PRD_UI_3_Pantallas_Estados_Servicio_Cliente.md#L37-L40)).
- El diseño 3 pantallas fija “Operador asignado (ruta /client/assigned)” y define estado `en_route` como parte de la misma pantalla (estructura y copy) ([Diseno_UI_3…:L40-L60](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/.trae/documents/Diseno_UI_3_Pantallas_Estados_Servicio_Cliente.md#L40-L60)).

## 3) Resultado

**NO ALINEADAS**

## 4) Si NO ALINEADAS

**Código**

