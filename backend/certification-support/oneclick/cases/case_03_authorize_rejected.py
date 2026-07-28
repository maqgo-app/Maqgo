import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from playwright.sync_api import sync_playwright


BACKEND = (os.getenv("CERT_BACKEND_URL") or "http://127.0.0.1:8002").rstrip("/")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def update_typeform_answers(repo_root: Path, case_key: str, question: str, answer, source_rel: str) -> None:
    out_path = repo_root / "backend/qa-artifacts/transbank-cert/TYPEFORM_ANSWERS.json"
    data = {}
    if out_path.exists():
        data = load_json(out_path)
    data[case_key] = {
        "question": question,
        "answer": answer,
        "source": source_rel,
    }
    write_json(out_path, data)


def main() -> None:
    repo_root = Path(__file__).resolve().parents[4]
    out_dir = repo_root / "backend/qa-artifacts/transbank-cert/03_authorize_rejected" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    (out_dir / "screenshots").mkdir(parents=True, exist_ok=True)

    username = os.getenv("CERT_USERNAME") or "cert_oneclick"
    email = os.getenv("CERT_EMAIL") or "cert+oneclick@maqgo.cl"
    return_url = f"{BACKEND}/api/payments/oneclick/confirm-return"

    pan = os.getenv("CERT_CARD_PAN") or "4051885600446623"
    exp = os.getenv("CERT_CARD_EXP") or "12/30"
    cvv = os.getenv("CERT_CARD_CVV") or "123"
    rut = os.getenv("CERT_RUT") or "11.111.111-1"
    password = os.getenv("CERT_PASSWORD") or "123"
    amount = int(os.getenv("CERT_AUTHORIZE_AMOUNT") or "10000000")

    result = {
        "case": "03_authorize_rejected",
        "started_at": now_iso(),
        "backend": BACKEND,
        "ok": False,
        "failure_step": None,
        "error": None,
        "parent_buy_order": None,
        "token": None,
        "tbk_user": None,
        "authorize": None,
        "artifacts": {},
    }

    start_req = {"username": username, "email": email, "return_url": return_url}
    write_json(out_dir / "request.start.json", start_req)
    result["artifacts"]["request_start"] = str(out_dir / "request.start.json")

    r = requests.post(f"{BACKEND}/api/payments/oneclick/start", json=start_req, timeout=60)
    start_body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"raw": r.text}
    write_json(out_dir / "response.start.json", {"http_status": r.status_code, "body": start_body})
    result["artifacts"]["response_start"] = str(out_dir / "response.start.json")
    if r.status_code != 200:
        result["failure_step"] = "POST /start"
        result["error"] = f"http_status={r.status_code}"
        write_json(out_dir / "result.json", result)
        return

    parent_buy_order = start_body.get("buy_order")
    token = start_body.get("token")
    url_webpay = start_body.get("url_webpay")
    result["parent_buy_order"] = parent_buy_order
    result["token"] = token

    html = (
        "<html><body>"
        f"<form id='f' action='{url_webpay}' method='POST'>"
        f"<input type='hidden' name='TBK_TOKEN' value='{token}' />"
        "</form><script>document.getElementById('f').submit();</script>"
        "</body></html>"
    )

    console_logs = []
    responses = []
    requests_log = []
    page_errors = []
    framenav = []
    callback_hits = []
    tbk_user = None

    try:
        with sync_playwright() as p:
            browser = p.webkit.launch(headless=False)
            context = browser.new_context(record_har_path=str(out_dir / "playwright.har"), record_har_content="attach")
            context.tracing.start(screenshots=True, snapshots=True, sources=True)
            trace_path = out_dir / "trace.zip"
            page = context.new_page()

            page.on("console", lambda msg: console_logs.append({"ts": now_iso(), "type": msg.type, "text": msg.text}))
            page.on("pageerror", lambda exc: page_errors.append({"ts": now_iso(), "error": str(exc)}))
            page.on("framenavigated", lambda fr: framenav.append({"ts": now_iso(), "name": fr.name, "url": fr.url}))

            def on_request(req):
                nonlocal tbk_user
                try:
                    requests_log.append({"ts": now_iso(), "method": req.method, "url": req.url, "resource_type": req.resource_type})
                    m = re.search(r"[?&]tbk_user=([^&]+)", req.url)
                    if m and not tbk_user:
                        tbk_user = m.group(1)
                except Exception:
                    pass

            def on_response(resp):
                try:
                    responses.append({"ts": now_iso(), "status": resp.status, "url": resp.url})
                    if "/api/payments/oneclick/confirm-return" in resp.url:
                        callback_hits.append({"ts": now_iso(), "url": resp.url, "status": resp.status, "headers": dict(resp.headers)})
                except Exception:
                    pass

            page.on("request", on_request)
            page.on("response", on_response)

            page.set_content(html, wait_until="domcontentloaded")
            page.wait_for_timeout(1500)
            page.screenshot(path=str(out_dir / "screenshots/00_after_post.png"), full_page=True)

            try:
                page.wait_for_url(re.compile(r"https://webpay3gint\.transbank\.cl/webpayserver/dist/#/.*"), timeout=60000)
            except Exception:
                pass
            try:
                page.wait_for_selector("#tarjetas", timeout=20000)
            except Exception:
                pass
            page.screenshot(path=str(out_dir / "screenshots/01_webpay_open.png"), full_page=True)

            try:
                tarjetas = page.locator("#tarjetas")
                if tarjetas.count() > 0 and tarjetas.first.is_visible():
                    tarjetas.first.click(timeout=1500)
                    page.wait_for_timeout(1200)
                    page.screenshot(path=str(out_dir / "screenshots/02_after_tarjetas.png"), full_page=True)
            except Exception:
                pass

            try:
                cont = page.locator("button.submit:has-text('Continuar')")
                if cont.count() > 0 and cont.first.is_visible():
                    cont.first.click(timeout=1500)
                    page.wait_for_timeout(800)
            except Exception:
                pass

            try:
                terms = page.locator("#accept-terms")
                if terms.count() > 0:
                    try:
                        terms.first.check(force=True)
                    except Exception:
                        lbl = page.locator("label[for='accept-terms']")
                        if lbl.count() > 0:
                            lbl.first.click(timeout=1500)
                    page.wait_for_timeout(250)
            except Exception:
                pass

            page.wait_for_selector("#card-number", timeout=60000, state="attached")
            cn = page.locator("#card-number").first
            cn.click(timeout=5000)
            try:
                cn.fill("")
            except Exception:
                pass
            cn.press_sequentially(pan, delay=30)
            page.keyboard.press("Tab")
            page.wait_for_timeout(800)

            try:
                page.wait_for_function(
                    "() => !!document.querySelector('#card-exp') || !!document.querySelector('input[autocomplete=\"cc-exp\"]')",
                    timeout=60000,
                )
                page.wait_for_function(
                    "() => !!document.querySelector('#card-cvv') || !!document.querySelector('input[autocomplete=\"cc-csc\"]')",
                    timeout=60000,
                )
            except Exception:
                pass

            ce = page.locator("#card-exp")
            if ce.count() == 0:
                ce = page.locator("input[autocomplete='cc-exp']")
            cc = page.locator("#card-cvv")
            if cc.count() == 0:
                cc = page.locator("input[autocomplete='cc-csc']")

            ce.first.fill(exp)
            cc.first.fill(cvv)
            page.wait_for_timeout(500)
            page.screenshot(path=str(out_dir / "screenshots/03_after_card_fill.png"), full_page=True)

            page.locator("button:has-text('Inscribir mi tarjeta')").first.click(timeout=15000)
            page.wait_for_url(re.compile(r"https://webpay3gint\.transbank\.cl/testcommercebank/authenticator\.cgi"), timeout=30000)
            page.wait_for_timeout(800)
            page.screenshot(path=str(out_dir / "screenshots/04_auth_page.png"), full_page=True)

            rut_norm = rut.replace(".", "")
            page.locator("#rutClient").first.fill(rut_norm)
            page.locator("#passwordClient").first.fill(password)
            page.screenshot(path=str(out_dir / "screenshots/05_auth_filled.png"), full_page=True)
            page.locator("input[type='submit']").first.click(timeout=15000)

            try:
                page.wait_for_timeout(1500)
                if "authenticatorProcess" in page.url:
                    btn = page.locator(
                        "input[type='submit'], button[type='submit'], input[type='button'], button:has-text('Continuar'), button:has-text('Aceptar')"
                    )
                    if btn.count() > 0 and btn.first.is_visible() and btn.first.is_enabled():
                        btn.first.click(timeout=1500)
            except Exception:
                pass

            try:
                page.wait_for_url(re.compile(r"http://127\.0\.0\.1:8002/oneclick/complete\?tbk_user=.*"), timeout=60000)
            except Exception:
                pass

            deadline = time.time() + 60
            while time.time() < deadline and not tbk_user:
                m = re.search(r"[?&]tbk_user=([^&]+)", page.url)
                if m:
                    tbk_user = m.group(1)
                    break
                time.sleep(0.3)

            page.wait_for_timeout(800)
            page.screenshot(path=str(out_dir / "screenshots/06_after_return.png"), full_page=True)

            result["tbk_user"] = tbk_user
            result["callback"] = callback_hits[-1] if callback_hits else None
            result["final_url"] = page.url

            context.tracing.stop(path=str(trace_path))
            write_json(out_dir / "browser.console.json", {"console": console_logs, "page_errors": page_errors})
            write_json(out_dir / "browser.network.json", {"requests": requests_log, "responses": responses, "framenavigated": framenav})
            result["artifacts"]["har"] = str(out_dir / "playwright.har")
            result["artifacts"]["trace"] = str(trace_path)
            result["artifacts"]["browser_console"] = str(out_dir / "browser.console.json")
            result["artifacts"]["browser_network"] = str(out_dir / "browser.network.json")

            context.close()
            browser.close()

    except Exception as e:
        result["failure_step"] = "inscription playwright"
        result["error"] = f"{type(e).__name__}: {e}"[:300]
        write_json(out_dir / "result.json", result)
        return

    if not result.get("tbk_user"):
        result["failure_step"] = "tbk_user not obtained"
        write_json(out_dir / "result.json", result)
        return

    cb = result.get("callback")
    if not cb or cb.get("status") not in (200, 302):
        result["failure_step"] = "confirm-return not OK"
        write_json(out_dir / "result.json", result)
        return

    authorize_req = {
        "username": username,
        "tbk_user": result["tbk_user"],
        "buy_order": parent_buy_order,
        "amount": amount,
    }
    write_json(out_dir / "request.authorize.json", authorize_req)
    result["artifacts"]["request_authorize"] = str(out_dir / "request.authorize.json")

    ar = requests.post(f"{BACKEND}/api/payments/oneclick/authorize", json=authorize_req, timeout=60)
    auth_body = ar.json() if ar.headers.get("content-type", "").startswith("application/json") else {"raw": ar.text}
    write_json(out_dir / "response.authorize.json", {"http_status": ar.status_code, "body": auth_body})
    result["artifacts"]["response_authorize"] = str(out_dir / "response.authorize.json")

    if ar.status_code != 200:
        result["failure_step"] = "POST /authorize"
        result["error"] = f"http_status={ar.status_code}"
        write_json(out_dir / "result.json", result)
        return

    detail = None
    try:
        detail = (auth_body.get("details") or [None])[0]
    except Exception:
        detail = None

    result["authorize"] = {
        "http_status": ar.status_code,
        "buy_order": auth_body.get("buy_order"),
        "detail": detail,
    }

    mongo_doc = None
    mongo_events = None
    try:
        from pymongo import MongoClient

        mc = MongoClient("mongodb://127.0.0.1:27017", serverSelectionTimeoutMS=3000)
        db = mc[os.getenv("DB_NAME") or "maqgo_cert"]
        mongo_doc = db["payments_oneclick"].find_one({"buy_order": parent_buy_order}, {"_id": 0})
        mongo_events = list(db["oneclick_validation_events"].find({"buy_order": parent_buy_order}, {"_id": 0}).sort("timestamp", 1))
    except Exception as e:
        result["mongo_error"] = f"{type(e).__name__}: {e}"[:300]

    write_json(out_dir / "mongo.payments_oneclick.json", mongo_doc)
    write_json(out_dir / "backend.log", {"buy_order": parent_buy_order, "validation_events": mongo_events})
    result["artifacts"]["mongo_payments_oneclick"] = str(out_dir / "mongo.payments_oneclick.json")
    result["artifacts"]["backend_log"] = str(out_dir / "backend.log")

    response_code = None
    child_buy_order = None
    if isinstance(detail, dict):
        response_code = detail.get("response_code")
        child_buy_order = detail.get("buy_order")

    if response_code == 0:
        result["failure_step"] = "authorize not rejected"
        result["error"] = "expected non-zero response_code"
        write_json(out_dir / "result.json", result)
        return

    result["ok"] = True
    result["finished_at"] = now_iso()
    write_json(out_dir / "result.json", result)

    update_typeform_answers(
        repo_root,
        "case_3",
        "Authorize crédito rechazado ($10.000.000)",
        {
            "parent_buy_order": parent_buy_order,
            "buy_order": auth_body.get("buy_order"),
            "child_buy_order": child_buy_order,
            "response_code": response_code,
        },
        str(out_dir.relative_to(repo_root) / "result.json"),
    )


if __name__ == "__main__":
    main()
