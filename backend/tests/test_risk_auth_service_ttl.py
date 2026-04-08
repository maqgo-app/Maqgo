import os
import sys
from datetime import datetime, timedelta, timezone

BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from services.risk_auth_service import is_trusted_device_expired


def test_trusted_device_without_trusted_until_is_expired():
    # Legacy row: forcing OTP revalidation is expected.
    row = {"is_active": True, "last_country": "CL"}
    assert is_trusted_device_expired(row) is True


def test_trusted_device_future_trusted_until_is_not_expired():
    future = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
    row = {"is_active": True, "trusted_until": future}
    assert is_trusted_device_expired(row) is False


def test_trusted_device_past_trusted_until_is_expired():
    past = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    row = {"is_active": True, "trusted_until": past}
    assert is_trusted_device_expired(row) is True
