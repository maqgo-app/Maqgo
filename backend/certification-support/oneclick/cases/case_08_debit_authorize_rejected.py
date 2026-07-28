import json
import os
import random
import string
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import subprocess

import requests


BACKEND = (os.getenv("CERT_BACKEND_URL") or "http://127.0.0.1:8002").rstrip("/")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def gen_buy_order() -> str:
    ts = datetime.now(timezone.utc).strftime("%y%m%d%H%M%S")
    suffix = "".join(random.choice(string.ascii_uppercase + string.digits) for _ in range(4))
    return f"MG{ts}{suffix}"[:26]


def write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def file_sha256(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def run_git(repo_root: Path, args: list[str]) -> str | None:
    try:
        proc = subprocess.run(
            ["git", *args],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        out = (proc.stdout or "").strip()
        return out or None
    except Exception:
        return None


def _redact_headers(headers: dict) -> dict:
    out = {}
    for k, v in (headers or {}).items():
        lk = str(k).lower()
        if lk in {"authorization", "cookie", "set-cookie", "x-oneclick-validation-token"}:
            out[k] = "(redacted)"
        else:
            out[k] = v
    return out


def update_typeform_answers(repo_root: Path, case_key: str, question: str, answer, source_rel: str) -> None:
    out_path = repo_root / "backend/qa-artifacts/transbank-cert/TYPEFORM_ANSWERS.json"
    data = {}
    if out_path.exists():
        data = load_json(out_path)
    data[case_key] = {"question": question, "answer": answer, "source": source_rel}
    write_json(out_path, data)


def main() -> None:
    repo_root = Path(__file__).resolve().parents[4]
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "_case8_debit_authorize_rejected"
    out_dir = repo_root / "backend/qa-artifacts/transbank-cert/08_debit_authorize_rejected" / run_id
    out_dir.mkdir(parents=True, exist_ok=True)

    write_json(
        out_dir / "script_identity.json",
        {
            "script_path": str(Path(__file__).resolve()),
            "sha256": file_sha256(Path(__file__).resolve()),
            "generated_at": now_iso(),
        },
    )

    oneclick_py = repo_root / "backend/routes/oneclick.py"
    oneclick_service_py = repo_root / "backend/services/oneclick_service.py"
    write_json(
        out_dir / "backend_identity.json",
        {
            "generated_at": now_iso(),
            "repo_root": str(repo_root),
            "backend_root": str(repo_root / "backend"),
            "git": {
                "commit": run_git(repo_root, ["rev-parse", "HEAD"]),
                "branch": run_git(repo_root, ["rev-parse", "--abbrev-ref", "HEAD"]),
            },
            "hashes": {
                "backend/routes/oneclick.py": file_sha256(oneclick_py) if oneclick_py.exists() else None,
                "backend/services/oneclick_service.py": file_sha256(oneclick_service_py)
                if oneclick_service_py.exists()
                else None,
            },
        },
    )

    typeform = repo_root / "backend/qa-artifacts/transbank-cert/TYPEFORM_ANSWERS.json"
    tf = load_json(typeform) if typeform.exists() else {}
    tbk_user = ((tf.get("case_6") or {}).get("answer") or "").strip()
    username = os.getenv("CERT_USERNAME") or "cert_oneclick"
    buy_order = gen_buy_order()
    amount = int(os.getenv("CERT_AUTHORIZE_AMOUNT") or "10000000")
    validation_token = (os.getenv("ONECLICK_VALIDATION_TOKEN") or os.getenv("CERT_ONECLICK_VALIDATION_TOKEN") or "").strip()

    if not tbk_user:
        raise RuntimeError("tbk_user missing (case_6 not found in TYPEFORM_ANSWERS.json)")

    result = {
        "case": "08_debit_authorize_rejected",
        "started_at": now_iso(),
        "backend": BACKEND,
        "ok": False,
        "failure_step": None,
        "error": None,
        "tbk_user": tbk_user,
        "buy_order": buy_order,
        "amount": amount,
        "artifacts": {},
    }

    authorize_req = {"username": username, "tbk_user": tbk_user, "buy_order": buy_order, "amount": amount}
    write_json(
        out_dir / "authorize_request.compact.json",
        json.loads(json.dumps(authorize_req, ensure_ascii=False, separators=(",", ":"))),
    )
    write_json(out_dir / "authorize_request.json", authorize_req)
    result["artifacts"]["authorize_request"] = str((out_dir / "authorize_request.json").relative_to(repo_root))

    try:
        headers = {"x-cert-run-id": out_dir.name}
        if validation_token:
            headers["x-oneclick-validation-token"] = validation_token

        session = requests.Session()
        req = requests.Request(
            method="POST",
            url=f"{BACKEND}/api/payments/oneclick/authorize",
            headers=headers,
            json=authorize_req,
        )
        prepared = session.prepare_request(req)
        body_raw = prepared.body
        if isinstance(body_raw, (bytes, bytearray)):
            body_raw = body_raw.decode("utf-8", errors="replace")

        write_json(
            out_dir / "http_request.out.json",
            {
                "method": prepared.method,
                "url": prepared.url,
                "headers": _redact_headers(dict(prepared.headers)),
                "body_raw": body_raw,
            },
        )
        result["artifacts"]["http_request_out"] = str((out_dir / "http_request.out.json").relative_to(repo_root))

        ar = session.send(prepared, timeout=60)
        auth_body = ar.json() if ar.headers.get("content-type", "").startswith("application/json") else {"raw": ar.text}
        write_json(
            out_dir / "http_response.in.json",
            {
                "http_status": ar.status_code,
                "headers": _redact_headers(dict(ar.headers)),
                "body_raw": ar.text,
            },
        )
        result["artifacts"]["http_response_in"] = str((out_dir / "http_response.in.json").relative_to(repo_root))
        write_json(out_dir / "authorize_response.json", {"http_status": ar.status_code, "body": auth_body})
        result["artifacts"]["authorize_response"] = str((out_dir / "authorize_response.json").relative_to(repo_root))
        if ar.status_code != 200:
            result["failure_step"] = "POST /authorize"
            result["error"] = {"http_status": ar.status_code, "body": auth_body}
            write_json(out_dir / "result.json", result)
            return
    except Exception as e:
        result["failure_step"] = "POST /authorize"
        result["error"] = f"{type(e).__name__}: {e}"[:300]
        write_json(out_dir / "result.json", result)
        return

    detail = None
    try:
        detail = (auth_body.get("details") or [None])[0]
    except Exception:
        detail = None

    mongo_oneclick = None
    mongo_payments = None
    try:
        from pymongo import MongoClient

        mc = MongoClient("mongodb://127.0.0.1:27017", serverSelectionTimeoutMS=3000)
        db = mc[os.getenv("DB_NAME") or "maqgo_cert"]
        mongo_oneclick = db["payments_oneclick"].find_one({"buy_order": buy_order}, {"_id": 0})
        mongo_payments = list(db["payments"].find({"tbkBuyOrder": buy_order}, {"_id": 0}).limit(5))
    except Exception as e:
        result["mongo_error"] = f"{type(e).__name__}: {e}"[:300]

    write_json(out_dir / "payments_oneclick.json", mongo_oneclick)
    write_json(out_dir / "payments.json", mongo_payments)
    result["artifacts"]["payments_oneclick"] = str((out_dir / "payments_oneclick.json").relative_to(repo_root))
    result["artifacts"]["payments"] = str((out_dir / "payments.json").relative_to(repo_root))

    rc = detail.get("response_code") if isinstance(detail, dict) else None
    status = detail.get("status") if isinstance(detail, dict) else None
    pt = detail.get("payment_type_code") if isinstance(detail, dict) else None

    if rc == 0:
        result["failure_step"] = "authorize not rejected"
        result["error"] = {"response_code": rc, "status": status, "payment_type_code": pt}
        write_json(out_dir / "result.json", result)
        return

    if rc != -98:
        result["failure_step"] = "authorize rejected but not -98"
        result["error"] = {"response_code": rc, "status": status, "payment_type_code": pt}
        write_json(out_dir / "result.json", result)
        return

    result["ok"] = True
    result["response_code"] = rc
    result["status"] = status
    result["payment_type_code"] = pt
    result["finished_at"] = now_iso()
    write_json(out_dir / "result.json", result)

    update_typeform_answers(
        repo_root,
        "case_8",
        "Authorize débito/prepago rechazado ($10.000.000)",
        {"parent_buy_order": buy_order, "response_code": rc, "payment_type_code": pt},
        str((out_dir / "result.json").relative_to(repo_root)),
    )


if __name__ == "__main__":
    main()
