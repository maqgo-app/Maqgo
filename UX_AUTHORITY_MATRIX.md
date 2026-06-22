# UX Authority Matrix — Fuente de verdad documental vigente

Alcance de este documento
- Solo determina **autoridad documental** entre los documentos listados.
- No evalúa código, bugs ni propone cambios.

Documentos revisados
- `MAQGO_UX_FINAL_CONSOLIDADA.md`
- `.trae/documents/PRD_UI_3_Pantallas_Estados_Servicio_Cliente.md`
- `.trae/documents/Diseno_UI_3_Pantallas_Estados_Servicio_Cliente.md`
- `MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md`

Nota sobre fechas
- Las fechas de “creación/modificación” se basan en timestamps del filesystem (`ctime`/`mtime`). No equivalen necesariamente a historia git.

---

## FASE 1 — Cronología (creación, modificación, relación y reemplazo)

| Documento | ctime | mtime | Relación declarada | ¿Reemplaza a otro? |
|---|---:|---:|---|---|
| `Diseno_UI_3_Pantallas_Estados_Servicio_Cliente.md` | 2026-06-19 10:44:24 | 2026-06-19 10:44:24 | Diseño UI/copy/jerarquía para 3 pantallas post‑pago (alcance acotado) ([Diseno_UI_3…:L3-L4](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/.trae/documents/Diseno_UI_3_Pantallas_Estados_Servicio_Cliente.md#L3-L4)). | No declara reemplazo. |
| `PRD_UI_3_Pantallas_Estados_Servicio_Cliente.md` | 2026-06-19 10:44:38 | 2026-06-19 10:44:38 | PRD para 3 pantallas post‑pago “sin cambios funcionales” y “manteniendo el flujo actual” ([PRD_UI_3…:L2-L3](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/.trae/documents/PRD_UI_3_Pantallas_Estados_Servicio_Cliente.md#L2-L3)). | No declara reemplazo. |
| `MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md` | 2026-06-19 13:17:47 | 2026-06-19 13:17:47 | Declara explícitamente su referencia: “Documento oficial de referencia: `MAQGO_UX_FINAL_CONSOLIDADA.md`” ([MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md:L3-L4](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md#L3-L4)). | No reemplaza: depende de Consolidada. |
| `MAQGO_UX_FINAL_CONSOLIDADA.md` | 2026-06-19 13:57:42 | 2026-06-19 13:57:42 | Declara “Jerarquía oficial… referencia oficial para implementación y QA” ([MAQGO_UX_FINAL_CONSOLIDADA.md:L138-L141](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L138-L141)). | Sí: cuando hay conflicto, se posiciona como referencia oficial para implementación/QA. |

Relación entre documentos (lectura consolidada)
- `PRD_UI_3…` + `Diseno_UI_3…` son documentos de alcance acotado (3 pantallas post‑pago).
- `MAQGO_UX_FINAL_CONSOLIDADA.md` es la consolidación posterior que fija jerarquía y flujo.
- `MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md` es una auditoría de brecha “desde UX aprobada” que explícitamente toma `MAQGO_UX_FINAL_CONSOLIDADA.md` como referencia.

---

## FASE 2 — Contradicciones relevantes (entre documentos)

Contradicciones identificadas (tema)
- Cantidad/definición de pantallas del flujo post‑pago.
- Avisos (Centro de Avisos, últimos avisos embebidos, readiness).
- Seguimiento (en camino / llegó: estado interno vs pantalla).
- Valoración (pantalla independiente vs paso interno).
- Footer (qué se puede o no cambiar y dónde aplica).

---

## FASE 3 — Para cada contradicción: ¿Quién gana? (con evidencia)

### 1) Cantidad/definición de pantallas
- Gana: **Consolidada**.
- Evidencia:
  - Define explícitamente el “Flujo cliente definitivo” y declara “Flujo consolidado (sin crear pantallas nuevas)” con pantallas + estados internos ([MAQGO_UX_FINAL_CONSOLIDADA.md:L107-L125](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L107-L125)).
  - Declara “Jerarquía oficial… referencia oficial para implementación y QA” ([MAQGO_UX_FINAL_CONSOLIDADA.md:L138-L141](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L138-L141)).
  - `MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md` subordina su análisis a Consolidada ([MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md:L3-L4](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md#L3-L4)).

### 2) Avisos (Centro de Avisos vs “últimos avisos” embebidos)
- Gana (definición conceptual y jerarquía): **Consolidada**.
  - Comunicación al cliente mediante “Centro de Avisos + push + …” ([MAQGO_UX_FINAL_CONSOLIDADA.md:L91-L94](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L91-L94)).
  - Jerarquía oficial incluye “Últimos avisos” como bloque terciario en múltiples pantallas ([MAQGO_UX_FINAL_CONSOLIDADA.md:L143-L177](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L143-L177)).
- Gana (realidad de readiness/producción): **Implementation Gap Analysis** (porque se define como auditoría de brecha “realidad actual”).
  - Declara “Centro de Avisos completo existe hoy solo como prototipo DEV/mock” ([MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md:L73-L75](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md#L73-L75)).
  - Clasifica “Centro de Avisos completo (Hub)” como “No existe (prod)” ([MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md:L40-L43](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md#L40-L43)).

### 3) Seguimiento (Asignado / En camino / Llegó)
- Gana: **Consolidada**.
- Evidencia:
  - Define “Seguimiento del Servicio (pantalla independiente con 3 estados internos)” y explicita que asignado/en camino/llegó son estados internos ([MAQGO_UX_FINAL_CONSOLIDADA.md:L111-L125](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L111-L125)).
  - `PRD_UI_3…` es consistente con no cambiar de ruta cuando evoluciona asignado → en camino ([PRD_UI_3…:L37-L40](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/.trae/documents/PRD_UI_3_Pantallas_Estados_Servicio_Cliente.md#L37-L40)).

### 4) Valoración
- Gana: **Consolidada**, pero existe contradicción interna en el set documental.
- Evidencia:
  - Consolidada define “Valoración (pantalla independiente)” en flujo definitivo ([MAQGO_UX_FINAL_CONSOLIDADA.md:L118-L130](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L118-L130)).
  - Diseño 3 pantallas define valoración como “Paso 2: Evaluación” dentro de “Servicio finalizado” (pasos internos) ([Diseno_UI_3_Pantallas…:L75-L90](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/.trae/documents/Diseno_UI_3_Pantallas_Estados_Servicio_Cliente.md#L75-L90)).
  - No existe una frase en PRD/Diseño que declare explícitamente que “reemplaza” el flujo consolidado; por lo tanto, la autoridad vuelve a Consolidada por su declaración de “referencia oficial” ([MAQGO_UX_FINAL_CONSOLIDADA.md:L138-L141](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L138-L141)).

### 5) Footer
- Gana: **Consolidada** (principio general).
- Evidencia:
  - “El footer actual no se rediseña: misma navegación, posiciones e iconografía.” ([MAQGO_UX_FINAL_CONSOLIDADA.md:L90-L92](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L90-L92)).
- Complemento (reglas específicas por pantalla dentro del alcance de 3 pantallas): **PRD 3 pantallas / Diseño 3 pantallas**.
  - “Reserva confirmada: Top bar … (sin bottom nav)” ([Diseno_UI_3_Pantallas…:L23-L33](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/.trae/documents/Diseno_UI_3_Pantallas_Estados_Servicio_Cliente.md#L23-L33)).
  - Estas reglas son de alcance acotado y no contradicen el principio general de “no rediseñar” el footer.

---

## FASE 4 — Tabla final (autoridad por tema)

| Tema | Documento que manda | Evidencia |
|---|---|---|
| Autoridad global (jerarquía y QA) | `MAQGO_UX_FINAL_CONSOLIDADA.md` | “Jerarquía oficial… referencia oficial para implementación y QA” ([MAQGO_UX_FINAL_CONSOLIDADA.md:L138-L141](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L138-L141)). |
| Flujo (pantallas + estados internos) | `MAQGO_UX_FINAL_CONSOLIDADA.md` | “Flujo consolidado (sin crear pantallas nuevas)” + “Seguimiento… con 3 estados internos” ([MAQGO_UX_FINAL_CONSOLIDADA.md:L107-L125](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L107-L125)). |
| Pantallas post‑pago (detalles UI/copy para 3 pantallas) | `PRD_UI_3…` + `Diseno_UI_3…` (cuando no contradicen Consolidada) | Alcance explícito “solo UI/copy/jerarquía visual… sin features nuevas” ([Diseno_UI_3…:L3-L4](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/.trae/documents/Diseno_UI_3_Pantallas_Estados_Servicio_Cliente.md#L3-L4)) y “sin cambios funcionales… manteniendo el flujo actual” ([PRD_UI_3…:L2-L3](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/.trae/documents/PRD_UI_3_Pantallas_Estados_Servicio_Cliente.md#L2-L3)). |
| Ready/No-ready y brechas contra capacidades reales | `MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md` | Se define como “Gap Analysis (desde UX aprobada)” y explicita “realidad actual” ([MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md:L1-L4](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md#L1-L4), [MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md:L68-L75](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md#L68-L75)). |
| Avisos — definición conceptual (canal oficial) | `MAQGO_UX_FINAL_CONSOLIDADA.md` | “La comunicación… Centro de Avisos + push + …” ([MAQGO_UX_FINAL_CONSOLIDADA.md:L91-L94](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L91-L94)). |
| Avisos — estado productivo (si existe en prod) | `MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md` | “Centro de Avisos completo… solo prototipo DEV/mock; No existe (prod)” ([MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md:L40-L43](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md#L40-L43), [MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md:L73-L75](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_IMPLEMENTATION_GAP_ANALYSIS.md#L73-L75)). |
| Seguimiento (Asignado/En camino/Llegó como estados internos) | `MAQGO_UX_FINAL_CONSOLIDADA.md` | “Operador asignado/en camino/llegó: Estados internos…” ([MAQGO_UX_FINAL_CONSOLIDADA.md:L120-L125](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L120-L125)). |
| Valoración (definición vigente cuando hay choque con “pasos internos”) | `MAQGO_UX_FINAL_CONSOLIDADA.md` | “Valoración (pantalla independiente)” ([MAQGO_UX_FINAL_CONSOLIDADA.md:L118-L130](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L118-L130)) + autoridad global ([MAQGO_UX_FINAL_CONSOLIDADA.md:L138-L141](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L138-L141)). |
| Footer (principio general) | `MAQGO_UX_FINAL_CONSOLIDADA.md` | “El footer actual no se rediseña…” ([MAQGO_UX_FINAL_CONSOLIDADA.md:L90-L92](file:///Users/tomasvillalta/Desktop/Repositorios%20Github/Maqgo%20Principal/Maqgo/MAQGO_UX_FINAL_CONSOLIDADA.md#L90-L92)). |

