#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT="$(cd "$BACKEND_DIR/.." && pwd)"

PYTHON_BIN=""
if [ -x "$BACKEND_DIR/.venv/bin/python" ]; then
  PYTHON_BIN="$BACKEND_DIR/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="$(command -v python3)"
else
  PYTHON_BIN="$(command -v python)"
fi

export PROD_BASE_URL="${PROD_BASE_URL:-https://www.maqgo.cl}"
export PROD_LOGIN_URL="${PROD_LOGIN_URL:-$PROD_BASE_URL/}"
export PROD_LOGIN_WAIT_SECONDS="${PROD_LOGIN_WAIT_SECONDS:-180}"
export PROD_SCREENSHOT_HEADLESS="${PROD_SCREENSHOT_HEADLESS:-false}"

cd "$ROOT" || exit 1
"$PYTHON_BIN" "$ROOT/backend/scripts/capture_prod_authenticated_screenshots.py"

