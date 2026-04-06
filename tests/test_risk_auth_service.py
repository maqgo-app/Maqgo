"""Tests unitarios — política de riesgo de login (sin I/O)."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from services.risk_auth_service import is_risky_login, normalize_device_id


def test_normalize_device_id_accepts_uuid():
    u = "550e8400-e29b-41d4-a716-446655440000"
    assert normalize_device_id(u) == u


def test_normalize_device_id_rejects_short():
    assert normalize_device_id("abc") == ""


def test_is_risky_no_device_invalid():
    assert (
        is_risky_login(
            trusted_row={"is_active": True, "last_country": "CL"},
            device_id_valid=False,
            current_country="CL",
            too_many_failed=False,
        )
        is True
    )


def test_is_risky_no_trusted_row():
    assert (
        is_risky_login(
            trusted_row=None,
            device_id_valid=True,
            current_country="CL",
            too_many_failed=False,
        )
        is True
    )


def test_is_risky_country_mismatch():
    row = {"is_active": True, "last_country": "CL"}
    assert (
        is_risky_login(
            trusted_row=row,
            device_id_valid=True,
            current_country="AR",
            too_many_failed=False,
        )
        is True
    )


def test_is_risky_same_country_ok():
    row = {"is_active": True, "last_country": "CL", "user_agent": ""}
    assert (
        is_risky_login(
            trusted_row=row,
            device_id_valid=True,
            current_country="CL",
            too_many_failed=False,
            current_user_agent="",
        )
        is False
    )


def test_is_risky_too_many_failures():
    row = {"is_active": True, "last_country": "CL"}
    assert (
        is_risky_login(
            trusted_row=row,
            device_id_valid=True,
            current_country="CL",
            too_many_failed=True,
        )
        is True
    )


def test_is_risky_user_agent_mismatch_ignored_when_trusted():
    """Mismo país y device_id válido: UA distinto no fuerza OTP."""
    row = {
        "is_active": True,
        "last_country": "CL",
        "user_agent": "Mozilla/5.0 (iPhone)",
    }
    assert (
        is_risky_login(
            trusted_row=row,
            device_id_valid=True,
            current_country="CL",
            too_many_failed=False,
            current_user_agent="Mozilla/5.0 (Windows)",
        )
        is False
    )


def test_is_risky_empty_current_country_not_penalized():
    """CF ausente en el request no fuerza OTP si el país guardado existe."""
    row = {"is_active": True, "last_country": "CL", "user_agent": ""}
    assert (
        is_risky_login(
            trusted_row=row,
            device_id_valid=True,
            current_country="",
            too_many_failed=False,
            current_user_agent="",
        )
        is False
    )
