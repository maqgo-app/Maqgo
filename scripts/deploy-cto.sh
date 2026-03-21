#!/usr/bin/env bash
# MAQGO – Orquestación pre-deploy (CTO)
# Uso: ./scripts/deploy-cto.sh [production]
#
# 1) quality-gate (frontend obligatorio)
# 2) pre-deploy (backend + build, si existe backend/venv)
# 3) Recuerda registrar en docs/DEPLOY_LOG.md

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=============================================="
echo "  MAQGO – deploy-cto.sh"
echo "=============================================="
echo ""

echo ">>> Paso 1: ./scripts/quality-gate.sh"
"$ROOT/scripts/quality-gate.sh"

echo ""
if [ -x "${ROOT}/backend/venv/bin/python" ]; then
  echo ">>> Paso 2: ./scripts/pre-deploy.sh (venv backend encontrado)"
  "$ROOT/scripts/pre-deploy.sh"
else
  echo ">>> Paso 2: pre-deploy.sh omitido (no hay backend/venv)"
  echo "    Para tests backend locales: cd backend && python3 -m venv venv && pip install -r requirements.txt"
  echo "    Paridad completa backend: ver GitHub Actions (quality-gate.yml job backend)"
fi

echo ""
echo "=============================================="
echo "  ✓ deploy-cto: checks locales completados"
echo "  Manual: anotar deploy en docs/DEPLOY_LOG.md"
echo "  Producción: merge a main + Vercel/Railway según docs/PRODUCCION.md"
echo "=============================================="
