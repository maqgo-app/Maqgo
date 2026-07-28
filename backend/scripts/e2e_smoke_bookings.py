import json
import os
import random
import string
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests


def now_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def assert_local_backend(url: str) -> None:
    if not (url.startswith("http://127.0.0.1") or url.startswith("http://localhost")):
        raise RuntimeError(f"Refusing to run against non-local BACKEND_URL={url}")


def rand_suffix(n: int = 6) -> str:
    return "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(n))


def gen_buy_order() -> str:
    ts = datetime.now(timezone.utc).strftime("%y%m%d%H%M%S")
    suffix = "".join(random.choice(string.ascii_uppercase + string.digits) for _ in range(5))
    return f"MG{ts}{suffix}"[:26]


@dataclass(frozen=True)
class CategoryCase:
    key: str
    machinery_type: str


def load_env_backend_dotenv(repo_root: Path) -> None:
    env_path = repo_root / "backend/.env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        k, v = raw.split("=", 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        os.environ.setdefault(k, v)


def mongo_client_from_env():
    from pymongo import MongoClient

    mongo_url = os.getenv("MONGO_URL") or os.getenv("MONGODB_URL") or "mongodb://localhost:27017"
    db_name = os.getenv("DB_NAME") or "maqgo_db"
    client = MongoClient(mongo_url)
    return client, client[db_name]


def hash_password(password: str) -> str:
    from routes.auth import hash_password as _hash_password

    return _hash_password(password)


def ensure_user(db, *, user_id: str, email: str, phone: str, role: str, password: str, extra: dict) -> None:
    base = {
        "id": user_id,
        "email": str(email).lower(),
        "phone": phone,
        "role": role,
        "roles": [role],
        "password": hash_password(password),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    base.update(extra)
    db.users.update_one({"id": user_id}, {"$set": base, "$setOnInsert": {"createdAt": datetime.now(timezone.utc).isoformat()}}, upsert=True)


def login_password(backend: str, identifier: str, password: str, out_dir: Path) -> tuple[str, str]:
    url = f"{backend}/api/auth/login"
    payload = {"identifier": identifier, "password": password}
    r = requests.post(url, json=payload, timeout=60)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"raw": r.text}
    write_json(out_dir / "http_response.login.json", {"http_status": r.status_code, "body": body})
    if r.status_code != 200:
        raise RuntimeError(f"login failed status={r.status_code} body={body}")
    token = (body.get("token") or body.get("access_token") or "").strip()
    user_id = (body.get("id") or "").strip()
    if not token:
        raise RuntimeError(f"login token missing body={body}")
    if not user_id:
        raise RuntimeError(f"login user id missing body={body}")
    return token, user_id


def api_call(method: str, url: str, *, token: str | None, json_body: Any | None, timeout: int = 90) -> tuple[int, dict, str]:
    headers = {"accept": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    r = requests.request(method, url, headers=headers, json=json_body, timeout=timeout)
    text = r.text
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"raw": text}
    return r.status_code, body, text


def get_oneclick_inscription(db, email: str) -> dict | None:
    return db.oneclick_inscriptions.find_one({"email": email}, {"_id": 0})


def create_service_request(backend: str, token: str, payload: dict, out_dir: Path) -> dict:
    status, body, raw = api_call("POST", f"{backend}/api/service-requests", token=token, json_body=payload, timeout=90)
    write_json(out_dir / "http_response.create_service_request.json", {"http_status": status, "body": body, "raw": raw})
    if status not in (200, 201):
        raise RuntimeError(f"create service_request failed status={status} body={body}")
    return body


def provider_accept(backend: str, token: str, request_id: str, out_dir: Path) -> dict:
    status, body, raw = api_call(
        "PUT",
        f"{backend}/api/service-requests/{request_id}/accept",
        token=token,
        json_body={},
        timeout=120,
    )
    write_json(out_dir / "http_response.accept.json", {"http_status": status, "body": body, "raw": raw})
    if status not in (200, 201):
        raise RuntimeError(f"accept failed status={status} body={body}")
    return body


def get_service_request(backend: str, token: str, request_id: str, out_dir: Path | None = None) -> dict:
    status, body, raw = api_call("GET", f"{backend}/api/service-requests/{request_id}", token=token, json_body=None, timeout=60)
    if out_dir:
        write_json(out_dir / "http_response.service_request.json", {"http_status": status, "body": body, "raw": raw})
    if status != 200:
        raise RuntimeError(f"service_request fetch failed status={status} body={body}")
    return body


