#!/bin/bash
# MAQGO - Pre-deploy: tests + build antes de producción
# Uso: ./scripts/pre-deploy.sh
# Requiere: backend/venv creado, frontend con npm install

set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PY="${ROOT}/backend/venv/bin/python"
FAILED=0

echo "=============================================="
echo "  MAQGO – Pre-deploy (tests + build)"
echo "=============================================="
echo ""

# 1. Tests unitarios y de escenarios (no requieren servidor)
echo ">>> 1. Tests: pricing unit + scenarios + machinery QA"
if "$PY" -m pytest tests/test_pricing_unit.py tests/test_scenarios_simulation.py tests/test_all_machinery_qa.py -v --tb=short -q; then
  echo "    ✓ Tests OK"
else
  echo "    ✗ Tests FALLARON"
  FAILED=1
fi
echo ""

# 2. Build frontend
echo ">>> 2. Frontend build (producción)"
if (cd frontend && npm run build > /dev/null 2>&1); then
  echo "    ✓ Build OK"
else
  echo "    ✗ Build FALLÓ"
  FAILED=1
fi
echo ""

# 3. Avisos de configuración producción
echo ">>> 3. Configuración para producción"
if [ -f backend/.env ]; then
  if grep -q "CORS_ORIGINS=\*" backend/.env 2>/dev/null; then
    echo "    ⚠ Backend: CORS_ORIGINS=* — en producción define dominios en backend/.env"
  fi
  if grep -q "MAQGO_DEMO_MODE=true" backend/.env 2>/dev/null; then
    echo "    ⚠ Backend: MAQGO_DEMO_MODE=true — en producción usa false para SMS reales"
  fi
else
  echo "    ℹ Copia backend/.env.example a backend/.env y configura"
fi
if [ ! -f frontend/.env.production ] && [ -f frontend/.env.production.example ]; then
  echo "    ℹ Copia frontend/.env.production.example a frontend/.env.production antes del build de prod"
fi
echo ""

echo "=============================================="
if [ $FAILED -eq 0 ]; then
  echo "  ✓ Pre-deploy: LISTO PARA LANZAR"
  echo "  Siguiente: revisar LANZAMIENTO_MAQGO.md y checklist manual"
else
  echo "  ✗ Pre-deploy: CORREGIR FALLOS ANTES DE SUBIR"
  exit 1
fi
echo "=============================================="
