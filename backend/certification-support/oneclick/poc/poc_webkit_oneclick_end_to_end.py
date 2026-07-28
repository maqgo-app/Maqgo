import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[4]


BACKEND = (os.getenv("POC_BACKEND_URL") or "http://127.0.0.1:8002").rstrip("/")
OUT_ROOT = REPO_ROOT / "backend/qa-artifacts/transbank-cert/POC_WEBKIT_ONECLICK_END_TO_END"
OUT_DIR = OUT_ROOT / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_json(rel_path: str, obj) -> None:
    (OUT_DIR / rel_path).write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def fill_any(page, selectors: list[str], value: str) -> bool:
    for fr in page.frames:
        for sel in selectors:
            try:
                loc = fr.locator(sel)
                if loc.count() > 0:
                    loc.first.fill(value)
                    return True
            except Exception:
                pass
    return False


def click_any(page, selectors: list[str]) -> bool:
    for fr in page.frames:
        for sel in selectors:
            try:
                loc = fr.locator(sel)
                if loc.count() > 0:
                    loc.first.click()
                    return True
            except Exception:
                pass
    return False


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "screenshots").mkdir(parents=True, exist_ok=True)

    pan = "4051885600446623"
    cvv = "123"
    exp = "12/30"
    rut = "11.111.111-1"
    pwd = "123"

    result = {
        "name": "POC_WEBKIT_ONECLICK_END_TO_END",
        "started_at": now_iso(),
        "backend": BACKEND,
        "ok": False,
        "failure_step": None,
        "error": None,
        "buy_order": None,
        "token_tail": None,
        "tbk_user": None,
        "steps": [],
        "artifacts": {},
    }

    start_request = {
        "username": "cert_oneclick",
        "email": "cert+oneclick@maqgo.cl",
        "return_url": f"{BACKEND}/api/payments/oneclick/confirm-return",
    }
    write_json("01_start_request.json", start_request)
    result["artifacts"]["start_request"] = str(OUT_DIR / "01_start_request.json")

    try:
        r = requests.post(f"{BACKEND}/api/payments/oneclick/start", json=start_request, timeout=60)
        start_body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"raw": r.text}
        write_json("02_start_response.json", {"http_status": r.status_code, "body": start_body})
        result["artifacts"]["start_response"] = str(OUT_DIR / "02_start_response.json")
        if r.status_code != 200:
            result["failure_step"] = "POST /start"
            result["error"] = f"http_status={r.status_code}"
            write_json("00_result.json", result)
            return
    except Exception as e:
        result["failure_step"] = "POST /start"
        result["error"] = f"{type(e).__name__}: {e}"[:300]
        write_json("00_result.json", result)
        return

    buy_order = start_body.get("buy_order")
    token = start_body.get("token")
    url_webpay = start_body.get("url_webpay")
    result["buy_order"] = buy_order
    result["token_tail"] = token[-6:] if isinstance(token, str) else None

    html = (
        "<html><body>"
        f"<form id='f' action='{url_webpay}' method='POST'>"
        f"<input type='hidden' name='TBK_TOKEN' value='{token}' />"
        "</form><script>document.getElementById('f').submit();</script>"
        "</body></html>"
    )

    console_logs = []
    responses = []
    framenav = []

    try:
        with sync_playwright() as p:
            browser = p.webkit.launch(headless=False)
            context = browser.new_context(
                record_har_path=str(OUT_DIR / "playwright.har"),
                record_har_content="attach",
            )
            context.tracing.start(screenshots=True, snapshots=True, sources=True)
            page = context.new_page()

            page.on("console", lambda msg: console_logs.append({"ts": now_iso(), "type": msg.type, "text": msg.text}))
            page.on("response", lambda resp: responses.append({"ts": now_iso(), "url": resp.url, "status": resp.status}))
            page.on("framenavigated", lambda fr: framenav.append({"ts": now_iso(), "name": fr.name, "url": fr.url}))

            page.set_content(html, wait_until="domcontentloaded")
            page.wait_for_timeout(3000)
            page.screenshot(path=str(OUT_DIR / "screenshots/03_webpay_open.png"), full_page=True)
            result["steps"].append({"ts": now_iso(), "step": "webpay_open", "url": page.url, "title": page.title()})

            try:
                if page.locator("#tarjetas").count() > 0 and page.locator("#tarjetas").first.is_visible():
                    page.locator("#tarjetas").first.click(timeout=1500)
                    page.wait_for_timeout(1000)
                    page.screenshot(path=str(OUT_DIR / "screenshots/04_after_tarjetas.png"), full_page=True)
            except Exception:
                pass

            try:
                cont = page.locator("button.submit:has-text('Continuar')")
                if cont.count() > 0 and cont.first.is_visible():
                    cont.first.click(timeout=1500)
                    page.wait_for_timeout(1000)
                    page.screenshot(path=str(OUT_DIR / "screenshots/05_after_email_continue.png"), full_page=True)
            except Exception:
                pass

            ok_pan = fill_any(
                page,
                [
                    "input[name='card-number']",
                    "input#card-number",
                    "input[autocomplete='cc-number']",
                    "input[name*='card' i]",
                    "input[placeholder*='tarjeta' i]",
                ],
                pan,
            )
            ok_exp = fill_any(
                page,
                [
                    "input[name='card-expiration']",
                    "input#card-expiration",
                    "input#card-exp",
                    "input[autocomplete='cc-exp']",
                    "input[placeholder*='venc' i]",
                ],
                exp,
            )
            ok_cvv = fill_any(
                page,
                [
                    "input[name='cvv']",
                    "input#cvv",
                    "input#card-cvv",
                    "input[autocomplete='cc-csc']",
                    "input[placeholder*='cvv' i]",
                ],
                cvv,
            )
            page.screenshot(path=str(OUT_DIR / "screenshots/06_after_card_fill.png"), full_page=True)
            result["steps"].append({"ts": now_iso(), "step": "card_fill", "ok_pan": ok_pan, "ok_exp": ok_exp, "ok_cvv": ok_cvv})

            clicked = click_any(page, ["button:has-text('Inscribir mi tarjeta')", "button:has-text('Continuar')", "button:has-text('Aceptar')", "input[type='submit']"])
            page.wait_for_timeout(2000)
            page.screenshot(path=str(OUT_DIR / "screenshots/07_after_continue.png"), full_page=True)
            result["steps"].append({"ts": now_iso(), "step": "continue", "clicked": clicked, "url": page.url})

            ok_rut = fill_any(page, ["input[name='rut']", "input#rut", "input[name='TBK_RUT']", "input[placeholder*='RUT' i]"], rut)
            ok_pwd = fill_any(page, ["input[name='password']", "input[type='password']", "input[placeholder*='clave' i]"], pwd)
            ok_login = click_any(page, ["button:has-text('Ingresar')", "button:has-text('Continuar')", "input[type='submit']"])
            page.wait_for_timeout(2000)
            page.screenshot(path=str(OUT_DIR / "screenshots/08_after_auth.png"), full_page=True)
            result["steps"].append({"ts": now_iso(), "step": "auth", "ok_rut": ok_rut, "ok_pwd": ok_pwd, "clicked": ok_login, "url": page.url})

            deadline = time.time() + 120
            tbk_user = None
            while time.time() < deadline:
                u = page.url
                m = re.search(r"[?&]tbk_user=([^&]+)", u)
                if m:
                    tbk_user = m.group(1)
                    break
                time.sleep(0.3)

            page.screenshot(path=str(OUT_DIR / "screenshots/09_after_return.png"), full_page=True)
            result["tbk_user"] = tbk_user
            result["steps"].append({"ts": now_iso(), "step": "return", "url": page.url, "tbk_user": tbk_user})

            trace_path = OUT_DIR / "trace.zip"
            context.tracing.stop(path=str(trace_path))
            write_json("03_browser_console.json", {"console": console_logs})
            write_json("04_browser_network.json", {"responses": responses, "framenavigated": framenav})

            result["artifacts"]["har"] = str(OUT_DIR / "playwright.har")
            result["artifacts"]["trace"] = str(trace_path)
            result["artifacts"]["console"] = str(OUT_DIR / "03_browser_console.json")
            result["artifacts"]["network"] = str(OUT_DIR / "04_browser_network.json")

            context.close()
            browser.close()

    except Exception as e:
        result["failure_step"] = "Playwright WebKit flow"
        result["error"] = f"{type(e).__name__}: {e}"[:300]
        write_json("03_browser_console.json", {"console": console_logs})
        write_json("04_browser_network.json", {"responses": responses, "framenavigated": framenav})
        write_json("00_result.json", result)
        return

    mongo_check = {"ok": False, "error": None, "doc": None}
    try:
        from pymongo import MongoClient

        mc = MongoClient("mongodb://127.0.0.1:27017", serverSelectionTimeoutMS=3000)
        db = mc["maqgo_cert"]
        doc = db["payments_oneclick"].find_one({"buy_order": buy_order}, {"_id": 0})
        mongo_check["ok"] = True
        mongo_check["doc"] = doc
    except Exception as e:
        mongo_check["error"] = f"{type(e).__name__}: {e}"[:300]

    write_json("05_mongo.json", mongo_check)
    result["artifacts"]["mongo"] = str(OUT_DIR / "05_mongo.json")

    if result["tbk_user"]:
        result["ok"] = True
    else:
        result["failure_step"] = "tbk_user not obtained"

    result["finished_at"] = now_iso()
    write_json("00_result.json", result)


if __name__ == "__main__":
    main()
