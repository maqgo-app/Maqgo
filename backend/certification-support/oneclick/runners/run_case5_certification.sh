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

PYTHON_BIN=""

SELF="${0}"

if [ ! -f "$SELF" ]; then
  echo FAIL
  echo failure_step=runner_missing
  exit 2
fi

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

CRLF_COUNT="$($BOOTSTRAP_PYTHON_BIN - <<PY
from pathlib import Path
p = Path("$SELF")
data = p.read_bytes()
print(data.count(b"\r\n"))
PY
)"

if [ "${CRLF_COUNT}" != "0" ]; then
  TMP="${SELF}.lf.tmp"
  "$BOOTSTRAP_PYTHON_BIN" - <<PY
from pathlib import Path
src = Path("$SELF")
dst = Path("$TMP")
data = src.read_bytes().replace(b"\r\n", b"\n")
dst.write_bytes(data)
PY
  chmod +x "$TMP" >/dev/null 2>&1 || true
  if command -v xattr >/dev/null 2>&1; then
    xattr -d com.apple.quarantine "$TMP" >/dev/null 2>&1 || true
  fi
  exec bash "$TMP"
fi

chmod +x "$SELF" >/dev/null 2>&1 || true
if command -v xattr >/dev/null 2>&1; then
  xattr -d com.apple.quarantine "$SELF" >/dev/null 2>&1 || true
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT="$(cd "$BACKEND_DIR/.." && pwd)"
RUNS_DIR="$ROOT/backend/qa-artifacts/transbank-cert/05_authorize_installments"
BACKEND_URL="http://127.0.0.1:8002"

if [ -x "$BACKEND_DIR/.venv/bin/python" ]; then
  PYTHON_BIN="$BACKEND_DIR/.venv/bin/python"
else
  PYTHON_BIN="$BOOTSTRAP_PYTHON_BIN"
fi

CERT_INSTALLMENTS="${CERT_INSTALLMENTS:-2}"
CERT_AUTHORIZE_AMOUNT="${CERT_AUTHORIZE_AMOUNT:-10000}"

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

backend_is_maqgo() {
  "$PYTHON_BIN" - <<PY
import json, sys, urllib.request
url = "$BACKEND_URL/openapi.json"
try:
    with urllib.request.urlopen(url, timeout=2) as r:
        if not (200 <= r.status < 300):
            sys.exit(1)
        data = json.loads(r.read().decode("utf-8", errors="replace"))
        paths = data.get("paths") or {}
        if "/api/payments/oneclick/authorize" not in paths:
            sys.exit(2)
        sys.exit(0)
except Exception:
    sys.exit(3)
PY
}

precheck_python() {
  "$PYTHON_BIN" - <<'PY'
import importlib, sys
mods = ["uvicorn", "fastapi", "motor", "pymongo", "requests"]
for m in mods:
    try:
        importlib.import_module(m)
    except Exception:
        print(m)
        sys.exit(0)
sys.exit(1)
PY
}

precheck_mongo() {
  "$PYTHON_BIN" - <<'PY'
import os, sys
from pymongo import MongoClient

mongo_url = (os.environ.get("MONGO_URL") or "mongodb://localhost:27017").strip() or "mongodb://localhost:27017"
try:
    client = MongoClient(mongo_url, serverSelectionTimeoutMS=1500, connectTimeoutMS=1500)
    client.admin.command("ping")
    sys.exit(0)
except Exception:
    sys.exit(1)
PY
}

precheck_tbk_env() {
  "$PYTHON_BIN" - <<PY
import os, sys
from pathlib import Path

backend_dir = Path("$BACKEND_DIR")
env_file = backend_dir / ".env"

values = dict(os.environ)

if env_file.exists():
    for line in env_file.read_text(encoding="utf-8", errors="replace").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        k = k.strip()
        v = v.strip()
        if k and k not in values:
            values[k] = v

required = ["TBK_ENV", "TBK_PARENT_COMMERCE_CODE", "TBK_CHILD_COMMERCE_CODE", "TBK_API_KEY_SECRET"]
for k in required:
    if not (values.get(k) or "").strip():
        print(k)
        sys.exit(0)
sys.exit(1)
PY
}

precheck_tbk_user() {
  "$PYTHON_BIN" - <<PY
import json, sys
from pathlib import Path

p = Path("$ROOT") / "backend/qa-artifacts/transbank-cert/TYPEFORM_ANSWERS.json"
if not p.exists():
    sys.exit(2)
try:
    data = json.loads(p.read_text(encoding="utf-8"))
except Exception:
    sys.exit(3)
tbk = ((data.get("case_2") or {}).get("answer") or "").strip()
sys.exit(0 if tbk else 4)
PY
}

