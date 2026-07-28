import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[4]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def main() -> None:
    backend = (os.getenv("CERT_BACKEND_URL") or "http://127.0.0.1:8002").rstrip("/")
    email = os.getenv("CERT_EMAIL") or "cert+oneclick@maqgo.cl"
    username = os.getenv("CERT_USERNAME") or "cert_oneclick"
    timeout_seconds = int(os.getenv("CERT_TIMEOUT_SECONDS") or "720")
    autofill = (os.getenv("CERT_AUTOFILL") or "true").strip().lower() in ("1", "true", "yes")
    run_authorize = (os.getenv("CERT_RUN_AUTHORIZE") or "true").strip().lower() in ("1", "true", "yes")
    authorize_amount = int(os.getenv("CERT_AUTHORIZE_AMOUNT") or "10000000")
    browser_name = (os.getenv("CERT_BROWSER") or "firefox").strip().lower()

    out_dir = REPO_ROOT / "backend/qa-artifacts/transbank-cert" / str(int(time.time()))
    out_dir.mkdir(parents=True, exist_ok=True)

    pw_home = out_dir / "pw-home"
    pw_home.mkdir(parents=True, exist_ok=True)
    pw_profile = pw_home / "profile"
    pw_profile.mkdir(parents=True, exist_ok=True)
    pw_crash = pw_home / "crash"
    pw_crash.mkdir(parents=True, exist_ok=True)

    start_resp = requests.post(
        f"{backend}/api/payments/oneclick/start",
        json={
            "username": username,
            "email": email,
            "return_url": f"{backend}/api/payments/oneclick/confirm-return",
        },
        timeout=60,
    )
    start_resp.raise_for_status()
    start = start_resp.json()

    (out_dir / "01_start_response.json").write_text(json.dumps(start, ensure_ascii=False, indent=2), encoding="utf-8")

    buy_order = start.get("buy_order")
    url_webpay = start.get("url_webpay")
    token = start.get("token")

    html = (
        "<html><body>"
        f"<form id='f' action='{url_webpay}' method='POST'>"
        f"<input type='hidden' name='TBK_TOKEN' value='{token}' />"
        "</form><script>document.getElementById('f').submit();</script>"
        "</body></html>"
    )

    evidence = {
        "started_at": _now_iso(),
        "backend": backend,
        "email": email,
        "username": username,
        "buy_order": buy_order,
        "token_tail": (token[-6:] if isinstance(token, str) else None),
        "urls": [],
        "framenavigated": [],
        "tbk_user": None,
        "authorize": None,
        "artifacts": {
            "start_response": str(out_dir / "01_start_response.json"),
        },
    }

    def fill_any_frame(page, selectors: list[str], value: str) -> bool:
        for fr in page.frames:
            for sel in selectors:
                try:
                    loc = fr.locator(sel)
                    if loc.count() > 0:
                        loc.first.fill(value)
                        return True
                except Exception:
                    continue
        return False

    def click_any_frame(page, selectors: list[str]) -> bool:
        for fr in page.frames:
            for sel in selectors:
                try:
                    loc = fr.locator(sel)
                    if loc.count() > 0:
                        loc.first.click()
                        return True
                except Exception:
                    continue
        return False

    def focus_first_visible_input(page) -> bool:
        try:
            loc = page.locator("input:visible")
            if loc.count() > 0:
                loc.first.click(timeout=1500)
                return True
        except Exception:
            pass
        for fr in page.frames:
            try:
                loc = fr.locator("input:visible")
                if loc.count() > 0:
                    loc.first.click(timeout=1500)
                    return True
            except Exception:
                continue
        return False

    def type_card_by_keyboard(page, pan: str, exp: str, cvv: str) -> dict:
        result = {"focused": False, "typed": False}
        result["focused"] = focus_first_visible_input(page)
        try:
            page.keyboard.type(pan, delay=35)
            page.keyboard.press("Tab")
            page.keyboard.type(exp, delay=35)
            page.keyboard.press("Tab")
            page.keyboard.type(cvv, delay=35)
            result["typed"] = True
        except Exception as e:
            result["error"] = f"{type(e).__name__}: {e}"[:200]
        return result

    with sync_playwright() as p:
        launch_env = {**os.environ, "HOME": str(pw_home)}
        if browser_name == "chromium":
            context = p.chromium.launch_persistent_context(
                user_data_dir=str(pw_profile),
                headless=False,
                args=[
                    f"--crash-dumps-dir={pw_crash}",
                    "--disable-crash-reporter",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--disable-breakpad",
                ],
                env=launch_env,
                record_video_dir=str(out_dir / "video"),
            )
        elif browser_name == "webkit":
            context = p.webkit.launch_persistent_context(
                user_data_dir=str(pw_profile),
                headless=False,
                env=launch_env,
                record_video_dir=str(out_dir / "video"),
            )
        else:
            context = p.firefox.launch_persistent_context(
                user_data_dir=str(pw_profile),
                headless=False,
                env=launch_env,
                record_video_dir=str(out_dir / "video"),
            )
        context.tracing.start(screenshots=True, snapshots=True, sources=True)
        page = context.pages[0] if context.pages else context.new_page()

        page.on(
            "framenavigated",
            lambda fr: evidence["framenavigated"].append({"ts": _now_iso(), "name": fr.name, "url": fr.url}),
        )
        page.on("load", lambda: evidence["urls"].append({"ts": _now_iso(), "url": page.url}))

        page.set_content(html, wait_until="domcontentloaded")
        page.wait_for_timeout(3000)
        page.screenshot(path=str(out_dir / "02_webpay_open.png"), full_page=True)

        inv_js = r"""
(() => {
  const iframes = Array.from(document.querySelectorAll('iframe')).map(el => ({
    id: el.id || null,
    name: el.name || null,
    src: el.src || null,
    title: el.title || null,
    sandbox: el.getAttribute('sandbox'),
  }));

  const inputs = Array.from(document.querySelectorAll('input')).map(el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const visible = !!(r.width && r.height) && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
    return {
      type: el.type || null,
      name: el.name || null,
      id: el.id || null,
      autocomplete: el.autocomplete || null,
      placeholder: el.placeholder || null,
      inputmode: el.getAttribute('inputmode'),
      aria_label: el.getAttribute('aria-label'),
      visible,
    };
  });

  let shadowCount = 0;
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const el = walker.currentNode;
    if (el && el.shadowRoot) shadowCount++;
  }

  const custom = new Set();
  for (const el of document.querySelectorAll('*')) {
    const t = el.tagName.toLowerCase();
    if (t.includes('-')) custom.add(t);
  }

  return {
    url: location.href,
    title: document.title,
    iframes,
    inputs,
    shadow_host_count: shadowCount,
    custom_elements_sample: Array.from(custom).slice(0, 80),
  };
})();
"""

        frames_inv = []
        for i, fr in enumerate(page.frames):
            item = {"index": i, "name": fr.name, "url": fr.url, "ok": False, "error": None, "inv": None}
            try:
                item["inv"] = fr.evaluate(inv_js)
                item["ok"] = True
            except Exception as e:
                item["error"] = f"{type(e).__name__}: {e}"[:300]
            frames_inv.append(item)

        (out_dir / "05_webpay_dom_inventory.json").write_text(
            json.dumps({"frames": frames_inv}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        evidence["artifacts"]["webpay_dom_inventory"] = str(out_dir / "05_webpay_dom_inventory.json")

        try:
            clickables = page.evaluate(
                r"""
(() => {
  const nodes = Array.from(document.querySelectorAll('button, [role="button"], a'));
  return nodes.map(el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const visible = !!(r.width && r.height) && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      type: el.getAttribute('type'),
      id: el.id || null,
      class: el.className || null,
      text: (el.innerText || '').trim().replace(/\s+/g,' ').slice(0,120),
      href: el.getAttribute('href'),
      visible,
    };
  });
})();
""",
            )
            (out_dir / "06_webpay_clickables.json").write_text(
                json.dumps({"clickables": clickables}, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            evidence["artifacts"]["webpay_clickables"] = str(out_dir / "06_webpay_clickables.json")
        except Exception as e:
            evidence["webpay_clickables_error"] = f"{type(e).__name__}: {e}"[:300]

        if autofill:
            try:
                page.locator("#tarjetas").first.click(timeout=1500)
                page.wait_for_timeout(2000)

                try:
                    cont = page.locator("button.submit:has-text('Continuar')")
                    if cont.count() > 0 and cont.first.is_visible():
                        cont.first.click(timeout=1500)
                        page.wait_for_timeout(1500)
                        page.screenshot(path=str(out_dir / "07_after_email_continue.png"), full_page=True)
                        evidence["artifacts"]["after_email_continue_screenshot"] = str(out_dir / "07_after_email_continue.png")
                except Exception:
                    pass

                page.screenshot(path=str(out_dir / "07_after_tarjetas.png"), full_page=True)

                frames_inv2 = []
                for i, fr in enumerate(page.frames):
                    item = {"index": i, "name": fr.name, "url": fr.url, "ok": False, "error": None, "inv": None}
                    try:
                        item["inv"] = fr.evaluate(inv_js)
                        item["ok"] = True
                    except Exception as e:
                        item["error"] = f"{type(e).__name__}: {e}"[:300]
                    frames_inv2.append(item)

                (out_dir / "07_after_tarjetas_dom_inventory.json").write_text(
                    json.dumps({"frames": frames_inv2}, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )

                clickables2 = page.evaluate(
                    r"""
(() => {
  const nodes = Array.from(document.querySelectorAll('button, [role="button"], a'));
  return nodes.map(el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const visible = !!(r.width && r.height) && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      type: el.getAttribute('type'),
      id: el.id || null,
      class: el.className || null,
      text: (el.innerText || '').trim().replace(/\s+/g,' ').slice(0,120),
      href: el.getAttribute('href'),
      visible,
    };
  });
})();
""",
                )
                (out_dir / "07_after_tarjetas_clickables.json").write_text(
                    json.dumps({"clickables": clickables2}, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )

                evidence["artifacts"]["after_tarjetas_screenshot"] = str(out_dir / "07_after_tarjetas.png")
                evidence["artifacts"]["after_tarjetas_dom_inventory"] = str(out_dir / "07_after_tarjetas_dom_inventory.json")
                evidence["artifacts"]["after_tarjetas_clickables"] = str(out_dir / "07_after_tarjetas_clickables.json")
            except Exception as e:
                evidence["tarjetas_click_error"] = f"{type(e).__name__}: {e}"[:300]

            pan = "4051885600446623"
            cvv = "123"
            exp = "12/30"
            rut = "11.111.111-1"
            pwd = "123"

            ok_pan = fill_any_frame(
                page,
                [
                    "input[name='card-number']",
                    "input#card-number",
                    "input[autocomplete='cc-number']",
                    "input[name*='card' i]",
                    "input[placeholder*='tarjeta' i]",
                    "input[placeholder*='card' i]",
                ],
                pan,
            )
            ok_cvv = fill_any_frame(
                page,
                [
                    "input[name='cvv']",
                    "input#cvv",
                    "input#card-cvv",
                    "input[autocomplete='cc-csc']",
                    "input[placeholder*='cvv' i]",
                    "input[placeholder*='cvc' i]",
                ],
                cvv,
            )
            ok_exp = fill_any_frame(
                page,
                [
                    "input[name='card-expiration']",
                    "input#card-expiration",
                    "input#card-exp",
                    "input[autocomplete='cc-exp']",
                    "input[placeholder*='venc' i]",
                    "input[placeholder*='MM' i]",
                ],
                exp,
            )
            ok_continue = click_any_frame(
                page,
                [
                    "button:has-text('Inscribir mi tarjeta')",
                    "button:has-text('Continuar')",
                    "button:has-text('Pagar')",
                    "button:has-text('Aceptar')",
                    "button:has-text('Siguiente')",
                    "input[type='submit']",
                ],
            )

            page.wait_for_timeout(2500)

            if not ok_cvv or not ok_exp:
                kb = type_card_by_keyboard(page, pan=pan, exp=exp, cvv=cvv)
                evidence["autofill_keyboard"] = kb
                page.wait_for_timeout(1500)
                try:
                    page.screenshot(path=str(out_dir / "08_after_keyboard.png"), full_page=True)
                    evidence["artifacts"]["after_keyboard_screenshot"] = str(out_dir / "08_after_keyboard.png")
                except Exception:
                    pass

            try:
                if page.locator("#accept-terms").count() > 0:
                    page.locator("#accept-terms").first.check(force=True)
                if page.locator("button:has-text('Aceptar y continuar')").count() > 0:
                    page.locator("button:has-text('Aceptar y continuar')").first.click(timeout=1500)
            except Exception:
                pass

            try:
                if page.locator("button:has-text('Inscribir mi tarjeta')").count() > 0:
                    page.locator("button:has-text('Inscribir mi tarjeta')").first.click(timeout=1500)
            except Exception:
                pass

            try:
                frames_inv3 = []
                for i, fr in enumerate(page.frames):
                    item = {"index": i, "name": fr.name, "url": fr.url, "ok": False, "error": None, "inv": None}
                    try:
                        item["inv"] = fr.evaluate(inv_js)
                        item["ok"] = True
                    except Exception as e:
                        item["error"] = f"{type(e).__name__}: {e}"[:300]
                    frames_inv3.append(item)

                (out_dir / "08_after_continue_dom_inventory.json").write_text(
                    json.dumps({"frames": frames_inv3}, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )

                clickables3 = page.evaluate(
                    r"""
(() => {
  const nodes = Array.from(document.querySelectorAll('button, [role="button"], a'));
  return nodes.map(el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const visible = !!(r.width && r.height) && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      type: el.getAttribute('type'),
      id: el.id || null,
      class: el.className || null,
      text: (el.innerText || '').trim().replace(/\s+/g,' ').slice(0,120),
      href: el.getAttribute('href'),
      visible,
    };
  });
})();
""",
                )
                (out_dir / "08_after_continue_clickables.json").write_text(
                    json.dumps({"clickables": clickables3}, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
                page.screenshot(path=str(out_dir / "08_after_continue.png"), full_page=True)

                evidence["artifacts"]["after_continue_dom_inventory"] = str(out_dir / "08_after_continue_dom_inventory.json")
                evidence["artifacts"]["after_continue_clickables"] = str(out_dir / "08_after_continue_clickables.json")
                evidence["artifacts"]["after_continue_screenshot"] = str(out_dir / "08_after_continue.png")
            except Exception as e:
                evidence["after_continue_capture_error"] = f"{type(e).__name__}: {e}"[:300]

            ok_rut = fill_any_frame(
                page,
                [
                    "input[name='rut']",
                    "input#rut",
                    "input[name='TBK_RUT']",
                    "input[placeholder*='RUT' i]",
                ],
                rut,
            )
            ok_pwd = fill_any_frame(page, ["input[name='password']", "input[type='password']", "input[placeholder*='clave' i]"], pwd)
            ok_login = click_any_frame(
                page,
                [
                    "button:has-text('Ingresar')",
                    "button:has-text('Continuar')",
                    "input[type='submit']",
                ],
            )

            evidence["autofill"] = {
                "pan": ok_pan,
                "cvv": ok_cvv,
                "exp": ok_exp,
                "continue": ok_continue,
                "rut": ok_rut,
                "pwd": ok_pwd,
                "login": ok_login,
            }

        deadline = time.time() + timeout_seconds
        tbk_user = None
        while time.time() < deadline:
            m = re.search(r"[?&]tbk_user=([^&]+)", page.url)
            if m:
                tbk_user = m.group(1)
                break
            time.sleep(0.5)

        if not tbk_user:
            for ev in reversed(evidence.get("framenavigated") or []):
                url = ev.get("url") if isinstance(ev, dict) else None
                if isinstance(url, str):
                    m = re.search(r"[?&]tbk_user=([^&]+)", url)
                    if m:
                        tbk_user = m.group(1)
                        break

        try:
            page.screenshot(path=str(out_dir / "03_after_return.png"), full_page=True)
        except Exception as e:
            evidence["after_return_screenshot_error"] = f"{type(e).__name__}: {e}"[:300]

        trace_path = out_dir / "trace.zip"
        context.tracing.stop(path=str(trace_path))
        context.close()

    evidence["tbk_user"] = tbk_user
    evidence["artifacts"]["webpay_open_screenshot"] = str(out_dir / "02_webpay_open.png")
    evidence["artifacts"]["after_return_screenshot"] = str(out_dir / "03_after_return.png")
    evidence["artifacts"]["trace_zip"] = str(out_dir / "trace.zip")

    vids = list((out_dir / "video").glob("**/*.webm"))
    evidence["artifacts"]["video"] = str(vids[0]) if vids else None

    (out_dir / "00_evidence.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")

    if tbk_user and run_authorize:
        authorize_request = {
            "username": username,
            "tbk_user": tbk_user,
            "buy_order": buy_order,
            "amount": authorize_amount,
        }
        (out_dir / "08_authorize_request.json").write_text(
            json.dumps(authorize_request, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        try:
            auth_resp = requests.post(
                f"{backend}/api/payments/oneclick/authorize",
                json=authorize_request,
                timeout=60,
            )
            auth_body = None
            try:
                auth_body = auth_resp.json()
            except Exception:
                auth_body = {"raw": auth_resp.text}

            authorize_result = {
                "http_status": auth_resp.status_code,
                "body": auth_body,
            }
        except Exception as e:
            authorize_result = {"error": f"{type(e).__name__}: {e}"[:300]}

        (out_dir / "09_authorize_response.json").write_text(
            json.dumps(authorize_result, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        evidence["authorize"] = {
            "request": str(out_dir / "08_authorize_request.json"),
            "response": str(out_dir / "09_authorize_response.json"),
        }
        (out_dir / "00_evidence.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")

    try:
        from pymongo import MongoClient

        mc = MongoClient("mongodb://127.0.0.1:27017", serverSelectionTimeoutMS=2000)
        db = mc[os.getenv("DB_NAME") or "maqgo_cert"]
        doc = db["payments_oneclick"].find_one({"buy_order": buy_order}, {"_id": 0})
        (out_dir / "04_mongo_payments_oneclick.json").write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
        evidence["artifacts"]["mongo_payments_oneclick"] = str(out_dir / "04_mongo_payments_oneclick.json")
        (out_dir / "00_evidence.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass

    print(json.dumps({"ok": True, "out_dir": str(out_dir), "buy_order": buy_order, "tbk_user": tbk_user}, ensure_ascii=False))


if __name__ == "__main__":
    main()
