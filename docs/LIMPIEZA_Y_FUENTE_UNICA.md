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

## Documentos relacionados

- [QA_Y_LANZAMIENTO.md](QA_Y_LANZAMIENTO.md)
- [PRODUCCION.md](PRODUCCION.md)
