# Levantamiento — Copy Welcome (fuente única)

**Pantalla completa (estructura + copy + responsive):** ver primero **`WELCOME_PANTALLA_FINAL.md`**.

Documento de **trazabilidad**: qué quedó **acordado y versionado** vs interpretaciones posteriores.

## 0) Vigente en código (hero)

| Elemento | Texto |
|----------|--------|
| **Pestaña / `document.title`** | `MAQGO - Maquinaria pesada donde la necesitas` |
| **Caluga** | *Arrienda maquinaria en minutos con disponibilidad en tiempo real.* |
| **H1** | *Maquinaria pesada* + **donde la necesitas** (naranja) + *con* + **operador incluido** (blanco) |
| **Párrafo (bajo H1)** | *—* (ninguno) |
| **CTA principal — subtítulo** | *Para hoy o en la fecha que indiques* |
| **Chips (barra)** | **No en UI** — histórico *Hoy o programado* / *Reserva simple* no se muestran |

*Caluga = borde naranja + fondo vidrio (`tokens.css`); sin línea gris extra bajo el H1.*

## 1) Fuente Git (histórico — `88a0e32`)

| Elemento | Texto |
|----------|--------|
| **Pestaña** | `MAQGO - Maquinaria pesada donde la necesitas` |
| **Caluga** | *Elige en pocos pasos con disponibilidad en tiempo real* |
| **H1** | *Maquinaria pesada* + **donde la necesitas** + *con* + **operador incluido** |
| **Subtítulo** | *Arrienda maquinaria en minutos, para hoy o para cuando la necesites.* |
| **Chips** | *Hoy o programado* · *Reserva simple* |

Commits relevantes en la cadena (más reciente primero):

- `88a0e32` — estilo desktop (chrome, caluga, chips)
- `dfc5829` — caluga disponibilidad en tiempo real + apoyo “arrienda/minutos”
- `2d854ca` — caluga y chips según copy acordado en hilo
- `86643a9` — restaurar subtítulo acordado
- `be0ed5c` — quitar subtítulo no acordado (“cotización transparente”)
- `f896813` — simplificar hero y timing CTA

## 2) Fuente conversación / hilo Cursor (contexto de negocio)

En el hilo de producto se explicitó (entre otras variantes):

- **Subtexto (unificado con CTA):** *Arrienda maquinaria en minutos, para hoy o en la fecha que indiques.* *(antes: «…cuando la necesites»; se cambió para no duplicar «necesitar» con el H1 «donde la necesitas».)*  
- **Chips:** *Hoy o programado* + *Reserva simple*  
- **Título / promesa:** patrón tipo marketplace — *Maquinaria pesada donde la necesitas* + *con operador incluido* (énfasis visual en “donde la necesitas” y “operador incluido”).
- **Caluga:** evolucionó a mensaje de **disponibilidad en tiempo real** (ver commits `dfc5829` / `88a0e32`).

*(Transcripción de sesión de trabajo en Cursor: carpeta `agent-transcripts`; búsquedas útiles: “acordado”, “Arrienda maquinaria”, “Hoy o programado”.)*

## 3) Qué NO era acordado (para no repetir)

- Sustituir el H1 por solo “con operador incluido” **sin** “donde la necesitas” → **no** está en `88a0e32` ni en el cierre explícito del hilo de copy.
- Subtítulos tipo “cotización transparente” → removidos en `be0ed5c` por no estar acordados.

## 4) “Los dos necesites” / doble «necesitar»

Regla aplicada: **un solo verbo *necesitar* en el bloque hero** — queda en el H1 (*donde la **necesitas***). El subtítulo ya no usa *necesites*; usa *en la fecha que **indiques*** para alinear con el subtítulo del botón principal (*Para hoy o en la fecha que indiques*).

## 5) Archivos tocados por copy Welcome

- `frontend/src/screens/WelcomeScreen.jsx` — hero completo  
- `frontend/index.html` — `<title>` y meta OG/Twitter (alineados al título de marca)  
- `frontend/public/manifest.json` — `name` de la PWA  

---

*Mantener este archivo al día cuando cambie copy acordado en PR.*
