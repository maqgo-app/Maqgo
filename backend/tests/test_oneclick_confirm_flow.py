import asyncio
import pathlib
import sys
from types import SimpleNamespace

from fastapi import HTTPException
from starlette.requests import Request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


class _FakeCollection:
    def __init__(self, docs=None):
        self.docs = [dict(doc) for doc in (docs or [])]

    async def find_one(self, query=None, projection=None):
        query = query or {}
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in query.items()):
                if projection is None:
                    return dict(doc)
                if any(bool(v) for v in projection.values()):
                    out = {}
                    for key, include in projection.items():
                        if include and key in doc:
                            out[key] = doc[key]
                    return out
                out = dict(doc)
                for key, include in projection.items():
                    if include == 0:
                        out.pop(key, None)
                return out
        return None

    async def update_one(self, query, update, upsert=False):
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in query.items()):
                if "$set" in update:
                    doc.update(update["$set"])
                return
        if upsert:
            new_doc = dict(query)
            new_doc.update(update.get("$set", {}))
            self.docs.append(new_doc)

    async def insert_one(self, doc):
        self.docs.append(dict(doc))
        return SimpleNamespace(inserted_id=doc.get("id"))


class _FakeDb:
    def __init__(self, payments=None, inscriptions=None):
        self.payments_oneclick = _FakeCollection(payments)
        self.oneclick_inscriptions = _FakeCollection(inscriptions)
        self.oneclick_validation_events = _FakeCollection()

    def __getitem__(self, name):
        return getattr(self, name)


def _request(path, query=""):
    return Request(
        {
            "type": "http",
            "path": path,
            "query_string": query.encode("utf-8"),
            "headers": [],
        }
    )


def test_confirm_return_idempotent_redirects_without_reconfirm(monkeypatch):
    import routes.oneclick as oneclick

    monkeypatch.setenv("FRONTEND_URL", "https://app.maqgo.cl")
    fake_db = _FakeDb(
        payments=[
            {
                "token": "tok123",
                "status": "INSCRIBED",
                "tbk_user": "tbk-123",
                "buy_order": "BUY123",
            }
        ]
    )
    monkeypatch.setattr(oneclick, "db", fake_db)

    def fail_confirm(_token):
        raise AssertionError("No debería reconfirmar en Transbank")

    monkeypatch.setattr(oneclick, "tbk_confirm_inscription", fail_confirm)

    async def _run():
        return await oneclick.confirm_return(_request("/api/payments/oneclick/confirm-return", "TBK_TOKEN=tok123"))

    response = asyncio.run(_run())
    assert response.status_code == 302
    assert response.headers["location"] == "https://app.maqgo.cl/oneclick/complete?tbk_user=tbk-123"


def test_confirm_marks_failed_when_tbk_user_missing(monkeypatch):
    import routes.oneclick as oneclick

    fake_db = _FakeDb(
        payments=[
            {
                "token": "tok_fail",
                "status": "STARTED",
                "buy_order": "BUYFAIL",
                "user_id": "user_1",
                "email": "fail@maqgo.cl",
                "username": "maqgo-fail",
            }
        ]
    )
    monkeypatch.setattr(oneclick, "db", fake_db)
    monkeypatch.setattr(oneclick, "tbk_confirm_inscription", lambda token: {"response_code": 0, "tbk_user": ""})

    async def fake_evidence(*args, **kwargs):
        return None

    async def fake_validation_event(**kwargs):
        return None

    monkeypatch.setattr(oneclick, "evidence_record_confirm", fake_evidence)
    monkeypatch.setattr(oneclick, "_record_validation_event", fake_validation_event)

    async def _run():
        try:
            await oneclick.confirm_inscription(
                _request("/api/payments/oneclick/confirm"),
                oneclick.ConfirmInscriptionRequest(token="tok_fail"),
            )
        except HTTPException as exc:
            return exc
        raise AssertionError("Se esperaba HTTPException")

    exc = asyncio.run(_run())
    assert exc.status_code == 400
    assert exc.detail["error"] == "confirm_failed"

    updated = fake_db.payments_oneclick.docs[0]
    assert updated["status"] == "FAILED"
    assert updated["error"] == "sin_tbk_user"


def test_confirm_idempotent_post_returns_existing_inscription(monkeypatch):
    import routes.oneclick as oneclick

    fake_db = _FakeDb(
        payments=[
            {
                "token": "tok_ok",
                "status": "INSCRIBED",
                "tbk_user": "tbk-user-ok",
                "card_type": "Visa",
                "card_number": "6623",
                "buy_order": "BUYOK",
            }
        ]
    )
    monkeypatch.setattr(oneclick, "db", fake_db)

    def fail_confirm(_token):
        raise AssertionError("No debería llamar Transbank en confirm idempotente")

    monkeypatch.setattr(oneclick, "tbk_confirm_inscription", fail_confirm)

    async def _run():
        return await oneclick.confirm_inscription(
            _request("/api/payments/oneclick/confirm"),
            oneclick.ConfirmInscriptionRequest(token="tok_ok"),
        )

    result = asyncio.run(_run())
    assert result["idempotent"] is True
    assert result["tbk_user"] == "tbk-user-ok"
    assert result["card_type"] == "Visa"
