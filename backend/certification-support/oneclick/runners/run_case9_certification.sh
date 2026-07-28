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

SELF="${0}"

FIRST_LINE="$($BOOTSTRAP_PYTHON_BIN - <<PY
from pathlib import Path
p = Path("$SELF")
try:
    print(p.read_text(encoding="utf-8", errors="replace").splitlines()[0])
except Exception:
    print("")
PY
)"

case "$FIRST_LINE" in
  "#!"*) : ;;
  *)
    echo FAIL
    echo failure_step=invalid_shebang
    exit 3
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT="$(cd "$BACKEND_DIR/.." && pwd)"
RUNS_DIR="$ROOT/backend/qa-artifacts/transbank-cert/09_cancel_inscription"
BACKEND_URL="http://127.0.0.1:8002"

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

precheck_python() {
  "$PYTHON_BIN" - <<'PY'
import importlib, sys
mods = ["uvicorn", "fastapi", "requests", "playwright"]
for m in mods:
    try:
        importlib.import_module(m)
    except Exception:
        print(m)
        sys.exit(0)
sys.exit(1)
PY
}

cleanup() {
  if [ "$STARTED_BACKEND" = "1" ] && [ -n "$UVICORN_PID" ]; then
    kill "$UVICORN_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

MISSING_PY_MODULE=""
if precheck_python >/tmp/_case9_missing_module.txt 2>/dev/null; then
  MISSING_PY_MODULE="$(cat /tmp/_case9_missing_module.txt 2>/dev/null || true)"
  rm -f /tmp/_case9_missing_module.txt >/dev/null 2>&1 || true
  echo FAIL
  echo failure_step=python_dependencies_missing:${MISSING_PY_MODULE:-unknown}
  exit 30
fi
rm -f /tmp/_case9_missing_module.txt >/dev/null 2>&1 || true

mkdir -p "$RUNS_DIR"

if backend_is_ready >/dev/null 2>&1; then
  echo FAIL
  echo failure_step=backend_already_running
  exit 34
fi

export ONECLICK_PUBLIC_VALIDATION_ENABLED=true
if [ -z "${ONECLICK_VALIDATION_TOKEN:-}" ]; then
  ONECLICK_VALIDATION_TOKEN="$("$PYTHON_BIN" - <<'PY'
import secrets
print(secrets.token_hex(24))
PY
)"
  export ONECLICK_VALIDATION_TOKEN
fi
export CERT_PLAYWRIGHT_HEADLESS=true

cd "$BACKEND_DIR" || { echo FAIL; echo failure_step=backend_dir_not_found; exit 10; }
"$PYTHON_BIN" -m uvicorn server:app --host 127.0.0.1 --port 8002 >"$RUNS_DIR/_backend_stdout.log" 2>"$RUNS_DIR/_backend_stderr.log" &
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

cd "$ROOT" || { echo FAIL; echo failure_step=repo_root_not_found; exit 12; }

CASE9_STDOUT="$RUNS_DIR/_case9_stdout.log"
CASE9_STDERR="$RUNS_DIR/_case9_stderr.log"
"$PYTHON_BIN" "$ROOT/backend/certification-support/oneclick/cases/case_09_cancel_inscription.py" >"$CASE9_STDOUT" 2>"$CASE9_STDERR" || {
  echo FAIL
  echo failure_step=case9_script_failed
  exit 14
}

RUN_ID="$("$PYTHON_BIN" - <<PY
from pathlib import Path
base = Path("$RUNS_DIR")
dirs = [p for p in base.iterdir() if p.is_dir()]
dirs.sort(key=lambda p: p.stat().st_mtime, reverse=True)
print(dirs[0].name if dirs else "")
PY
)"

if [ -z "$RUN_ID" ]; then
  echo FAIL
  echo failure_step=run_dir_not_found
  exit 13
fi

mv "$CASE9_STDOUT" "$RUNS_DIR/$RUN_ID/case9_stdout.log" >/dev/null 2>&1 || true
mv "$CASE9_STDERR" "$RUNS_DIR/$RUN_ID/case9_stderr.log" >/dev/null 2>&1 || true

"$PYTHON_BIN" - <<PY
import json, sys
from pathlib import Path

run_id = "$RUN_ID"
base = Path("$RUNS_DIR") / run_id

required = [
  "request.start.json",
  "response.start.json",
  "http_request.start.out.json",
  "http_response.start.in.json",
  "tbk_params.json",
  "result.json",
]
missing = [f for f in required if not (base / f).exists()]
if missing:
    print("FAIL")
    print("failure_step=missing_files")
    sys.exit(20)

result = json.loads((base / "result.json").read_text(encoding="utf-8"))
resp = json.loads((base / "response.start.json").read_text(encoding="utf-8"))
tbk = json.loads((base / "tbk_params.json").read_text(encoding="utf-8"))

token = ((resp.get("body") or {}).get("token") or "").strip()

if result.get("ok") is not True:
    print("FAIL")
    print(f"failure_step={result.get('failure_step') or 'result_not_ok'}")
    sys.exit(21)

if not token:
    print("FAIL")
    print("failure_step=token_missing")
    sys.exit(22)

if not (tbk.get("TBK_TOKEN") and tbk.get("TBK_ORDEN_COMPRA") and ("TBK_ID_SESION" in tbk)):
    print("FAIL")
    print("failure_step=tbk_params_missing")
    sys.exit(23)

print(f"TOKEN_INSCRIPCION={token}")
print(f"RUN_ID={run_id}")
sys.exit(0)
PY
