from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from routes.auth import get_current_admin_strict
from services.transbank_test_card_catalog import (
    get_catalog_status,
    pick_card_for_scenario,
    record_test_run,
    refresh_transbank_test_cards,
)


limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/admin/transbank", tags=["admin_transbank"])


@router.get("/test-cards/status")
@limiter.limit("60/minute")
async def admin_transbank_test_cards_status(
    request: Request,
    environment: str = Query(default="integration"),
    _: dict = Depends(get_current_admin_strict),
):
    return get_catalog_status(environment)


@router.post("/test-cards/refresh")
@limiter.limit("10/minute")
async def admin_transbank_test_cards_refresh(
    request: Request,
    environment: str = Query(default="integration"),
    _: dict = Depends(get_current_admin_strict),
):
    try:
        return refresh_transbank_test_cards(environment)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/test-cards/pick")
@limiter.limit("60/minute")
async def admin_transbank_test_cards_pick(
    request: Request,
    scenario: str = Query(...),
    environment: str = Query(default="integration"),
    card_type: Optional[str] = Query(default=None),
    _: dict = Depends(get_current_admin_strict),
):
    try:
        card = pick_card_for_scenario(environment, scenario, card_type)
        return {
            "ok": True,
            "environment": environment,
            "scenario": scenario,
            "card": {
                "brand": card.get("brand"),
                "type": card.get("type"),
                "pan_masked": card.get("pan_masked"),
                "cvv": card.get("cvv"),
                "expiry": card.get("expiry"),
                "auth": card.get("auth"),
                "expected": card.get("expected"),
                "source": card.get("source"),
                "last_verified_at": card.get("last_verified_at"),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/test-runs")
@limiter.limit("60/minute")
async def admin_transbank_record_test_run(
    request: Request,
    scenario: str = Query(...),
    expected: str = Query(default=""),
    obtained: str = Query(default=""),
    environment: str = Query(default="integration"),
    buy_order: str = Query(default=""),
    token: str = Query(default=""),
    _: dict = Depends(get_current_admin_strict),
):
    try:
        refresh_transbank_test_cards(environment)
    except Exception:
        pass
    try:
        card = pick_card_for_scenario(environment, scenario, None)
    except Exception:
        card = None

    run_id = record_test_run(
        {
            "environment": environment,
            "scenario": scenario,
            "expected": expected,
            "obtained": obtained,
            "buy_order": buy_order,
            "token_tail": (token[-6:] if token else ""),
            "card": (
                {
                    "brand": card.get("brand"),
                    "type": card.get("type"),
                    "pan_masked": card.get("pan_masked"),
                    "source": card.get("source"),
                    "last_verified_at": card.get("last_verified_at"),
                }
                if card
                else None
            ),
        }
    )
    return {"ok": True, "run_id": run_id}
