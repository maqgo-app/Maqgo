"""is_otp_configured debe alinearse con LABSMOBILE_SENDER (default MAQGO)."""
import importlib
import os
import sys

BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)


def test_is_otp_configured_true_when_sender_env_omitted(monkeypatch):
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setenv("LABSMOBILE_USERNAME", "user")
    monkeypatch.setenv("LABSMOBILE_API_TOKEN", "token")
    monkeypatch.delenv("LABSMOBILE_SENDER", raising=False)

    import services.otp_service as otp_service

    importlib.reload(otp_service)
    try:
        assert otp_service.is_otp_configured() is True
    finally:
        importlib.reload(otp_service)
