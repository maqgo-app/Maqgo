"""
Única fuente de verdad para MongoDB (MAQGO).

Producción: definir en el host (Railway, etc.):
  - MONGO_URL
  - DB_NAME  (un solo nombre para usuarios, servicios, sesiones, marketing, config)

Sin DB_NAME en env, el default es ``maqgo_db`` (convención histórica del repo y .env.example).
No duplicar defaults en rutas; importar siempre desde aquí.
"""
from __future__ import annotations

import os

_DEFAULT_MONGO = "mongodb://localhost:27017"
_DEFAULT_DB = "maqgo_db"


def get_mongo_url() -> str:
    return (os.environ.get("MONGO_URL") or _DEFAULT_MONGO).strip() or _DEFAULT_MONGO


def get_db_name() -> str:
    """
    DB canónico para el servicio actual.

    - Producción real: setear `DB_NAME` explícito (ej. `maqgo_db`).
    - Pruebas en "prod" sin borrar datos: usar `MAQGO_DB_NAMESPACE=staging`
      (o `MAQGO_ENV=staging`) y el nombre pasa a `<DB_NAME>_staging`.

    Esto evita "limpiar Mongo" y permite resetear pruebas cambiando solo vars.
    """
    base = (os.environ.get("DB_NAME") or _DEFAULT_DB).strip() or _DEFAULT_DB

    namespace = (os.environ.get("MAQGO_DB_NAMESPACE") or "").strip().lower()
    if not namespace:
        env = (os.environ.get("MAQGO_ENV") or os.environ.get("ENVIRONMENT") or "").strip().lower()
        if env in {"staging", "stage", "test"}:
            namespace = "staging"

    if namespace and namespace != "production":
        safe = "".join(ch for ch in namespace if ch.isalnum() or ch in {"_", "-"}).strip("_-")
        if safe:
            return f"{base}_{safe}"

    return base
