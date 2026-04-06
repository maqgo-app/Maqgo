"""Tests unitarios — risk_engine sin dependencias FastAPI."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from services.risk_engine import get_device_class, is_risky_login  # noqa: E402


def test_get_device_class():
    assert get_device_class("") == "unknown"
    assert get_device_class("Mozilla/5.0 (Windows NT 10.0) Chrome/120") == "desktop"
    assert get_device_class("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)") == "mobile"
    assert get_device_class("Mozilla/5.0 (Linux; Android 14)") == "mobile"
    assert get_device_class("Mozilla/5.0 (compatible; MSIE 10.0; Opera Mobi)") == "mobile"


def test_chrome_update_same_class_not_risky():
    ua_a = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.6099.109 Safari/537.36"
    )
    ua_b = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    )
    row = {"is_active": True, "last_country": "CL", "user_agent": ua_a}
    assert (
        is_risky_login(
            stored_device=row,
            current_ip="",
            current_country="CL",
            user_agent=ua_b,
        )
        is False
    )


def test_mobile_vs_desktop_ua_not_risky_when_country_matches():
    """Confianza por device_id: no step-up solo por UA distinto."""
    row = {"is_active": True, "last_country": "CL", "user_agent": "Mozilla/5.0 (iPhone)"}
    assert (
        is_risky_login(
            stored_device=row,
            current_ip="",
            current_country="CL",
            user_agent="Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0",
        )
        is False
    )


def test_desktop_vs_mobile_ua_not_risky_when_country_matches():
    row = {
        "is_active": True,
        "last_country": "CL",
        "user_agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0",
    }
    assert (
        is_risky_login(
            stored_device=row,
            current_ip="",
            current_country="CL",
            user_agent="Mozilla/5.0 (Linux; Android 14) Chrome/120",
        )
        is False
    )


def test_both_unknown_ua_not_risky_when_country_ok():
    row = {"is_active": True, "last_country": "CL", "user_agent": ""}
    assert (
        is_risky_login(
            stored_device=row,
            current_ip="",
            current_country="CL",
            user_agent="",
        )
        is False
    )
