import json
import os
import re
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
    data[case_key] = {"question": question, "answer": answer, "source": source_rel}
    write_json(out_path, data)


def main() -> None:
    repo_root = Path(__file__).resolve().parents[4]
    out_dir = repo_root / "backend/qa-artifacts/transbank-cert/09_cancel_inscription" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    (out_dir / "screenshots").mkdir(parents=True, exist_ok=True)

    username = os.getenv("CERT_USERNAME") or "cert_oneclick"
    email = os.getenv("CERT_EMAIL") or "cert+oneclick@maqgo.cl"
    return_url = f"{BACKEND}/api/payments/oneclick/confirm-return"

    result = {
        "case": "09_cancel_inscription",
        "started_at": now_iso(),
        "backend": BACKEND,
        "ok": False,
        "failure_step": None,
        "error": None,
        "buy_order": None,
        "token": None,
        "abort_return": None,
        "tbk_params": None,
        "artifacts": {},
    }

    start_req = {"username": username, "email": email, "return_url": return_url}
    write_json(out_dir / "request.start.json", start_req)
    result["artifacts"]["request_start"] = str((out_dir / "request.start.json").relative_to(repo_root))

    validation_token = (os.getenv("ONECLICK_VALIDATION_TOKEN") or os.getenv("CERT_ONECLICK_VALIDATION_TOKEN") or "").strip()
    headers = {"x-oneclick-validation-token": validation_token} if validation_token else {}
    write_json(
        out_dir / "http_request.start.out.json",
        {
            "method": "POST",
            "url": f"{BACKEND}/api/payments/oneclick/start",
            "headers": {"x-oneclick-validation-token": "(redacted)"} if validation_token else {},
            "body": start_req,
        },
    )
    result["artifacts"]["http_request_start_out"] = str((out_dir / "http_request.start.out.json").relative_to(repo_root))

    try:
        r = requests.post(f"{BACKEND}/api/payments/oneclick/start", json=start_req, headers=headers, timeout=60)
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"raw": r.text}
        write_json(
            out_dir / "http_response.start.in.json",
            {"http_status": r.status_code, "headers": dict(r.headers), "body": body},
        )
        result["artifacts"]["http_response_start_in"] = str((out_dir / "http_response.start.in.json").relative_to(repo_root))
        write_json(out_dir / "response.start.json", {"http_status": r.status_code, "body": body})
        result["artifacts"]["response_start"] = str((out_dir / "response.start.json").relative_to(repo_root))
        if r.status_code != 200:
            result["failure_step"] = "POST /start"
            result["error"] = {"http_status": r.status_code, "body": body}
            write_json(out_dir / "result.json", result)
            return
    except Exception as e:
        result["failure_step"] = "POST /start"
        result["error"] = f"{type(e).__name__}: {e}"[:300]
        write_json(out_dir / "result.json", result)
        return

    buy_order = body.get("buy_order")
    token = body.get("token")
    url_webpay = body.get("url_webpay")
    result["buy_order"] = buy_order
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
    abort_callback = None
    abort_url = None

    playwright_headless = str(os.getenv("CERT_PLAYWRIGHT_HEADLESS", "true")).strip().lower() in {"1", "true", "yes", "on"}

    try:
        with sync_playwright() as p:
            browser = p.webkit.launch(headless=playwright_headless)
            context = browser.new_context(record_har_path=str(out_dir / "playwright.har"), record_har_content="attach")
            context.tracing.start(screenshots=True, snapshots=True, sources=True)
            trace_path = out_dir / "trace.zip"
            page = context.new_page()

            page.on("console", lambda msg: console_logs.append({"ts": now_iso(), "type": msg.type, "text": msg.text}))
            page.on("pageerror", lambda exc: page_errors.append({"ts": now_iso(), "error": str(exc)}))
            page.on("framenavigated", lambda fr: framenav.append({"ts": now_iso(), "name": fr.name, "url": fr.url}))

            def on_request(req):
                nonlocal abort_url
                try:
                    requests_log.append({"ts": now_iso(), "method": req.method, "url": req.url, "resource_type": req.resource_type})
                    if "/api/payments/oneclick/confirm-return" in req.url:
                        abort_url = req.url
                except Exception:
                    pass

            def on_response(resp):
                nonlocal abort_callback
                try:
                    responses.append({"ts": now_iso(), "status": resp.status, "url": resp.url})
                    if "/api/payments/oneclick/confirm-return" in resp.url:
                        abort_callback = {"ts": now_iso(), "url": resp.url, "status": resp.status, "headers": dict(resp.headers)}
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
            page.screenshot(path=str(out_dir / "screenshots/01_webpay_open.png"), full_page=True)

            candidates = [
                "text=Abandonar y volver al comercio",
                "text=Abandonar",
                "text=volver al comercio",
                "text=Anular",
                "text=Cancelar",
            ]
            clicked = False
            for sel in candidates:
                try:
                    loc = page.locator(sel)
                    if loc.count() > 0 and loc.first.is_visible():
                        loc.first.click(timeout=2000)
                        clicked = True
                        break
                except Exception:
                    continue

            if not clicked:
                result["failure_step"] = "cancel button not found"
                page.screenshot(path=str(out_dir / "screenshots/FAIL_no_cancel.png"), full_page=True)
                context.tracing.stop(path=str(trace_path))
                write_json(out_dir / "browser.console.json", {"console": console_logs, "page_errors": page_errors})
                write_json(out_dir / "browser.network.json", {"requests": requests_log, "responses": responses, "framenavigated": framenav})
                result["artifacts"]["har"] = str((out_dir / "playwright.har").relative_to(repo_root))
                result["artifacts"]["trace"] = str((out_dir / "trace.zip").relative_to(repo_root))
                result["artifacts"]["browser_console"] = str((out_dir / "browser.console.json").relative_to(repo_root))
                result["artifacts"]["browser_network"] = str((out_dir / "browser.network.json").relative_to(repo_root))
                write_json(out_dir / "result.json", result)
                context.close()
                browser.close()
                return

            page.wait_for_timeout(4000)
            page.screenshot(path=str(out_dir / "screenshots/02_after_cancel.png"), full_page=True)

            context.tracing.stop(path=str(trace_path))
            write_json(out_dir / "browser.console.json", {"console": console_logs, "page_errors": page_errors})
            write_json(out_dir / "browser.network.json", {"requests": requests_log, "responses": responses, "framenavigated": framenav})
            result["artifacts"]["har"] = str((out_dir / "playwright.har").relative_to(repo_root))
            result["artifacts"]["trace"] = str((out_dir / "trace.zip").relative_to(repo_root))
            result["artifacts"]["browser_console"] = str((out_dir / "browser.console.json").relative_to(repo_root))
            result["artifacts"]["browser_network"] = str((out_dir / "browser.network.json").relative_to(repo_root))

            context.close()
            browser.close()

    except Exception as e:
        result["failure_step"] = "playwright"
        result["error"] = f"{type(e).__name__}: {e}"[:300]
        write_json(out_dir / "result.json", result)
        return

    result["abort_return"] = abort_callback
    abort_url = abort_url or (abort_callback or {}).get("url")
    result["abort_return_url"] = abort_url
    tbk_params = {}
    if abort_url:
        try:
            from urllib.parse import parse_qs, urlparse

            parsed = urlparse(abort_url)
            qs = parse_qs(parsed.query, keep_blank_values=True)
            for k in ["TBK_TOKEN", "TBK_ID_SESION", "TBK_ORDEN_COMPRA"]:
                if k in qs:
                    tbk_params[k] = (qs.get(k) or [""])[0]
        except Exception:
            for k in ["TBK_TOKEN", "TBK_ID_SESION", "TBK_ORDEN_COMPRA"]:
                m = re.search(rf"[?&]{k}=([^&]*)", abort_url)
                if m:
                    tbk_params[k] = m.group(1)
    result["tbk_params"] = tbk_params

    write_json(out_dir / "tbk_params.json", tbk_params)
    result["artifacts"]["tbk_params"] = str((out_dir / "tbk_params.json").relative_to(repo_root))

    if not tbk_params.get("TBK_TOKEN"):
        result["failure_step"] = "TBK_TOKEN not captured"
        write_json(out_dir / "result.json", result)
        return

    result["ok"] = True
    result["finished_at"] = now_iso()
    write_json(out_dir / "result.json", result)

    update_typeform_answers(
        repo_root,
        "case_9",
        "Cancelar una inscripción (token)",
        token,
        str((out_dir / "result.json").relative_to(repo_root)),
    )


if __name__ == "__main__":
    main()
