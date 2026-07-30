#!/usr/bin/env bash
set -euo pipefail

BOOTSTRAP_PYTHON_BIN=""
if command -v python3 >/dev/null 2>&1; then
  BOOTSTRAP_PYTHON_BIN="$(command -v python3)"
elif command -v python >/dev/null 2>&1; then
  BOOTSTRAP_PYTHON_BIN="$(command -v python)"
else
  echo FAIL
  echo failure_step=python_missing
  exit 29
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT="$(cd "$BACKEND_DIR/.." && pwd)"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8002}"

PYTHON_BIN=""
if [ -x "$BACKEND_DIR/.venv/bin/python" ]; then
  PYTHON_BIN="$BACKEND_DIR/.venv/bin/python"
else
  PYTHON_BIN="$BOOTSTRAP_PYTHON_BIN"
fi

STARTED_BACKEND=0
UVICORN_PID=""

backend_is_ready() {
  "$PYTHON_BIN" - <<PY
import sys, urllib.request
try:
    with urllib.request.urlopen("$BACKEND_URL/openapi.json", timeout=1.5) as r:
        sys.exit(0 if 200 <= r.status < 300 else 1)
except Exception:
    sys.exit(1)
PY
}

cleanup() {
  if [ "$STARTED_BACKEND" = "1" ] && [ -n "$UVICORN_PID" ]; then
    kill "$UVICORN_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if ! backend_is_ready >/dev/null 2>&1; then
  cd "$BACKEND_DIR" || { echo FAIL; echo failure_step=backend_dir_not_found; exit 10; }
  "$PYTHON_BIN" -m uvicorn server:app --host 127.0.0.1 --port 8002 >/dev/null 2>&1 &
  UVICORN_PID=$!
  STARTED_BACKEND=1

  "$PYTHON_BIN" - <<PY
import time, sys, urllib.request
url = "$BACKEND_URL/openapi.json"
deadline = time.time() + 45
while time.time() < deadline:
    try:
        with urllib.request.urlopen(url, timeout=2) as r:
            if 200 <= r.status < 300:
                sys.exit(0)
    except Exception:
        pass
    time.sleep(0.5)
sys.exit(1)
PY
  if [ $? -ne 0 ]; then
    echo FAIL
    echo failure_step=backend_not_ready
    exit 11
  fi
fi

cd "$ROOT" || { echo FAIL; echo failure_step=repo_root_not_found; exit 12; }

"$PYTHON_BIN" "$ROOT/backend/scripts/e2e_smoke_bookings.py"
