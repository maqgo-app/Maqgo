# UX Source of Truth Audit — Definición vigente vs implementación/QA

Objetivo: resolver contradicciones entre
- `MAQGO_UX_FINAL_CONSOLIDADA.md`
- `.trae/documents/PRD_UI_3_Pantallas_Estados_Servicio_Cliente.md`
- `.trae/documents/Diseno_UI_3_Pantallas_Estados_Servicio_Cliente.md`
- Implementación actual (rutas/pantallas)
- QA screenshots actuales

---

## FASE 1 — Fuente de verdad vigente: flujo de 5 pantallas vs 7 pantallas

Conclusión: **Fuente de verdad vigente = A) Flujo de 5 pantallas**.

Evidencia documental
- `MAQGO_UX_FINAL_CONSOLIDADA.md` fija explícitamente: “Seguimiento del Servicio (pantalla independiente con 3 estados internos)” y “sin crear pantallas nuevas” ([MAQGO_UX_FINAL_CONSOLIDADA.md:L107-L125](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L107-L125)).
  - Estados internos definidos: “Operador asignado / Operador en camino / Operador llegó” ([MAQGO_UX_FINAL_CONSOLIDADA.md:L112-L116](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L112-L116)).
- `PRD_UI_3_Pantallas_Estados_Servicio_Cliente.md` define “Operador asignado” como una sola ruta donde el estado evoluciona “asignado → en camino” **sin cambiar de ruta** ([PRD_UI_3…:L37-L40](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/.trae/documents/PRD_UI_3_Pantallas_Estados_Servicio_Cliente.md#L37-L40)).

Evidencia de contradicción (implementación/QA)
- Implementación actual expone pantallas/rutas separadas para estados que deberían ser internos:
  - `/client/en-route` ([App.jsx:L386-L388](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx#L386-L388)).
  - `/client/provider-arrived` ([App.jsx:L395-L396](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx#L395-L396)).
- QA screenshots actuales incluyen capturas separadas para “en-camino” y “operador-llego” dentro del set generado:
  - `archive/qa-screenshots/qa-screenshots-history/service-flow-premium-full/en-camino_mobile.png`
  - `archive/qa-screenshots/qa-screenshots-history/service-flow-premium-full/operador-llego_mobile.png`

---

## FASE 2 — Decisiones posteriores que invalidaron documentos antiguos

Nota: “documento antiguo” en esta sección se refiere a la definición que **queda superada** cuando otra fuente declara explícitamente una decisión distinta.

### Avisos embebidos / “Últimos avisos”
- `MAQGO_UX_FINAL_CONSOLIDADA.md` define “Últimos avisos” como bloque terciario en múltiples pantallas (p.ej. Confirmado/Asignado/En camino/Llegó/En curso/Finalizado) ([MAQGO_UX_FINAL_CONSOLIDADA.md:L143-L177](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L143-L177)).
- La implementación actual no muestra “Últimos avisos” en esas pantallas por decisión aplicada a nivel de layout (evidencia: el layout ya no los renderiza) ([ServiceStateLayout.jsx:L24-L53](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/components/serviceState/ServiceStateLayout.jsx#L24-L53)).
- `MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md` declara que el “Centro de Avisos” completo es DEV/mock y que en prod existía una tarjeta “Avisos” dentro de pantallas de estado (contextualiza que esto estaba en transición) ([MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md:L73-L75](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md#L73-L75)).

### Centro de Avisos (HUB) / readiness
- `MAQGO_UX_FINAL_CONSOLIDADA.md` incluye una sección de “Centro de Avisos definitivo” y lo considera accesible desde el flujo (sin inventar navegación nueva) ([MAQGO_UX_FINAL_CONSOLIDADA.md:L291-L316](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L291-L316)).
- Implementación actual mantiene el HUB **solo en DEV** (`import.meta.env.DEV`) ([App.jsx:L397-L398](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx#L397-L398)).
- Auditoría de readiness concluye NO-GO (prototipo mock/DEV): [AVISOS_PRODUCTION_READINESS.md](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/AVISOS_PRODUCTION_READINESS.md).

### En Camino / Llegó (pantalla vs estado interno)
- `MAQGO_UX_FINAL_CONSOLIDADA.md` y `PRD_UI_3…` fijan “en camino/llegó” como **estados internos** dentro de seguimiento (sin pantallas nuevas) ([MAQGO_UX_FINAL_CONSOLIDADA.md:L109-L125](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L109-L125), [PRD_UI_3…:L37-L40](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/.trae/documents/PRD_UI_3_Pantallas_Estados_Servicio_Cliente.md#L37-L40)).
- Implementación/QA actuales los tratan como pantallas separadas (rutas + capturas) ([App.jsx:L386-L388](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx#L386-L388), [App.jsx:L395-L396](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx#L395-L396)).

### Valoración (pantalla única vs duplicación)
- `MAQGO_UX_FINAL_CONSOLIDADA.md` define “Valoración” como pantalla independiente ([MAQGO_UX_FINAL_CONSOLIDADA.md:L118-L130](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L118-L130)).
- `Diseno_UI_3_Pantallas…` fija valoración como **paso interno** en “Servicio finalizado” (paso 2), seguido de confirmación (paso 3) ([Diseno_UI_3_Pantallas…:L75-L90](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/.trae/documents/Diseno_UI_3_Pantallas_Estados_Servicio_Cliente.md#L75-L90)).
- Implementación actual contiene ambos: step interno en `ServiceFinishedScreen` y pantalla separada `RateService` (`/client/rate`) ([ServiceFinishedScreen.jsx:L382-L499](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/ServiceFinishedScreen.jsx#L382-L499), [RateService.js:L14-L48](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/screens/client/RateService.js#L14-L48)).

---

## FASE 3 — Tabla de fuente de verdad

| Tema | Documento antiguo | Decisión posterior | Fuente de verdad vigente |
|---|---|---|---|
| Flujo 5 vs 7 pantallas | Cualquier lectura que trate “En camino” y “Llegó” como pantallas separadas | Seguimiento del Servicio con 3 estados internos y “sin crear pantallas nuevas” ([MAQGO_UX_FINAL_CONSOLIDADA.md:L107-L125](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L107-L125)) + evolución de estado sin cambio de ruta ([PRD_UI_3…:L37-L40](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/.trae/documents/PRD_UI_3_Pantallas_Estados_Servicio_Cliente.md#L37-L40)) | **Flujo 5 pantallas** (Seguimiento con estados internos). |
| Avisos embebidos (“Últimos avisos” dentro de pantallas) | Jerarquía oficial que exige “Últimos avisos” como bloque terciario ([MAQGO_UX_FINAL_CONSOLIDADA.md:L143-L177](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L143-L177)) | Implementación actual no lo renderiza (layout sin bloque) ([ServiceStateLayout.jsx:L24-L53](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/components/serviceState/ServiceStateLayout.jsx#L24-L53)) | **Implementación actual** (sin “últimos avisos” embebidos) hasta que exista decisión/documento posterior explícito que lo reinstale. |
| Centro de Avisos (HUB) en producción | Centro de Avisos “definitivo” accesible desde flujo ([MAQGO_UX_FINAL_CONSOLIDADA.md:L291-L316](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L291-L316)) | Ruta del HUB solo DEV (`import.meta.env.DEV`) ([App.jsx:L397-L398](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/frontend/src/App.jsx#L397-L398)) + readiness NO-GO (prototipo) ([AVISOS_PRODUCTION_READINESS.md](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/AVISOS_PRODUCTION_READINESS.md)) | **Prototipo DEV** (no productivo). |
| “En camino” como estado backend | Cualquier definición que requiera un status backend `en_route` | Decisión explícita: “Operador en camino no existe como estado backend y no se creará; se deriva” ([MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md:L73-L80](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md#L73-L80)) | **Derivación sin status nuevo** (fuente: `MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md`). |
| Valoración (única vs duplicada) | Valoración como pantalla independiente (flujo consolidado) ([MAQGO_UX_FINAL_CONSOLIDADA.md:L118-L130](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L118-L130)) | Diseño post‑pago define “Servicio finalizado” con 3 pasos internos: reporte → evaluación → confirmación ([Diseno_UI_3_Pantallas…:L75-L90](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/.trae/documents/Diseno_UI_3_Pantallas_Estados_Servicio_Cliente.md#L75-L90)) | **Inconsistente** (no hay una única fuente aplicada; la implementación contiene ambas). |
