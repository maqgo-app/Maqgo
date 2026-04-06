# Limpieza del proyecto y fuente única

## Regla

- **Un solo árbol** conectado a producción: el repo **GitHub** `maqgo-app/Maqgo`, clon local típico: carpeta **`Maqgo1-main`**.
- No duplicar el repositorio en otras carpetas del disco para “probar”; usar **ramas** y **PRs**.

## Artefactos que no deben versionarse

| Tipo | Acción |
|------|--------|
| `frontend/lint*.txt` | Ignorados en `.gitignore`; eran volcados de ESLint obsoletos. |
| `backend/.quality-gate-backend.log` | Log local; no commitear. |
| `frontend/dist/`, `node_modules/` | Ya ignorados por estándar. |

## Integraciones GitHub “en rojo”

Un deployment con nombre raro (ej. **gleaming-trust**) en GitHub **no** se corrige con commits: suele ser un **servicio Railway** antiguo. Revisar **Railway** → proyecto → desactivar deploy desde repo o borrar servicio si no se usa.

## Por qué GitHub “se ve lleno de basura” (aunque el repo esté bien)

No es siempre código basura; suele ser **historial de la interfaz**:

| Qué ves | Qué es | Cómo ordenar |
|---------|--------|----------------|
| **Deployments (193+)** | Cada push/redeploy deja registro. | Normal en proyectos activos. Limpiar **servicios viejos** en Vercel/Railway para no generar ruido. |
| **Checks rojos** | Servicio desconectado o build fallido. | Railway/Vercel → arreglar o **desvincular** el proyecto muerto. |
| **Muchas ramas** | Ramas `hotfix/*` ya mergeadas. | GitHub → **Branches** → borrar ramas mergeadas (seguro si ya están en `main`). |
| **Actions** | Cada PR/push corre CI. | Normal; opcional: ajustar retención en **Settings → Actions**. |

El árbol de código en Git suele ser acotado (~300–400 archivos en MAQGO); lo que “estresa” es **integraciones + tiempo**, no miles de archivos basura en el repo.

## Documentos relacionados

- [QA_Y_LANZAMIENTO.md](QA_Y_LANZAMIENTO.md)
- [PRODUCCION.md](PRODUCCION.md)
