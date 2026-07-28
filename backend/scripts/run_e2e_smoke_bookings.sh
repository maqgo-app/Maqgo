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
  export ONECLICK_PUBLIC_VALIDATION_ENABLED=true
  if [ -z "${ONECLICK_VALIDATION_TOKEN:-}" ]; then
    ONECLICK_VALIDATION_TOKEN="$("$PYTHON_BIN" - <<'PY'
import secrets
print(secrets.token_hex(24))
PY
)"
    export ONECLICK_VALIDATION_TOKEN
  fi

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

CLIENT_EMAIL="${E2E_CLIENT_EMAIL:-cert+oneclick@maqgo.cl}"
HAS_INSCRIPTION="$("$PYTHON_BIN" - <<PY
import os
from pymongo import MongoClient

mongo_url = os.getenv('MONGO_URL') or os.getenv('MONGODB_URL') or 'mongodb://localhost:27017'
db_name = os.getenv('DB_NAME') or 'maqgo_db'
client_email = "$CLIENT_EMAIL".lower()

c = MongoClient(mongo_url)
db = c[db_name]
doc = db.oneclick_inscriptions.find_one({'email': client_email}, {'_id': 0, 'email': 1})
print('1' if doc else '0')
PY
)"

if [ "$HAS_INSCRIPTION" != "1" ]; then
  export CERT_PLAYWRIGHT_HEADLESS=true
  bash "$ROOT/backend/scripts/run_case6_certification.sh" >/dev/null
fi

"$PYTHON_BIN" "$ROOT/backend/scripts/e2e_smoke_bookings.py"
