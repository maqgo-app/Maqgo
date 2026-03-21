#!/usr/bin/env bash
# MAQGO – Quality gate local (alineado con .github/workflows/quality-gate.yml, job frontend)
# Uso: ./scripts/quality-gate.sh
# Requiere: Node 20+, desde la raíz del repo (Maqgo1-main)
#
# El job backend (pytest + uvicorn) solo corre en CI o con entorno preparado;
# para paridad completa: push a GitHub y revisar Actions.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/frontend"

echo "=============================================="
echo "  MAQGO – quality-gate.sh (frontend)"
echo "=============================================="
echo ""

echo ">>> npm ci"
npm ci

echo ""
echo ">>> npm run test:unit"
npm run test:unit

echo ""
echo ">>> npm run build"
npm run build

echo ""
echo ">>> npm run lint (avisos no bloquean)"
set +e
npm run lint
LINT=$?
set -e
if [ "$LINT" -ne 0 ]; then
  echo "    ⚠ Lint con salida distinta de 0 — revisar antes de merge (CI puede ser permisivo)"
fi

echo ""
echo "=============================================="
echo "  ✓ quality-gate.sh: FRONTEND OK"
echo "  Siguiente: ./scripts/deploy-cto.sh o push → GitHub Actions (frontend + backend)"
echo "=============================================="
