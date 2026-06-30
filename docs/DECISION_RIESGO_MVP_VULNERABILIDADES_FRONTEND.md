# Decisión de Riesgo MVP — Vulnerabilidades Frontend

Fecha: 2026-06-30

## Contexto

GitHub/Dependabot y `npm audit` reportan vulnerabilidades en el frontend.
MAQGO está prácticamente listo para producción, por lo que el objetivo es:

- No introducir cambios innecesarios que puedan afectar navegación, contenido o pantallas.
- Documentar qué riesgos se aceptan conscientemente para el MVP.
- Identificar qué vulnerabilidades representan riesgo real en producción vs ruido del tooling / lockfile.

## Alcance

- Solo se analiza el frontend (`frontend/`).
- No se modifica `package-lock.json` ni se actualizan dependencias como parte de esta decisión.
- El análisis se basa en el reporte de `npm audit --omit=dev` (vulnerabilidades que, según npm, afectan “producción”).

## Evidencia utilizada

### 1) El bundle se construye desde `node_modules`, no desde `package-lock.json`

El código que se empaqueta en `dist/` proviene del árbol realmente instalado en `frontend/node_modules` al momento de ejecutar `npm run build`.
El `package-lock.json` es una fuente de resolución, pero no es lo que se empaqueta por sí mismo.

### 2) Verificación de versiones realmente instaladas

Se verificaron versiones de dependencias críticas en el filesystem (`frontend/node_modules/.../package.json`):

- `axios`: 1.18.1
- `dompurify`: 3.4.11
- `react-router`: 6.30.4
- `form-data`: 4.0.6
- `fast-uri`: 3.1.3
- `esbuild`: 0.28.1

### 3) Verificación de paquetes reportados que no están instalados

Se verificó que varios paquetes reportados por `npm audit` no forman parte del árbol de dependencias instalado (`frontend/node_modules`) utilizado para generar el bundle de producción y, durante la inspección del artefacto generado, no se encontraron evidencias de que esas versiones fueran empaquetadas:

- `minimist`: NOT_INSTALLED
- `request`: NOT_INSTALLED
- `url-regex`: NOT_INSTALLED
- `tough-cookie`: NOT_INSTALLED
- `uuid`: NOT_INSTALLED
- `qs`: NOT_INSTALLED
- `jpeg-js`: NOT_INSTALLED

### 4) Detección de entradas `extraneous` en `package-lock.json`

Se confirmó que el lockfile contiene entradas duplicadas, incluyendo versiones antiguas marcadas `extraneous`, por ejemplo:

- `axios@1.15.0` (extraneous) coexiste con `axios@1.18.1`.
- `dompurify@3.4.0` (extraneous) coexiste con `dompurify@3.4.11`.
- `react-router@6.30.3` (extraneous) coexiste con `react-router@6.30.4`.
- `minimist@0.0.8` aparece marcado como `extraneous`.

Estas entradas `extraneous` explican por qué `npm audit` sigue listando rangos vulnerables aunque la versión instalada esté parchada.

### 5) Inspección del bundle generado (evidencia adicional)

Se ejecutó `npm run build` y se inspeccionó `dist/assets` para buscar strings de versiones asociadas a entradas antiguas (p. ej. `1.15.0`, `3.4.0`, `6.30.3`). No se encontraron coincidencias.
Esta evidencia es complementaria (las versiones no siempre quedan como string en el bundle), pero no contradice lo observado en `node_modules`.

## Tabla final — 19 vulnerabilidades reportadas por `npm audit --omit=dev`

Clasificaciones:

- **Real**: corresponde a un paquete instalado y potencialmente empaquetado.
- **Extraneous**: el lockfile contiene una copia antigua/duplicada marcada `extraneous` o el paquete no está instalado; el reporte no refleja riesgo real en producción.

