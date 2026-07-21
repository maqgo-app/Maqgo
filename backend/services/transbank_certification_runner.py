from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import requests
from playwright.sync_api import Page, sync_playwright

from services.transbank_test_card_catalog import (
    pick_card_for_scenario,
    record_test_run,
    refresh_transbank_test_cards,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _mask_pan(pan: str) -> str:
    digits = re.sub(r"\D+", "", pan or "")
    if len(digits) < 10:
        return "****"
    return f"{digits[:6]}******{digits[-4:]}"


def _ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def _backend_url() -> str:
    return (os.getenv("MAQGO_BACKEND_URL") or os.getenv("BACKEND_URL") or "http://127.0.0.1:8000").rstrip("/")


def _frontend_url() -> str:
    return (os.getenv("FRONTEND_URL") or "http://localhost:5173").rstrip("/")


def _validation_headers() -> dict[str, str]:
    token = (os.getenv("ONECLICK_VALIDATION_TOKEN") or "").strip()
    if token:
        return {"x-oneclick-validation-token": token}
    return {}


@dataclass(frozen=True)
class CertCase:
    case_id: str
    operation: str
    scenario: str
    card_type: str
    expected: str
    amount: Optional[int] = None
    installments_number: Optional[int] = None
    notes: str = ""


def _fill_any(page: Page, selectors: list[str], value: str) -> bool:
    for s in selectors:
        try:
            loc = page.locator(s)
            if loc.count() > 0:
                loc.first.fill(value)
                return True
        except Exception:
            continue
    return False


def _click_any(page: Page, selectors: list[str]) -> bool:
    for s in selectors:
        try:
            loc = page.locator(s)
            if loc.count() > 0:
                loc.first.click()
                return True
        except Exception:
            continue
    return False


def _run_webpay_inscription(page: Page, card: dict[str, Any]) -> None:
    page.wait_for_load_state("domcontentloaded", timeout=60000)
    page.wait_for_timeout(1000)

    pan = str(card.get("pan") or "").strip()
    cvv = str(card.get("cvv") or "").strip()
    auth = card.get("auth") or {}
    rut = str(auth.get("rut") or "").strip()
    pwd = str(auth.get("password") or "").strip()

    if pan:
        _fill_any(
            page,
            [
                "input[name='card-number']",
                "input#card-number",
                "input[name*='card']",
                "input[placeholder*='tarjeta' i]",
                "input[placeholder*='card' i]",
                "input[inputmode='numeric']",
            ],
            pan,
        )

    if cvv:
        _fill_any(
            page,
            [
                "input[name='cvv']",
                "input#cvv",
                "input[placeholder*='cvv' i]",
                "input[placeholder*='cvc' i]",
            ],
            cvv,
        )

    _fill_any(
        page,
        [
            "input[name='card-expiration']",
            "input#card-expiration",
            "input[placeholder*='MM' i]",
            "input[placeholder*='YY' i]",
            "input[placeholder*='venc' i]",
        ],
        "12/30",
    )

    _click_any(
        page,
        [
            "button:has-text('Continuar')",
            "button:has-text('Pagar')",
            "button:has-text('Aceptar')",
            "button:has-text('Siguiente')",
            "input[type='submit']",
        ],
    )

    page.wait_for_timeout(2000)

    if rut and pwd:
        _fill_any(
            page,
            [
                "input[name='rut']",
                "input[placeholder*='RUT' i]",
                "input#rut",
            ],
            rut,
        )
        _fill_any(
            page,
            [
                "input[name='password']",
                "input[type='password']",
                "input[placeholder*='clave' i]",
            ],
            pwd,
        )
        _click_any(
            page,
            [
                "button:has-text('Ingresar')",
                "button:has-text('Continuar')",
                "input[type='submit']",
            ],
        )

    page.wait_for_timeout(2000)


def _start_oneclick_inscription(email: str, username: str, return_url: Optional[str] = None) -> dict[str, Any]:
    base = _backend_url()
    payload: dict[str, Any] = {"username": username, "email": email}
    if return_url:
        payload["return_url"] = return_url

    headers = {"Content-Type": "application/json", **_validation_headers()}
    r = requests.post(f"{base}/api/payments/oneclick/start", json=payload, headers=headers, timeout=60)
    r.raise_for_status()
    return r.json()


def _authorize_oneclick(username: str, tbk_user: str, buy_order: str, amount: int, installments_number: Optional[int]) -> dict[str, Any]:
    base = _backend_url()
    body: dict[str, Any] = {
        "username": username,
        "tbk_user": tbk_user,
        "buy_order": buy_order,
        "amount": int(amount),
    }
    if installments_number is not None:
        body["installments_number"] = int(installments_number)

    headers = {"Content-Type": "application/json", **_validation_headers()}
    r = requests.post(f"{base}/api/payments/oneclick/authorize", json=body, headers=headers, timeout=60)
    try:
        data = r.json()
    except Exception:
        data = {"raw": r.text}
    if not r.ok:
        return {"ok": False, "status_code": r.status_code, "response": data}
    return {"ok": True, "response": data}


def _extract_tbk_user_from_url(url: str) -> str:
    m = re.search(r"[?&]tbk_user=([^&]+)", url)
    return m.group(1) if m else ""


def run_case_oneclick_inscription(case: CertCase, email: str) -> dict[str, Any]:
    refresh_transbank_test_cards("integration")
    card = pick_card_for_scenario("integration", case.scenario, case.card_type)

    username = (email.split("@")[0] or "user").replace(".", "_")
    start = _start_oneclick_inscription(email=email, username=username, return_url=None)
    url_webpay = start.get("url_webpay")
    token = start.get("token")
    buy_order = start.get("buy_order")
    session_id = start.get("session_id")

    if not url_webpay or not token:
        obtained = "START_FAILED"
        run_id = record_test_run(
            {
                "environment": "integration",
                "scenario": case.scenario,
                "expected": case.expected,
                "obtained": obtained,
                "buy_order": buy_order,
                "token_tail": (token[-6:] if isinstance(token, str) else ""),
                "card": {
                    "brand": card.get("brand"),
                    "type": card.get("type"),
                    "pan_masked": card.get("pan_masked"),
                    "source": card.get("source"),
                    "last_verified_at": card.get("last_verified_at"),
                },
            }
        )
        return {
            "ok": False,
            "case_id": case.case_id,
            "operation": case.operation,
            "expected": case.expected,
            "obtained": obtained,
            "run_id": run_id,
        }

    html = (
        "<html><body>"
        f"<form id=\"f\" action=\"{url_webpay}\" method=\"POST\">"
        f"<input type=\"hidden\" name=\"TBK_TOKEN\" value=\"{token}\" />"
        "</form>"
        "<script>document.getElementById('f').submit();</script>"
        "</body></html>"
    )

    out_dir = Path("backend/qa-artifacts/transbank-cert")
    _ensure_dir(out_dir)
    shot_path = out_dir / f"{case.case_id}_oneclick_inscription.png"

    tbk_user = ""
    obtained = "UNKNOWN"
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1280, "height": 900})
        page.set_content(html, wait_until="domcontentloaded")
        page.wait_for_timeout(1500)
        _run_webpay_inscription(page, card)

        for _ in range(60):
            url = page.url
            if "tbk_user=" in url:
                tbk_user = _extract_tbk_user_from_url(url)
                break
            if url.startswith(_frontend_url()):
                tbk_user = _extract_tbk_user_from_url(url)
                if tbk_user:
                    break
            page.wait_for_timeout(500)

        page.screenshot(path=str(shot_path), full_page=True)
        browser.close()

    if case.expected.upper() == "APPROVED":
        obtained = "APPROVED" if tbk_user else "FAILED"
    elif case.expected.upper() == "REJECTED":
        obtained = "REJECTED" if not tbk_user else "UNEXPECTED_APPROVED"

    run_id = record_test_run(
        {
            "environment": "integration",
            "scenario": case.scenario,
            "expected": case.expected,
            "obtained": obtained,
            "buy_order": buy_order,
            "token_tail": (token[-6:] if isinstance(token, str) else ""),
            "card": {
                "brand": card.get("brand"),
                "type": card.get("type"),
                "pan_masked": card.get("pan_masked"),
                "source": card.get("source"),
                "last_verified_at": card.get("last_verified_at"),
            },
            "evidence": {
                "screenshot": str(shot_path),
            },
            "ids": {
                "tbk_user": tbk_user,
                "buy_order": buy_order,
                "session_id": session_id,
            },
        }
    )

    report = {
        "ok": True,
        "case_id": case.case_id,
        "operation": case.operation,
        "expected": case.expected,
        "obtained": obtained,
        "tbk_user": tbk_user,
        "buy_order": buy_order,
        "session_id": session_id,
        "token": token,
        "card": {"pan_masked": card.get("pan_masked"), "brand": card.get("brand"), "type": card.get("type")},
        "run_id": run_id,
    }
    (out_dir / f"{case.case_id}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def run_case_oneclick_authorize_reject_by_amount(case: CertCase, email: str, amount: int = 10_000_000) -> dict[str, Any]:
    insc_case = CertCase(
        case_id=f"{case.case_id}_pre_inscription",
        operation="inscription",
        scenario="inscription_approved",
        card_type="CREDIT",
        expected="APPROVED",
    )
    insc = run_case_oneclick_inscription(insc_case, email)
    tbk_user = insc.get("tbk_user") or ""
    username = (email.split("@")[0] or "user").replace(".", "_")
    buy_order = insc.get("buy_order") or ""

    auth = _authorize_oneclick(username=username, tbk_user=tbk_user, buy_order=buy_order, amount=amount, installments_number=case.installments_number)
    obtained = "REJECTED" if not auth.get("ok") else "APPROVED"

    out_dir = Path("backend/qa-artifacts/transbank-cert")
    _ensure_dir(out_dir)
    report = {
        "ok": True,
        "case_id": case.case_id,
        "operation": case.operation,
        "expected": case.expected,
        "obtained": obtained,
        "buy_order": buy_order,
        "tbk_user": tbk_user,
        "amount": amount,
        "authorize": auth,
    }
    (out_dir / f"{case.case_id}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    record_test_run(
        {
            "environment": "integration",
            "scenario": case.scenario,
            "expected": case.expected,
            "obtained": obtained,
            "buy_order": buy_order,
            "ids": {"tbk_user": tbk_user},
            "authorize": auth,
        }
    )
    return report

