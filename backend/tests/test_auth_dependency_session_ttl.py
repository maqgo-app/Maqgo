import os
import sys
from datetime import datetime, timedelta, timezone

BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from auth_dependency import _session_expiry_from_created


def test_session_expiry_from_created_valid_iso():
    now = datetime.now(timezone.utc)
    created = now.isoformat()
    expiry = _session_expiry_from_created(created)
    assert expiry is not None
    assert expiry > now


def test_session_expiry_from_created_invalid_returns_none():
    assert _session_expiry_from_created("not-an-iso") is None
    assert _session_expiry_from_created(None) is None


def test_session_expiry_respects_env_ttl(monkeypatch):
    monkeypatch.setenv("MAQGO_SESSION_TTL_SECONDS", "600")
    created = datetime.now(timezone.utc).isoformat()
    expiry = _session_expiry_from_created(created)
    assert expiry is not None
    delta = expiry - datetime.fromisoformat(created)
    assert timedelta(minutes=9) <= delta <= timedelta(minutes=11)


def test_session_expiry_env_ttl_has_min_floor(monkeypatch):
    monkeypatch.setenv("MAQGO_SESSION_TTL_SECONDS", "10")
    created_dt = datetime.now(timezone.utc)
    created = created_dt.isoformat()
    expiry = _session_expiry_from_created(created)
    assert expiry is not None
    delta = expiry - created_dt
    assert timedelta(minutes=4, seconds=50) <= delta <= timedelta(minutes=5, seconds=10)
