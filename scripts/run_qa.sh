#!/bin/bash
# MAQGO - Ejecutar suite QA
# Uso: ./scripts/run_qa.sh [--full]
# --full: también verifica build frontend y muestra checklist manual

set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BACKEND_URL="${REACT_APP_BACKEND_URL:-http://localhost:8002}"
FAILED=0

echo "=========================================="
echo "  MAQGO - Suite QA"
echo "=========================================="
echo ""

# 1. Build frontend
echo ">>> 1. Frontend build"
if (cd frontend && npm run build > /dev/null 2>&1); then
  echo "    ✓ Build OK"
else
  echo "    ✗ Build FALLÓ"
  FAILED=1
fi
echo ""

# 2. Tests unitarios + QA todas las maquinarias
echo ">>> 2. Tests pricing + QA maquinarias"
if (cd "$ROOT" && python3 -m pytest tests/test_pricing_unit.py tests/test_all_machinery_qa.py -v --tb=short 2>/dev/null); then
  echo "    ✓ Unit tests OK"
else
  echo "    ✗ Unit tests FALLARON"
  FAILED=1
fi
echo ""

# 3. Tests API (requiere backend en 8002)
echo ">>> 3. Tests API pricing"
if curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/api/" 2>/dev/null | grep -q 200; then
  if REACT_APP_BACKEND_URL="$BACKEND_URL" python3 -m pytest tests/test_pricing_api.py -v --tb=short 2>/dev/null; then
    echo "    ✓ API tests OK"
  else
    echo "    ✗ API tests FALLARON"
    FAILED=1
  fi
else
  echo "    ⊘ Backend no responde en $BACKEND_URL - saltando API tests"
fi
echo ""

# 4. OneClick (requiere backend)
echo ">>> 4. OneClick"
if curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/api/" 2>/dev/null | grep -q 200; then
  if (cd backend && bash test_oneclick.sh 2>/dev/null | grep -q "url_webpay"); then
    echo "    ✓ OneClick start OK"
  else
    echo "    ✗ OneClick falló"
    FAILED=1
  fi
else
  echo "    ⊘ Backend no responde - saltando OneClick"
fi
echo ""

# Resumen
echo "=========================================="
if [ $FAILED -eq 0 ]; then
  echo "  ✓ QA automatizado: PASS"
else
  echo "  ✗ QA automatizado: FALLOS DETECTADOS"
  exit 1
fi
echo "=========================================="
echo ""

# Checklist manual si --full
if [ "$1" = "--full" ]; then
  echo "CHECKLIST MANUAL (docs/QA_REGRESSION_CHECKLIST.md):"
  echo "  - Flujo inmediato por hora (Retroexcavadora)"
  echo "  - Flujo inmediato por viaje (Camión Tolva)"
  echo "  - Desglose ConfirmServiceScreen correcto"
  echo "  - Validación comuna"
  echo ""
  echo "Ejecutar manualmente antes de deploy."
fi