def wait_for_pending_offer(
    backend: str,
    client_token: str,
    request_id: str,
    provider_id: str,
    out_dir: Path,
    timeout_s: int = 45,
) -> dict:
    import time

    deadline = time.time() + timeout_s
    last = None
    while time.time() < deadline:
        sr = get_service_request(backend, client_token, request_id)
        last = sr
        attempts = sr.get("matchingAttempts") or []
        pending_ids = [a.get("providerId") for a in attempts if a.get("status") == "pending"]
        if provider_id in pending_ids:
            write_json(out_dir / "poll.offer_ready.json", {"ready": True, "service_request": sr})
            return sr
        time.sleep(0.75)

    write_json(out_dir / "poll.offer_ready.json", {"ready": False, "last_service_request": last})
    raise RuntimeError("no_pending_offer_for_provider")


def get_booking(backend: str, token: str, booking_id: str, out_dir: Path) -> dict:
    status, body, raw = api_call("GET", f"{backend}/api/bookings/{booking_id}", token=token, json_body=None, timeout=60)
    write_json(out_dir / "http_response.booking.json", {"http_status": status, "body": body, "raw": raw})
    if status != 200:
        raise RuntimeError(f"booking fetch failed status={status} body={body}")
    return body


def main() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(repo_root / "backend"))
    load_env_backend_dotenv(repo_root)

    backend = os.getenv("BACKEND_URL") or "http://127.0.0.1:8002"
    assert_local_backend(backend)

    run_id = now_id() + "_e2e_smoke_booking"
    out_root = repo_root / "backend/qa-artifacts/e2e-smoke/bookings" / run_id
    out_root.mkdir(parents=True, exist_ok=True)

    client, db = mongo_client_from_env()
    try:
        client_email = os.getenv("E2E_CLIENT_EMAIL") or "cert+oneclick@maqgo.cl"
        client_password = os.getenv("E2E_CLIENT_PASSWORD") or "E2E_CLIENT_PASSWORD"
        client_phone = os.getenv("E2E_CLIENT_PHONE") or "+56970000001"

        if not get_oneclick_inscription(db, client_email):
            write_json(out_root / "result.json", {"ok": False, "failure_step": "missing_oneclick_inscription", "client_email": client_email})
            raise SystemExit(2)

        categories = [
            CategoryCase("retroexcavadora", "retroexcavadora"),
            CategoryCase("camion_tolva", "camion_tolva"),
            CategoryCase("excavadora", "excavadora"),
            CategoryCase("minicargador", "minicargador"),
            CategoryCase("motoniveladora", "motoniveladora"),
            CategoryCase("rodillo", "rodillo"),
            CategoryCase("grua_horquilla", "grua_horquilla"),
        ]

        client_id = "e2e_client"
        ensure_user(
            db,
            user_id=client_id,
            email=client_email,
            phone=client_phone,
            role="client",
            password=client_password,
            extra={"name": "E2E Cliente", "isActive": True},
        )

        run_tag = rand_suffix(8)
        provider_password = os.getenv("E2E_PROVIDER_PASSWORD") or "E2E_PROVIDER_PASSWORD"

        for idx, c in enumerate(categories, start=1):
            provider_id = f"e2e_provider_{c.key}_{run_tag}"
            provider_email = f"e2e+{c.key}+{run_tag}@maqgo.cl".lower()
            provider_phone = f"+5697100{idx:04d}"  # estable y único por run/caso
            operator_stub = {
                "id": f"e2e_operator_{c.key}_{run_tag}",
                "name": "E2E Operador",
                "rut": "11.111.111-1",
                "phone": "+56970002000",
            }
            ensure_user(
                db,
                user_id=provider_id,
                email=provider_email,
                phone=provider_phone,
                role="provider",
                password=provider_password,
                extra={
                    "name": f"E2E Provider {c.key}",
                    "onboarding_completed": True,
                    "isAvailable": True,
                    "machineryType": c.machinery_type,
                    "location": {"lat": -33.4489, "lng": -70.6693},
                    "latitude": -33.4489,
                    "longitude": -70.6693,
                    "hourlyRate": 20000,
                    "operators": [operator_stub],
                    "providerData": {
                        "businessName": "E2E Proveedor",
                        "rut": "76.247.812-4",
                        "bankData": {
                            "bank": "BCI",
                            "accountType": "Cuenta Corriente",
                            "accountNumber": "12345678",
                            "holderName": "E2E Proveedor",
                            "holderRut": "76.247.812-4",
                        },
                    },
                    "machineData": {
                        "machineryType": c.machinery_type,
                        "licensePlate": "E2E-1234",
                        "operators": [operator_stub],
                    },
                },
            )

        run_summary: dict[str, Any] = {"run_id": run_id, "backend": backend, "client_email": client_email, "cases": {}, "ok": True}
        write_json(out_root / "run_summary.json", run_summary)

        client_dir = out_root / "client"
        write_json(client_dir / "login_request.json", {"identifier": client_email, "password": "(redacted)"})
        client_token, client_id_from_login = login_password(backend, client_email, client_password, client_dir)

        scheduled_date = (datetime.now(timezone.utc) + timedelta(days=1)).date().isoformat()
        base_price = int(os.getenv("E2E_BASE_PRICE") or "1000")
        transport_fee = int(os.getenv("E2E_TRANSPORT_FEE") or "0")

        for c in categories:
            case_dir = out_root / "cases" / c.key
            case_dir.mkdir(parents=True, exist_ok=True)

            provider_email = f"e2e+{c.key}+{run_tag}@maqgo.cl".lower()
            provider_dir = case_dir / "provider"
            write_json(provider_dir / "login_request.json", {"identifier": provider_email, "password": "(redacted)"})
            provider_token, provider_id_from_login = login_password(backend, provider_email, provider_password, provider_dir)

            booking_id = gen_buy_order()
            create_payload = {
                "booking_id": booking_id,
                "clientId": client_id_from_login,
                "clientName": "E2E Cliente",
                "clientEmail": client_email,
                "selectedProviderId": provider_id_from_login,
                "location": {"lat": -33.4489, "lng": -70.6693, "address": "Santiago, Chile"},
                "basePrice": base_price,
                "transportFee": transport_fee,
                "machineryType": c.machinery_type,
                "workdayAccepted": True,
                "reservationType": "scheduled",
                "scheduledDate": scheduled_date,
            }
            write_json(case_dir / "request.create_service_request.json", create_payload)
            try:
                create_resp = create_service_request(backend, client_token, create_payload, case_dir)
                request_id = create_resp.get("id") or create_resp.get("request_id")
                if not request_id:
                    raise RuntimeError(f"missing request_id in create response: {create_resp}")

                wait_for_pending_offer(
                    backend,
                    client_token,
                    request_id,
                    provider_id_from_login,
                    case_dir,
                )

                accept_resp = provider_accept(backend, provider_token, request_id, case_dir)

                booking_resp = get_booking(backend, client_token, booking_id, case_dir)
                pi = booking_resp.get("payment_intent") or {}
                sr = booking_resp.get("service_request") or {}

                case_ok = True
                failure: str | None = None
                if not isinstance(pi, dict) or (pi.get("state") not in {"PROVIDER_ACCEPTED", "PAYMENT_PENDING", "PAYMENT_COMPLETED"}):
                    case_ok = False
                    failure = "unexpected_payment_intent_state"
                if not isinstance(sr, dict) or (str(sr.get("status") or "").lower() not in {"confirmed", "offer_sent", "matching"}):
                    case_ok = False
                    failure = failure or "unexpected_service_request_status"

                run_summary["cases"][c.key] = {
                    "ok": case_ok,
                    "booking_id": booking_id,
                    "request_id": request_id,
                    "service_status": sr.get("status"),
                    "payment_intent_state": pi.get("state"),
                    "failure_step": failure,
                }
                if not case_ok:
                    run_summary["ok"] = False
            except Exception as e:
                run_summary["ok"] = False
                run_summary["cases"][c.key] = {"ok": False, "failure_step": "exception", "error": str(e)}

            write_json(out_root / "run_summary.json", run_summary)

        write_json(out_root / "result.json", run_summary)
        if run_summary.get("ok") is True:
            print("PASS")
            print(f"RUN_ID={run_id}")
        else:
            print("FAIL")
            print(f"RUN_ID={run_id}")
            raise SystemExit(1)
    finally:
        try:
            client.close()
        except Exception:
            pass


if __name__ == "__main__":
    main()
