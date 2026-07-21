from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from typing import Any, Optional

import requests

from db_config import db


CATALOG_META_COLLECTION = "transbank_test_cards_meta"
CATALOG_CARDS_COLLECTION = "transbank_test_cards"
CATALOG_CHANGES_COLLECTION = "transbank_test_cards_changes"
CATALOG_RUNS_COLLECTION = "transbank_test_runs"


TRANSBANK_OFFICIAL_SOURCES = {
    "integration_webpay_cards": "https://www.transbankdevelopers.cl/documentacion/como_empezar",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _mask_pan(pan: str) -> str:
    digits = re.sub(r"\D+", "", pan or "")
    if len(digits) < 8:
        return "****"
    return f"{digits[:6]}******{digits[-4:]}"


def _normalize_brand(label: str) -> str:
    s = (label or "").strip().upper()
    if "MASTER" in s:
        return "MASTERCARD"
    if "AMEX" in s:
        return "AMEX"
    if "VISA" in s:
        return "VISA"
    if "REDCOMPRA" in s:
        return "REDCOMPRA"
    return s or "UNKNOWN"


def _infer_card_type(brand: str, ctx: str) -> str:
    c = (ctx or "").lower()
    if "prepago" in c or "pre-pago" in c or "pre pago" in c:
        return "PREPAID"
    if "redcompra" in c or brand == "REDCOMPRA":
        return "DEBIT"
    return "CREDIT"


def _infer_expected_result(ctx: str) -> str:
    c = (ctx or "").lower()
    if "rechaz" in c:
        return "REJECTED"
    if "aprob" in c:
        return "APPROVED"
    return "UNKNOWN"


def _classify_scenarios(card_type: str, expected: str) -> list[str]:
    scenarios: list[str] = []
    if card_type == "CREDIT" and expected == "APPROVED":
        scenarios += ["inscription_approved", "payment_approved"]
    if card_type == "CREDIT" and expected == "REJECTED":
        scenarios += ["inscription_rejected", "payment_rejected"]
    if card_type == "DEBIT" and expected == "APPROVED":
        scenarios += ["payment_approved_debit"]
    if card_type == "DEBIT" and expected == "REJECTED":
        scenarios += ["payment_rejected_debit"]
    if card_type == "PREPAID" and expected == "APPROVED":
        scenarios += ["payment_approved_prepaid"]
    if card_type == "PREPAID" and expected == "REJECTED":
        scenarios += ["payment_rejected_prepaid"]

    scenarios += [
        "reject_by_max_amount",
    ]
    return sorted(set(scenarios))


def _parse_cards_from_como_empezar(html: str) -> list[dict[str, Any]]:
    text = re.sub(r"\s+", " ", html)
    entries: list[dict[str, Any]] = []

    block_re = re.compile(
        r"(?P<label>(?:Prepago\s+)?VISA|(?:Prepago\s+)?MASTERCARD|AMEX|Redcompra)"
        r"\s+(?P<number>(?:\d\s*){13,19})"
        r"(?:\s+CVV\s+(?P<cvv>\d{3,4}))?"
        r"(?P<tail>.{0,220}?)"
        r"(?=(?:Prepago\s+)?VISA|(?:Prepago\s+)?MASTERCARD|AMEX|Redcompra|$)",
        flags=re.IGNORECASE,
    )

    for m in block_re.finditer(text):
        label = (m.group("label") or "").strip()
        raw_number = (m.group("number") or "").strip()
        cvv = (m.group("cvv") or "").strip() or None
        tail = (m.group("tail") or "").strip()

        brand = _normalize_brand(label)
        number = re.sub(r"\D+", "", raw_number)
        if len(number) < 12:
            continue

        card_type = _infer_card_type(brand, label)
        expected = _infer_expected_result(tail)
        scenarios = _classify_scenarios(card_type, expected)

        entries.append(
            {
                "brand": brand,
                "pan": number,
                "type": card_type,
                "cvv": cvv,
                "expiry": None,
                "auth": {"rut": "11.111.111-1", "password": "123"},
                "expected": expected,
                "scenarios": scenarios,
            }
        )

    return entries


def refresh_transbank_test_cards(environment: str = "integration") -> dict[str, Any]:
    env = (environment or "integration").strip().lower()
    if env != "integration":
        raise ValueError("Only integration catalog is supported")

    source_url = TRANSBANK_OFFICIAL_SOURCES["integration_webpay_cards"]
    r = requests.get(source_url, timeout=30)
    r.raise_for_status()

    html = r.text
    source_sha = _sha256(html)
    now = _now()

    meta_id = f"webpay_cards:{env}"
    prev = db[CATALOG_META_COLLECTION].find_one({"_id": meta_id})
    prev_sha = (prev or {}).get("source_sha256")
    changed = prev_sha != source_sha

    cards = _parse_cards_from_como_empezar(html)
    if not cards:
        raise ValueError("No cards parsed from official source")

    for c in cards:
        pan = c["pan"]
        card_id = _sha256(f"{env}:{pan}")
        doc = {
            "_id": card_id,
            "environment": env,
            "brand": c["brand"],
            "pan": pan,
            "type": c["type"],
            "cvv": c.get("cvv"),
            "expiry": c.get("expiry"),
            "auth": c.get("auth"),
            "expected": c.get("expected"),
            "scenarios": c.get("scenarios", []),
            "source": {"url": source_url, "sha256": source_sha},
            "last_verified_at": now,
            "active": True,
        }
        db[CATALOG_CARDS_COLLECTION].update_one({"_id": card_id}, {"$set": doc}, upsert=True)

    db[CATALOG_META_COLLECTION].update_one(
        {"_id": meta_id},
        {
            "$set": {
                "_id": meta_id,
                "environment": env,
                "source_url": source_url,
                "source_sha256": source_sha,
                "last_checked_at": now,
                "cards_count": len(cards),
            }
        },
        upsert=True,
    )

    if changed:
        db[CATALOG_CHANGES_COLLECTION].insert_one(
            {
                "environment": env,
                "source_url": source_url,
                "from_sha256": prev_sha,
                "to_sha256": source_sha,
                "changed_at": now,
                "cards_count": len(cards),
            }
        )

    return {
        "ok": True,
        "environment": env,
        "source_url": source_url,
        "changed": bool(changed),
        "cards_count": len(cards),
        "last_checked_at": now,
    }


def get_catalog_status(environment: str = "integration") -> dict[str, Any]:
    env = (environment or "integration").strip().lower()
    meta_id = f"webpay_cards:{env}"
    meta = db[CATALOG_META_COLLECTION].find_one({"_id": meta_id}, {"_id": 0})
    return {"ok": True, "environment": env, "meta": meta}


def pick_card_for_scenario(environment: str, scenario: str, card_type: Optional[str] = None) -> dict[str, Any]:
    env = (environment or "integration").strip().lower()
    scen = (scenario or "").strip()
    if not scen:
        raise ValueError("scenario required")

    q: dict[str, Any] = {"environment": env, "active": True, "scenarios": scen}
    if card_type:
        q["type"] = (card_type or "").strip().upper()

    doc = db[CATALOG_CARDS_COLLECTION].find_one(q)
    if not doc:
        raise ValueError("no card for scenario")

    return {
        "brand": doc.get("brand"),
        "type": doc.get("type"),
        "pan": doc.get("pan"),
        "pan_masked": _mask_pan(doc.get("pan", "")),
        "cvv": doc.get("cvv"),
        "expiry": doc.get("expiry"),
        "auth": doc.get("auth"),
        "expected": doc.get("expected"),
        "scenarios": doc.get("scenarios", []),
        "source": doc.get("source"),
        "last_verified_at": doc.get("last_verified_at"),
    }


def record_test_run(payload: dict[str, Any]) -> str:
    run = dict(payload)
    run["created_at"] = _now()
    res = db[CATALOG_RUNS_COLLECTION].insert_one(run)
    return str(res.inserted_id)

