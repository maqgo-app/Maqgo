import asyncio
import os
import sys

import pytest
from fastapi import HTTPException


BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from routes import auth


class _FakeCollection:
    def __init__(self, *, docs=None):
        self.docs = list(docs or [])
        self.inserted = []
        self.updated = []

    async def find_one(self, query, projection=None):
        for doc in self.docs:
            if all(doc.get(key) == value for key, value in (query or {}).items()):
                return _project_doc(doc, projection)
        return None

    async def update_one(self, query, update, upsert=False):
        self.updated.append({"query": query, "update": update, "upsert": upsert})
        for doc in self.docs:
            if all(doc.get(key) == value for key, value in (query or {}).items()):
                if "$set" in update:
                    doc.update(update["$set"])
                return _FakeWriteResult(matched_count=1)
        if upsert:
            new_doc = dict(query or {})
            if "$set" in update:
                new_doc.update(update["$set"])
            self.docs.append(new_doc)
            return _FakeWriteResult(matched_count=1)
        return _FakeWriteResult(matched_count=0)

    async def insert_one(self, doc):
        self.inserted.append(doc)
        self.docs.append(doc)
        return _FakeWriteResult(matched_count=1)


class _FakeWriteResult:
    def __init__(self, matched_count=0):
        self.matched_count = matched_count


class _FakeDB:
    def __init__(self, *, invitations, users):
        self.invitations = _FakeCollection(docs=invitations)
        self.users = _FakeCollection(docs=users)
        self.sessions = _FakeCollection()


def _project_doc(doc, projection):
    if not projection:
        return dict(doc)
    include = {key for key, value in projection.items() if value}
    if not include:
        return dict(doc)
    return {key: doc.get(key) for key in include if key != "_id"}


async def _async_noop(*args, **kwargs):
    return None


def test_resolve_activation_login_user_and_phone_requires_registered_phone(monkeypatch):
    fake_db = _FakeDB(
        invitations=[
            {
                "code": "ABC123",
                "status": "used",
                "used_by": "op-1",
                "invite_type": "operator",
                "operator_phone": "",
            }
        ],
        users=[
            {
                "id": "op-1",
                "role": "provider",
                "roles": ["provider"],
                "provider_role": "operator",
                "phone": "",
            }
        ],
    )
    monkeypatch.setattr(auth, "db", fake_db)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth._resolve_activation_login_user_and_phone("ABC123"))

    assert exc.value.status_code == 400
    assert exc.value.detail == "Tu empresa debe registrar un celular válido antes de activar tu cuenta."


def test_login_sms_start_allows_enrollment_token_without_celular(monkeypatch):
    fake_db = _FakeDB(
        invitations=[
            {
                "code": "ABC123",
                "status": "used",
                "used_by": "op-1",
                "invite_type": "operator",
                "operator_phone": "912345678",
            }
        ],
        users=[
            {
                "id": "op-1",
                "role": "provider",
                "roles": ["provider"],
                "provider_role": "operator",
                "owner_id": "owner-1",
                "phone": "",
                "status": "active",
            }
        ],
    )
    sent = {}

    def fake_send_sms_otp(phone, channel="sms"):
        sent["phone"] = phone
        sent["channel"] = channel
        return {"success": True, "reused": False, "ttl_seconds": 300}

    monkeypatch.setattr(auth, "db", fake_db)
    monkeypatch.setattr(auth, "send_sms_otp", fake_send_sms_otp)
    monkeypatch.setattr(auth, "ensure_trusted_device_indexes", _async_noop)
    monkeypatch.setattr(auth, "find_active_phone_block", _async_noop)
    monkeypatch.setattr(auth, "is_hard_locked", lambda phone: False)
    monkeypatch.setattr(auth, "get_client_ip", lambda request: "127.0.0.1")
    monkeypatch.setattr(auth, "get_client_country", lambda request: "CL")
    monkeypatch.setattr(auth, "get_client_user_agent", lambda request: "pytest")

    response = asyncio.run(
        auth.login_sms_start.__wrapped__(
            object(),
            auth.LoginSmsStartRequest(
                enrollment_token="abc123",
                requested_role="provider",
            ),
        )
    )

    assert sent == {"phone": "+56912345678", "channel": "sms"}
    assert response["success"] is True
    assert response["phone"] == "+56912345678"
    assert response["requires_otp"] is True
    assert response["channel"] == "sms"
    assert response["userId"] == "op-1"


def test_login_sms_verify_with_enrollment_token_persists_phone_and_creates_session(monkeypatch):
    fake_db = _FakeDB(
        invitations=[
            {
                "code": "ABC123",
                "status": "used",
                "used_by": "op-1",
                "invite_type": "operator",
                "operator_phone": "912345678",
            }
        ],
        users=[
            {
                "id": "op-1",
                "name": "Operador Uno",
                "role": "provider",
                "roles": ["provider"],
                "provider_role": "operator",
                "owner_id": "owner-1",
                "phone": "",
                "phoneVerified": False,
                "status": "active",
            }
        ],
    )

    monkeypatch.setattr(auth, "db", fake_db)
    monkeypatch.setattr(auth, "verify_sms_otp", lambda phone, code: {"success": True, "valid": True})
    monkeypatch.setattr(auth, "find_active_phone_block", _async_noop)
    monkeypatch.setattr(auth, "is_hard_locked", lambda phone: False)
    monkeypatch.setattr(auth, "get_client_ip", lambda request: "127.0.0.1")
    monkeypatch.setattr(auth, "get_client_country", lambda request: "CL")
    monkeypatch.setattr(auth, "get_client_user_agent", lambda request: "pytest")
    monkeypatch.setattr(auth, "clear_hard_lockout", lambda phone: None)
    monkeypatch.setattr(auth, "generate_token", lambda: "token-123")

    response = asyncio.run(
        auth.login_sms_verify.__wrapped__(
            object(),
            auth.LoginSmsVerifyRequest(
                enrollment_token="ABC123",
                code="123456",
                requested_role="provider",
            ),
        )
    )

    assert fake_db.users.updated == [
        {
            "query": {"id": "op-1"},
            "update": {
                "$set": {
                    "phone": "+56912345678",
                    "phoneVerified": True,
                    "status": "active",
                    "activationStage": "enrollment_completed",
                    "activatedAt": fake_db.users.updated[0]["update"]["$set"]["activatedAt"],
                    "deleted": False,
                },
                "$unset": {
                    "deletedAt": "",
                    "deletedBy": "",
                    "deleteReason": "",
                },
            },
            "upsert": False,
        }
    ]
    assert fake_db.sessions.inserted == [
        {
            "userId": "op-1",
            "token": "token-123",
            "activeRole": "provider",
            "createdAt": fake_db.sessions.inserted[0]["createdAt"],
        }
    ]
    assert response["token"] == "token-123"
    assert response["id"] == "op-1"
    assert response["role"] == "provider"
    assert response["provider_role"] == "operator"
    assert response["owner_id"] == "owner-1"
    assert response["phone"] == "+56912345678"
