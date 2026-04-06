# MongoDB — convención MAQGO (fuente única)

## Variables de entorno

| Variable     | Obligatorio en prod | Descripción |
|-------------|---------------------|-------------|
| `MONGO_URL` | Sí                  | URI de conexión (Atlas SRV, Railway, local). |
| `DB_NAME`   | **Sí (recomendado)** | Nombre lógico de la base **debe ser el mismo** en todos los módulos (usuarios, servicios, sesiones, marketing, config). |

## Implementación (backend)

- **Único módulo que lee `MONGO_URL` y `DB_NAME` del entorno:** `backend/db_config.py`
  - `get_mongo_url()`
  - `get_db_name()`
- **Default local** si falta `DB_NAME`: `maqgo_db` (alineado con `backend/.env.example`).
- **No** volver a usar `os.environ.get("MONGO_URL", ...)` ni `os.environ.get("DB_NAME", ...)` en rutas, servicios ni scripts; eso reintroduce bugs tipo `maqgo` vs `maqgo_db`.

## Verificación local / CI

Desde `backend/`:

```bash
python scripts/verify_db_config_convention.py
```

Debe imprimir `OK` y salir con código `0`.

## Producción (Railway / Atlas)

1. En **Railway**, el proyecto del backend se llama **`maqgo`**: ahí van `MONGO_URL`, `DB_NAME`, `CORS_ORIGINS`, etc. (ver `docs/RAILWAY_PRODUCTION.md`).
2. Definir **`DB_NAME` explícitamente** igual al nombre de la base donde están los datos reales (si ya existe una DB llamada `maqgo`, usar ese valor; no mezclar con otro default).
3. La URI puede incluir un path (`/nombre`); el código selecciona la base con `client[get_db_name()]`, que debe coincidir con lo que esperás en Atlas.

## Carpetas en `Maqgo Principal` (tu disco) vs GitHub / hosting

- **GitHub:** **`maqgo-app/Maqgo`** · **Railway:** proyecto p. ej. **`maqgo-prod-backend`** (servicio **Maqgo**) · **Vercel:** proyecto **`maqgo`** (front, `https://maqgo.vercel.app`).
- **`Maqgo/`**: carpeta local habitual en Finder.
- **`Maqgo1-main/`** (esta copia): otra carpeta/clon posible. **Regla:** un solo `db_config.py` por árbol; un solo clon desde el que hagas `git push` a **`maqgo-app/Maqgo`**.