cleanup() {
  if [ "$STARTED_BACKEND" = "1" ] && [ -n "$UVICORN_PID" ]; then
    kill "$UVICORN_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

MISSING_PY_MODULE=""
if precheck_python >/tmp/_case5_missing_module.txt 2>/dev/null; then
  MISSING_PY_MODULE="$(cat /tmp/_case5_missing_module.txt 2>/dev/null || true)"
  rm -f /tmp/_case5_missing_module.txt >/dev/null 2>&1 || true
  echo FAIL
  echo failure_step=python_dependencies_missing:${MISSING_PY_MODULE:-unknown}
  exit 30
fi
rm -f /tmp/_case5_missing_module.txt >/dev/null 2>&1 || true

if ! precheck_mongo >/dev/null 2>&1; then
  echo FAIL
  echo failure_step=mongodb_unreachable
  exit 31
fi

MISSING_TBK=""
if precheck_tbk_env >/tmp/_case5_missing_tbk.txt 2>/dev/null; then
  MISSING_TBK="$(cat /tmp/_case5_missing_tbk.txt 2>/dev/null || true)"
  rm -f /tmp/_case5_missing_tbk.txt >/dev/null 2>&1 || true
  echo FAIL
  echo failure_step=missing_tbk_environment:${MISSING_TBK:-unknown}
  exit 32
fi
rm -f /tmp/_case5_missing_tbk.txt >/dev/null 2>&1 || true

TBK_USER_RC=0
precheck_tbk_user >/dev/null 2>&1 || TBK_USER_RC=$?
if [ "$TBK_USER_RC" -ne 0 ]; then
  echo FAIL
  echo failure_step=missing_tbk_user
  exit 33
fi

if backend_is_ready >/dev/null 2>&1; then
  if ! backend_is_maqgo >/dev/null 2>&1; then
    echo FAIL
    echo failure_step=invalid_backend
    exit 34
  fi
fi

if backend_is_ready; then
  :
else
  mkdir -p "$RUNS_DIR"
  export ONECLICK_CERT_CAPTURE_AUTH_REQUEST=true
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
  "$PYTHON_BIN" -m uvicorn server:app --host 127.0.0.1 --port 8002 >"$RUNS_DIR/_backend_stdout.log" 2>"$RUNS_DIR/_backend_stderr.log" &
  UVICORN_PID=$!
  STARTED_BACKEND=1

  "$PYTHON_BIN" - <<PY
import time, sys, urllib.request
url = "$BACKEND_URL/openapi.json"
deadline = time.time() + 40
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

mkdir -p "$RUNS_DIR"

cd "$ROOT" || { echo FAIL; echo failure_step=repo_root_not_found; exit 12; }

export CERT_INSTALLMENTS="$CERT_INSTALLMENTS"
export CERT_AUTHORIZE_AMOUNT="$CERT_AUTHORIZE_AMOUNT"

mkdir -p "$RUNS_DIR"
CASE5_STDOUT="$RUNS_DIR/_case5_stdout.log"
CASE5_STDERR="$RUNS_DIR/_case5_stderr.log"
"$PYTHON_BIN" "$ROOT/backend/certification-support/oneclick/cases/case_05_authorize_installments_reuse_case2.py" >"$CASE5_STDOUT" 2>"$CASE5_STDERR" || {
  echo FAIL
  echo failure_step=case5_script_failed
  exit 14
}

RUN_ID="$("$PYTHON_BIN" - <<PY
from pathlib import Path
base = Path("$RUNS_DIR")
dirs = [p for p in base.iterdir() if p.is_dir() and p.name.endswith("_case5_installments")]
dirs.sort(key=lambda p: p.stat().st_mtime, reverse=True)
print(dirs[0].name if dirs else "")
PY
)"

if [ -z "$RUN_ID" ]; then
  echo FAIL
  echo failure_step=run_dir_not_found
  exit 13
fi

mv "$CASE5_STDOUT" "$RUNS_DIR/$RUN_ID/case5_stdout.log" >/dev/null 2>&1 || true
mv "$CASE5_STDERR" "$RUNS_DIR/$RUN_ID/case5_stderr.log" >/dev/null 2>&1 || true

"$PYTHON_BIN" - <<PY
import json, sys
from pathlib import Path

