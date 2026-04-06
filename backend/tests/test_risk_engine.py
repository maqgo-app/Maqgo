"""Regresión: trusted device no debe pedir OTP por CF ausente o cambio de UA."""
import os
import sys

BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from services.risk_engine import is_risky_login


def _row(**kwargs):
    base = {
        "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
        "last_country": "CL",
        "is_active": True,
    }
    base.update(kwargs)
    return base


def test_no_stored_device_is_risky():
    assert is_risky_login(None, "", "CL", "Mozilla/5.0") is True


def test_country_only_risky_when_both_set_and_differ():
    iphone_ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"
    assert is_risky_login(_row(last_country="CL"), "", "", iphone_ua) is False
    assert is_risky_login(_row(last_country="CL"), "", "CL", iphone_ua) is False
    assert is_risky_login(_row(last_country="CL"), "", "AR", iphone_ua) is True


def test_empty_stored_ua_not_risky_vs_full_current():
    assert (
        is_risky_login(
            _row(user_agent=""),
            "",
            "CL",
            "Mozilla/5.0 (Linux; Android 14) Mobile Safari",
        )
        is False
    )


def test_one_sided_empty_ua_never_forces_risk():
    assert (
        is_risky_login(
            _row(user_agent=""),
            "",
            "CL",
            "Mozilla/5.0 (Linux; Android 14)",
        )
        is False
    )


def test_mobile_to_desktop_ua_not_risky_when_trusted_row_same_country():
    """Mismo device_id en DB: no OTP solo por cambiar clase móvil/desktop (logout/re-login)."""
    assert (
        is_risky_login(
            _row(user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"),
            "",
            "CL",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0",
        )
        is False
    )
