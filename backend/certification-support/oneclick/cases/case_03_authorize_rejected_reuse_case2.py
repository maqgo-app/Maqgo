import json
import os
import random
import string
from datetime import datetime, timezone
from pathlib import Path

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


def update_typeform_answers(repo_root: Path, case_key: str, entry: dict) -> None:
    out_path = repo_root / "backend/qa-artifacts/transbank-cert/TYPEFORM_ANSWERS.json"
    data = {}
    if out_path.exists():
        data = load_json(out_path)
    data[case_key] = entry
    write_json(out_path, data)


def main() -> None:
    repo_root = Path(__file__).resolve().parents[4]
    out_dir = repo_root / "backend/qa-artifacts/transbank-cert/03_authorize_rejected" / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "_reuse_case2")
    out_dir.mkdir(parents=True, exist_ok=True)

    case2_result = repo_root / "backend/qa-artifacts/transbank-cert/02_credit_ok/20260722T173906Z/result.json"
    c2 = load_json(case2_result)
    tbk_user = c2.get("tbk_user")
    username = c2.get("username") or "cert_oneclick"

    buy_order = gen_buy_order()
    amount = 10000000

    result = {
        "case": 3,
        "started_at": now_iso(),
        "backend": BACKEND,
        "tbk_user_source": str(case2_result.relative_to(repo_root)),
        "tbk_user": tbk_user,
        "username": username,
        "buy_order": buy_order,
        "amount": amount,
        "ok": False,
        "failure_step": None,
        "error": None,
        "artifacts": {},
    }

    authorize_req = {"username": username, "tbk_user": tbk_user, "buy_order": buy_order, "amount": amount}
    write_json(out_dir / "authorize_request.json", authorize_req)
    result["artifacts"]["authorize_request"] = str((out_dir / "authorize_request.json").relative_to(repo_root))

    try:
        ar = requests.post(f"{BACKEND}/api/payments/oneclick/authorize", json=authorize_req, timeout=60)
        auth_body = ar.json() if ar.headers.get("content-type", "").startswith("application/json") else {"raw": ar.text}
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

    response_code = detail.get("response_code") if isinstance(detail, dict) else None
    status = detail.get("status") if isinstance(detail, dict) else None

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

    if response_code == 0:
        result["failure_step"] = "authorize not rejected"
        result["error"] = {"response_code": response_code, "status": status}
        write_json(out_dir / "result.json", result)
        return

    result["ok"] = True
    result["finished_at"] = now_iso()
    write_json(out_dir / "result.json", result)

    update_typeform_answers(
        repo_root,
        "case_3",
        {
            "case": 3,
            "question": "Ingresa el buy_order padre que enviaste al crear la transacción.",
            "answer": buy_order,
            "evidence": [
                str((out_dir / "authorize_request.json").relative_to(repo_root)),
                str((out_dir / "authorize_response.json").relative_to(repo_root)),
                str((out_dir / "payments_oneclick.json").relative_to(repo_root)),
                str((out_dir / "payments.json").relative_to(repo_root)),
            ],
        },
    )


if __name__ == "__main__":
    main()

