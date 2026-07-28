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
OUT_ROOT = REPO_ROOT / "backend/qa-artifacts/transbank-cert/POC_01_FORM_STRATEGY"
OUT_DIR = OUT_ROOT / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_json(rel: str, obj) -> None:
    (OUT_DIR / rel).write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def safe_eval_value(locator) -> str | None:
    try:
        return locator.evaluate("(el) => el.value")
    except Exception:
        return None


def method_fill(locator, value: str) -> None:
    locator.fill(value)


def method_type(locator, value: str) -> None:
    locator.click()
    locator.type(value, delay=25)


def method_press_sequentially(locator, value: str) -> None:
    locator.click()
    locator.press_sequentially(value, delay=25)


def method_keyboard_type(page, value: str) -> None:
    page.keyboard.type(value, delay=25)


def clear_input(locator) -> None:
    try:
        locator.fill("")
    except Exception:
        try:
            locator.click()
            locator.press("Meta+A")
            locator.press("Backspace")
        except Exception:
            pass


def run_matrix(page, locator, field_name: str, target_value: str, validator) -> list[dict]:
    matrix = []
    methods = [
        ("locator.fill", lambda: method_fill(locator, target_value)),
        ("locator.type", lambda: method_type(locator, target_value)),
        ("locator.press_sequentially", lambda: method_press_sequentially(locator, target_value)),
        ("page.keyboard.type", lambda: (locator.click(), method_keyboard_type(page, target_value))),
    ]

    for method_name, fn in methods:
        clear_input(locator)
        time.sleep(0.2)

        before = safe_eval_value(locator)
        ok = False
        err = None
        try:
            fn()
            time.sleep(0.4)
            after = safe_eval_value(locator)
            ok = validator(after)
        except Exception as e:
            after = safe_eval_value(locator)
            err = f"{type(e).__name__}: {e}"[:240]
        matrix.append(
            {
                "field": field_name,
                "method": method_name,
                "before_value": before,
                "after_value": after,
                "ok": ok,
                "error": err,
            }
        )

    return matrix


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "screenshots").mkdir(parents=True, exist_ok=True)

    result = {
        "name": "POC_01_FORM_STRATEGY",
        "started_at": now_iso(),
        "backend": BACKEND,
        "ok": False,
        "failure_step": None,
        "error": None,
        "buy_order": None,
        "token_tail": None,
        "webpay_url": None,
        "artifacts": {},
        "matrix": [],
        "button_state": {},
    }

    start_request = {
        "username": "cert_oneclick",
        "email": "cert+oneclick@maqgo.cl",
        "return_url": f"{BACKEND}/api/payments/oneclick/confirm-return",
    }
    write_json("01_start_request.json", start_request)
    result["artifacts"]["start_request"] = str(OUT_DIR / "01_start_request.json")

    r = requests.post(f"{BACKEND}/api/payments/oneclick/start", json=start_request, timeout=60)
    start_body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"raw": r.text}
    write_json("02_start_response.json", {"http_status": r.status_code, "body": start_body})
    result["artifacts"]["start_response"] = str(OUT_DIR / "02_start_response.json")
    if r.status_code != 200:
        result["failure_step"] = "POST /start"
        result["error"] = f"http_status={r.status_code}"
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
        try:
            page.wait_for_url(re.compile(r"https://webpay3gint\.transbank\.cl/webpayserver/dist/#/.*"), timeout=20000)
        except Exception:
            pass
        try:
            page.wait_for_selector("#card-number", timeout=20000)
        except Exception:
            pass
        page.wait_for_timeout(1500)
        result["webpay_url"] = page.url
        page.screenshot(path=str(OUT_DIR / "screenshots/00_webpay_open.png"), full_page=True)

        try:
            if page.locator("#tarjetas").count() > 0 and page.locator("#tarjetas").first.is_visible():
                page.locator("#tarjetas").first.click(timeout=1500)
                page.wait_for_timeout(1000)
        except Exception:
            pass

        try:
            cont = page.locator("button.submit:has-text('Continuar')")
            if cont.count() > 0 and cont.first.is_visible():
                cont.first.click(timeout=1500)
                page.wait_for_timeout(1000)
        except Exception:
            pass

        page.screenshot(path=str(OUT_DIR / "screenshots/01_before_fill.png"), full_page=True)

        card_number = page.locator("#card-number")
        if card_number.count() == 0:
            result["failure_step"] = "locate card-number"
            result["error"] = "card-number not found"
            page.screenshot(path=str(OUT_DIR / "screenshots/FAIL_locators.png"), full_page=True)
            trace_path = OUT_DIR / "trace.zip"
            context.tracing.stop(path=str(trace_path))
            write_json("03_browser_console.json", {"console": console_logs})
            write_json("04_browser_network.json", {"responses": responses, "framenavigated": framenav})
            result["artifacts"]["har"] = str(OUT_DIR / "playwright.har")
            result["artifacts"]["trace"] = str(trace_path)
            result["artifacts"]["console"] = str(OUT_DIR / "03_browser_console.json")
            result["artifacts"]["network"] = str(OUT_DIR / "04_browser_network.json")
            write_json("00_result.json", result)
            context.close()
            browser.close()
            return

        method_fill(card_number.first, "4051885600446623")
        page.wait_for_timeout(700)
        page.screenshot(path=str(OUT_DIR / "screenshots/01_after_card_number.png"), full_page=True)

        accept_terms = page.locator("#accept-terms")
        accept_btn = page.locator("button:has-text('Aceptar y continuar')")
        try:
            if accept_terms.count() > 0:
                try:
                    accept_terms.first.check(force=True)
                except Exception:
                    lbl = page.locator("label[for='accept-terms']")
                    if lbl.count() > 0:
                        lbl.first.click(timeout=1500)
                page.wait_for_timeout(300)
        except Exception:
            pass

        try:
            checked = page.evaluate("() => !!document.querySelector('#accept-terms') && document.querySelector('#accept-terms').checked")
        except Exception:
            checked = None
        try:
            accept_enabled = accept_btn.first.is_enabled() if accept_btn.count() else None
        except Exception:
            accept_enabled = None
        result["button_state"]["accept_terms_checked"] = checked
        result["button_state"]["accept_and_continue_enabled"] = accept_enabled

        try:
            if accept_btn.count() > 0 and accept_btn.first.is_visible() and accept_btn.first.is_enabled():
                accept_btn.first.click(timeout=1500)
                page.wait_for_timeout(1500)
                page.screenshot(path=str(OUT_DIR / "screenshots/01_after_accept_and_continue.png"), full_page=True)
        except Exception:
            pass

        try:
            page.wait_for_selector("#card-exp", timeout=6000)
        except Exception:
            pass
        try:
            page.wait_for_selector("#card-cvv", timeout=6000)
        except Exception:
            pass

        card_exp = page.locator("#card-exp")
        card_cvv = page.locator("#card-cvv")

        if card_exp.count() == 0:
            card_exp = page.locator("input[autocomplete='cc-exp']")
        if card_cvv.count() == 0:
            card_cvv = page.locator("input[autocomplete='cc-csc']")

        if card_exp.count() == 0 or card_cvv.count() == 0:
            result["failure_step"] = "locate exp/cvv"
            result["error"] = f"counts: card-exp={card_exp.count()} card-cvv={card_cvv.count()}"
            try:
                inputs_seen = page.evaluate(
                    """
() => Array.from(document.querySelectorAll('input')).map(el => ({
  id: el.id || null,
  name: el.name || null,
  type: el.type || null,
  autocomplete: el.autocomplete || null,
  placeholder: el.placeholder || null,
  class: el.className || null,
}))
"""
                )
                write_json("debug.inputs_seen.json", {"ts": now_iso(), "inputs": inputs_seen})
                result["artifacts"]["inputs_seen"] = str(OUT_DIR / "debug.inputs_seen.json")
            except Exception:
                pass

            try:
                buttons_seen = page.evaluate(
                    """
() => Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]')).map(el => ({
  tag: el.tagName.toLowerCase(),
  id: el.id || null,
  class: el.className || null,
  type: el.getAttribute('type'),
  text: (el.innerText || el.value || '').trim().replace(/\s+/g,' ').slice(0,120),
  disabled: !!el.disabled,
}))
"""
                )
                write_json("debug.buttons_seen.json", {"ts": now_iso(), "buttons": buttons_seen})
                result["artifacts"]["buttons_seen"] = str(OUT_DIR / "debug.buttons_seen.json")
            except Exception:
                pass

            try:
                frames_seen = [{"name": fr.name, "url": fr.url} for fr in page.frames]
                write_json("debug.frames_seen.json", {"ts": now_iso(), "frames": frames_seen})
                result["artifacts"]["frames_seen"] = str(OUT_DIR / "debug.frames_seen.json")
            except Exception:
                pass

            page.screenshot(path=str(OUT_DIR / "screenshots/FAIL_exp_cvv_locators.png"), full_page=True)
            trace_path = OUT_DIR / "trace.zip"
            context.tracing.stop(path=str(trace_path))
            write_json("03_browser_console.json", {"console": console_logs})
            write_json("04_browser_network.json", {"responses": responses, "framenavigated": framenav})
            result["artifacts"]["har"] = str(OUT_DIR / "playwright.har")
            result["artifacts"]["trace"] = str(trace_path)
            result["artifacts"]["console"] = str(OUT_DIR / "03_browser_console.json")
            result["artifacts"]["network"] = str(OUT_DIR / "04_browser_network.json")
            write_json("00_result.json", result)
            context.close()
            browser.close()
            return

        result["matrix"].extend(
            run_matrix(
                page,
                card_number.first,
                "card-number",
                "4051885600446623",
                lambda v: isinstance(v, str) and v.replace(" ", "") == "4051885600446623",
            )
        )
        result["matrix"].extend(
            run_matrix(
                page,
                card_exp.first,
                "card-exp",
                "12/30",
                lambda v: isinstance(v, str) and v == "12/30",
            )
        )
        result["matrix"].extend(
            run_matrix(
                page,
                card_cvv.first,
                "card-cvv",
                "123",
                lambda v: isinstance(v, str) and v == "123",
            )
        )

        method_fill(card_number.first, "4051885600446623")
        method_fill(card_exp.first, "12/30")
        method_fill(card_cvv.first, "123")
        page.wait_for_timeout(500)
        page.screenshot(path=str(OUT_DIR / "screenshots/02_after_final_values.png"), full_page=True)

        page.screenshot(path=str(OUT_DIR / "screenshots/02_after_matrix.png"), full_page=True)

        inscribir = page.locator("button:has-text('Inscribir mi tarjeta')")
        continuar = page.locator("button:has-text('Continuar')")
        submit = page.locator("input[type='submit']")

        def state(loc):
            try:
                return {
                    "count": loc.count(),
                    "visible": loc.first.is_visible() if loc.count() else False,
                    "enabled": loc.first.is_enabled() if loc.count() else False,
                }
            except Exception as e:
                return {"count": loc.count(), "error": f"{type(e).__name__}: {e}"[:200]}

        result["button_state"]["inscribir"] = state(inscribir)
        result["button_state"]["continuar"] = state(continuar)
        result["button_state"]["submit"] = state(submit)

        try:
            target_btn = inscribir if inscribir.count() else continuar
            if target_btn.count() and target_btn.first.is_visible() and target_btn.first.is_enabled():
                target_btn.first.click(timeout=1500)
                result["button_state"]["after_click_url"] = page.url
                try:
                    page.wait_for_selector("input[name='TBK_RUT']", timeout=15000)
                except Exception:
                    pass
                page.wait_for_timeout(1000)
                result["button_state"]["after_wait_url"] = page.url
                page.screenshot(path=str(OUT_DIR / "screenshots/03_after_continue_click.png"), full_page=True)

                tbk_rut = page.locator("input[name='TBK_RUT']")
                rut_client = page.locator("#rutClient")
                pwd_client = page.locator("#passwordClient")
                result["button_state"]["tbk_rut_count"] = tbk_rut.count()
                result["button_state"]["rutClient_count"] = rut_client.count()
                if tbk_rut.count() == 0 and "authenticator" in page.url:
                    try:
                        auth_frames = []
                        for fr in page.frames:
                            item = {"name": fr.name, "url": fr.url, "ok": False, "error": None, "inputs": None}
                            try:
                                inv = fr.evaluate(
                                    """
() => Array.from(document.querySelectorAll('input')).map(el => ({
  id: el.id || null,
  name: el.name || null,
  type: el.type || null,
  autocomplete: el.autocomplete || null,
  placeholder: el.placeholder || null,
  class: el.className || null,
}))
"""
                                )
                                item["inputs"] = inv
                                item["ok"] = True
                            except Exception as e:
                                item["error"] = f"{type(e).__name__}: {e}"[:240]
                            auth_frames.append(item)

                        write_json("debug.auth.inputs_by_frame.json", {"ts": now_iso(), "frames": auth_frames})
                        result["artifacts"]["auth_inputs_by_frame"] = str(OUT_DIR / "debug.auth.inputs_by_frame.json")
                    except Exception:
                        pass
                rut_input = tbk_rut if tbk_rut.count() > 0 else rut_client
                pwd_input = page.locator("input[type='password']")
                if pwd_client.count() > 0:
                    pwd_input = pwd_client

                if rut_input.count() > 0:
                    result["matrix"].extend(
                        run_matrix(
                            page,
                            rut_input.first,
                            "RUT",
                            "11.111.111-1",
                            lambda v: isinstance(v, str) and len(v) >= 8,
                        )
                    )
                    if pwd_input.count() > 0:
                        result["matrix"].extend(
                            run_matrix(
                                page,
                                pwd_input.first,
                                "PASSWORD",
                                "123",
                                lambda v: isinstance(v, str) and v == "123",
                            )
                        )

                    submit_auth = page.locator("input[type='submit']")
                    try:
                        result["button_state"]["auth_submit"] = {
                            "count": submit_auth.count(),
                            "visible": submit_auth.first.is_visible() if submit_auth.count() else False,
                            "enabled": submit_auth.first.is_enabled() if submit_auth.count() else False,
                        }
                    except Exception as e:
                        result["button_state"]["auth_submit"] = {"count": submit_auth.count(), "error": f"{type(e).__name__}: {e}"[:200]}
                    page.screenshot(path=str(OUT_DIR / "screenshots/04_after_rut_matrix.png"), full_page=True)
        except Exception:
            pass

        trace_path = OUT_DIR / "trace.zip"
        context.tracing.stop(path=str(trace_path))

        write_json("03_browser_console.json", {"console": console_logs})
        write_json("04_browser_network.json", {"responses": responses, "framenavigated": framenav})

        result["artifacts"]["har"] = str(OUT_DIR / "playwright.har")
        result["artifacts"]["trace"] = str(trace_path)
        result["artifacts"]["console"] = str(OUT_DIR / "03_browser_console.json")
        result["artifacts"]["network"] = str(OUT_DIR / "04_browser_network.json")

        result["ok"] = bool(result["button_state"].get("inscribir", {}).get("enabled"))
        if not result["ok"]:
            result["failure_step"] = "enable Inscribir mi tarjeta"
        result["finished_at"] = now_iso()
        write_json("00_result.json", result)

        context.close()
        browser.close()


if __name__ == "__main__":
    main()
