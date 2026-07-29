import asyncio
import pathlib
import sys
from types import SimpleNamespace

from starlette.requests import Request
from fastapi import HTTPException

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


class _FakeUsersCollection:
    def __init__(self, user):
        self.user = user

    async def find_one(self, query, projection=None):
        identifier = query.get("email")
        if identifier and self.user.get("email") == identifier:
            return dict(self.user)
        return None

    async def update_one(self, query, update):
        return None


class _FakeSessionsCollection:
    async def insert_one(self, doc):
        return SimpleNamespace(inserted_id="sess_1")


class _FakeDb:
    def __init__(self, user):
        self.users = _FakeUsersCollection(user)
        self.sessions = _FakeSessionsCollection()


def _request():
    return Request({"type": "http", "path": "/api/auth/login", "headers": []})


def test_password_login_is_rejected_for_non_admin(monkeypatch):
    import routes.auth as auth

    provider_user = {
        "id": "prov_1",
        "email": "proveedor@maqgo.cl",
        "password": auth.hash_password("abc12345"),
        "roles": ["provider"],
        "role": "provider",
        "status": "active",
    }
    monkeypatch.setattr(auth, "db", _FakeDb(provider_user))

    async def _run():
        try:
            await auth.login(
                _request(),
                auth.LoginRequest(identifier="proveedor@maqgo.cl", password="abc12345"),
            )
        except HTTPException as exc:
            return exc
        raise AssertionError("Se esperaba HTTPException")

    exc = asyncio.run(_run())
    assert exc.status_code == 403
    assert exc.detail == "Acceso reservado a administradores"
