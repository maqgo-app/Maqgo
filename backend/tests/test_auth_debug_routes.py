import os
import sys

from fastapi.testclient import TestClient


BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)


def test_debug_test_otp_requires_admin_auth():
    from server import app

    client = TestClient(app)

    res = client.post("/api/auth/debug/test-otp", json={"phone": "+56994336579"})

    assert res.status_code == 401, res.text
