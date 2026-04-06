"""Normalización login SMS: ^\\+569\\d{8}$"""
import os
import sys

BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

import pytest

from routes.auth import _normalize_login_celular_e164


def test_valid_9_digits():
    assert _normalize_login_celular_e164("912345678") == "+56912345678"


def test_valid_plus56():
    assert _normalize_login_celular_e164("+56912345678") == "+56912345678"


def test_valid_pasted_with_spaces():
    assert _normalize_login_celular_e164("+56 9 1234 5678") == "+56912345678"


def test_invalid_starts_8():
    with pytest.raises(ValueError):
        _normalize_login_celular_e164("812345678")


def test_invalid_short():
    with pytest.raises(ValueError):
        _normalize_login_celular_e164("91234")


def test_invalid_letters():
    with pytest.raises(ValueError):
        _normalize_login_celular_e164("91234abcd")
