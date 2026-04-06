#!/usr/bin/env python3
"""
Gate de calidad: evita regresión a defaults duplicados de MongoDB.

Uso (desde la raíz del backend):
  python scripts/verify_db_config_convention.py

Salida 0 si OK; distinto de 0 si hay violaciones.
Excluye db_config.py (única lectura permitida de MONGO_URL / DB_NAME vía os.environ).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]

# Patrones que indican drift (lectura directa del entorno para Mongo)
PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(r"os\.environ\.get\(\s*['\"]MONGO_URL['\"]"),
        "Lectura directa de MONGO_URL: usar get_mongo_url() desde db_config",
    ),
    (
        re.compile(r"os\.environ\.get\(\s*['\"]DB_NAME['\"]"),
        "Lectura directa de DB_NAME: usar get_db_name() desde db_config",
    ),
]

SKIP_NAMES = {"db_config.py", "verify_db_config_convention.py"}


def main() -> int:
    violations: list[str] = []
    for path in sorted(BACKEND_ROOT.rglob("*.py")):
        if path.name in SKIP_NAMES:
            continue
        # No escanear venv ni caches
        if "venv" in path.parts or "__pycache__" in path.parts:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        rel = path.relative_to(BACKEND_ROOT)
        for rx, hint in PATTERNS:
            if rx.search(text):
                violations.append(f"  {rel}: {hint}")

    if violations:
        print("Violaciones de convención Mongo (db_config):\n", file=sys.stderr)
        for line in violations:
            print(line, file=sys.stderr)
        print(
            "\nCorregir: importar get_mongo_url / get_db_name desde db_config.\n",
            file=sys.stderr,
        )
        return 1
    print("OK: no hay lecturas directas de MONGO_URL/DB_NAME fuera de db_config.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