run_id = "$RUN_ID"
base = Path("$RUNS_DIR") / run_id

required = [
  "script_identity.json",
  "backend_identity.json",
  "authorize_request.compact.json",
  "request.authorize.json",
  "http_request.out.json",
  "http_response.in.json",
  "authorize_response.json",
  "payments_oneclick.json",
  "payments.json",
  "result.json",
]
missing = [f for f in required if not (base / f).exists()]
if missing:
    print("FAIL")
    print("failure_step=missing_files")
    sys.exit(20)

def load(p):
    return json.loads((base / p).read_text(encoding="utf-8"))

def find_buy_order_in_obj(obj, buy_order, max_depth=6):
    if max_depth < 0 or obj is None:
        return False
    if isinstance(obj, str):
        return obj == buy_order
    if isinstance(obj, (int, float, bool)):
        return False
    if isinstance(obj, list):
        return any(find_buy_order_in_obj(x, buy_order, max_depth-1) for x in obj)
    if isinstance(obj, dict):
        return any(find_buy_order_in_obj(v, buy_order, max_depth-1) for v in obj.values())
    return False

req_compact = load("authorize_request.compact.json")
req_received = load("request.authorize.json")
http_out = load("http_request.out.json")
http_in = load("http_response.in.json")
auth_resp = load("authorize_response.json")
pay_oc = load("payments_oneclick.json")
pay = load("payments.json")
result = load("result.json")

if result.get("ok") is not True or result.get("failure_step"):
    print("FAIL")
    print(f"failure_step={result.get('failure_step') or 'result_not_ok'}")
    sys.exit(21)

buy_order = req_compact.get("buy_order")
if not buy_order:
    print("FAIL"); print("failure_step=buy_order_missing"); sys.exit(22)

if req_received.get("buy_order") != buy_order:
    print("FAIL"); print("failure_step=buy_order_mismatch_request"); sys.exit(23)

body_raw = (http_out.get("body_raw") or "")
if buy_order not in body_raw:
    print("FAIL"); print("failure_step=buy_order_missing_http_out"); sys.exit(24)

try:
    inst_compact = int(req_compact["installments_number"])
    inst_received = int(req_received["installments_number"])
except Exception:
    print("FAIL"); print("failure_step=installments_missing_request"); sys.exit(25)

if inst_compact < 2 or inst_received != inst_compact:
    print("FAIL"); print("failure_step=installments_mismatch_request"); sys.exit(26)

if '"installments_number"' not in body_raw:
    print("FAIL"); print("failure_step=installments_missing_http_out"); sys.exit(27)

http_status = int(http_in.get("http_status") or 0)
if not (200 <= http_status < 300):
    print("FAIL"); print("failure_step=http_status_not_2xx"); sys.exit(28)

body = auth_resp.get("body")
details = body.get("details") if isinstance(body, dict) else None
if not (isinstance(details, list) and len(details) >= 1 and isinstance(details[0], dict)):
    print("FAIL"); print("failure_step=authorize_response_details_missing"); sys.exit(29)

d0 = details[0]
rc = d0.get("response_code")
st = d0.get("status")
inst_resp = d0.get("installments_number")

if rc != 0 or st != "AUTHORIZED" or not (isinstance(inst_resp, int) and inst_resp >= 2):
    print("FAIL"); print("failure_step=transbank_not_authorized_installments"); sys.exit(30)

if inst_resp != inst_compact:
    print("FAIL"); print("failure_step=installments_mismatch_response"); sys.exit(31)

if isinstance(pay_oc, dict) and pay_oc:
    if pay_oc.get("buy_order") != buy_order:
        print("FAIL"); print("failure_step=buy_order_mismatch_payments_oneclick"); sys.exit(32)

if isinstance(pay, list) and pay:
    candidate_keys = ["tbkBuyOrder", "buy_order", "parent_buy_order", "buyOrder"]
    for row in pay:
        if not isinstance(row, dict):
            continue
        found = None
        for k in candidate_keys:
            if k in row and row.get(k):
                found = row.get(k)
                break
        if found is not None:
            if found != buy_order:
                print("FAIL"); print("failure_step=buy_order_mismatch_payments"); sys.exit(33)
        else:
            if not find_buy_order_in_obj(row, buy_order):
                print("FAIL"); print("failure_step=buy_order_not_found_payments"); sys.exit(34)

print(f"BUY_ORDER_PADRE={buy_order}")
print(f"RUN_ID={run_id}")
sys.exit(0)
PY
