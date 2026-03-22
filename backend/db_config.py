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
    raw = (os.environ.get("DB_NAME") or _DEFAULT_DB).strip()
    return raw or _DEFAULT_DB