| Vulnerabilidad | Runtime / Tooling | Real / Extraneous | Riesgo para MAQGO | Prioridad | Recomendación |
|---|---|---|---|---|---|
| `@babel/core` | Tooling | Extraneous | Nulo en producción (build) | Ruido | Aceptar para MVP; limpiar lock post-lanzamiento |
| `@babel/plugin-transform-modules-systemjs` | Tooling | Extraneous | Nulo en producción (build) | Ruido | Aceptar para MVP; limpiar lock post-lanzamiento |
| `axios` | Runtime | Extraneous | Bajo/Nulo: versión instalada `1.18.1` | P2 | Aceptar para MVP; limpiar lock post-lanzamiento |
| `dompurify` | Runtime | Extraneous | Bajo/Nulo: versión instalada `3.4.11` | P2 | Aceptar para MVP; limpiar lock post-lanzamiento |
| `esbuild` | Tooling | Extraneous | Nulo en producción (build) | Ruido | Aceptar para MVP; limpiar lock post-lanzamiento |
| `fast-uri` | Tooling | Extraneous | Nulo en producción (build) | Ruido | Aceptar para MVP; limpiar lock post-lanzamiento |
| `form-data` | Tooling | Extraneous | Nulo en producción (app browser; versión instalada `4.0.6`) | Ruido | Aceptar para MVP; limpiar lock post-lanzamiento |
| `jpeg-js` | Tooling | Extraneous | Nulo: paquete no instalado | Ruido | Aceptar para MVP; limpiar lock post-lanzamiento |
| `js-yaml` | Tooling | Extraneous | Nulo en producción (build) | Ruido | Aceptar para MVP; limpiar lock post-lanzamiento |
| `minimist` | Tooling | Extraneous | Nulo: paquete no instalado | Ruido | Aceptar para MVP; limpiar lock post-lanzamiento |
| `postcss` | Tooling | Extraneous | Nulo en producción (build) | Ruido | Aceptar para MVP; limpiar lock post-lanzamiento |
| `qs` | Tooling | Extraneous | Nulo: paquete no instalado | Ruido | Aceptar para MVP; limpiar lock post-lanzamiento |
| `react-router` | Runtime | Extraneous | Bajo/Nulo: versión instalada `6.30.4` | P2 | Aceptar para MVP; limpiar lock post-lanzamiento |
| `request` | Tooling | Extraneous | Nulo: paquete no instalado | Ruido | Aceptar para MVP; limpiar lock post-lanzamiento |
| `serialize-javascript` | Tooling | Extraneous | Nulo en producción (build) | Ruido | Aceptar para MVP; limpiar lock post-lanzamiento |
| `tough-cookie` | Tooling | Extraneous | Nulo: paquete no instalado | Ruido | Aceptar para MVP; limpiar lock post-lanzamiento |
| `url-regex` | Tooling | Extraneous | Nulo: paquete no instalado | Ruido | Aceptar para MVP; limpiar lock post-lanzamiento |
| `uuid` | Tooling | Extraneous | Nulo: paquete no instalado | Ruido | Aceptar para MVP; limpiar lock post-lanzamiento |
| `vite` | Tooling | Extraneous | Nulo en producción (build) | Ruido | Aceptar para MVP; limpiar lock post-lanzamiento |

## Decisiones adoptadas

- Se acepta conscientemente el riesgo residual del frontend para el MVP porque:
  - los paquetes de runtime relevantes están instalados en versiones parchadas;
  - varias vulnerabilidades corresponden a paquetes no instalados;
  - el lockfile contiene entradas `extraneous` que inflan el contador sin representar riesgo real en producción.

## Riesgos aceptados para el MVP

- “Ruido” del contador de `npm audit`/Dependabot (compliance/alert fatigue), sin evidencia de explotación real en producción para el frontend.

## Riesgos que deberán corregirse post-lanzamiento

- Ejecutar una limpieza controlada de `package-lock.json` (regeneración con ventana de riesgo y validación completa) para:
  - remover entradas duplicadas `extraneous`;
  - alinear `npm audit` con el árbol real instalado;
  - reducir el ruido en alertas.
