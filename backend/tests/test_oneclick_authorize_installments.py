import asyncio
import pathlib
import sys
from types import SimpleNamespace

from starlette.requests import Request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


class _FakeCollection:
    def __init__(self):
        self.docs = []

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

    async def insert_one(self, doc):
        self.docs.append(dict(doc))
        return SimpleNamespace(inserted_id=doc.get("id"))

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


class _FakeDb:
    def __init__(self):
        self.payments_oneclick = _FakeCollection()
        self.oneclick_validation_events = _FakeCollection()

    def __getitem__(self, name):
        return getattr(self, name)


def _request(headers=None):
    raw_headers = []
    for key, value in (headers or {}).items():
        raw_headers.append((key.lower().encode("utf-8"), str(value).encode("utf-8")))
    return Request({"type": "http", "path": "/api/payments/oneclick/authorize", "headers": raw_headers})


def test_service_authorize_includes_installments_and_request_echo(monkeypatch):
    from services import oneclick_service as svc

    monkeypatch.setenv("TBK_PARENT_COMMERCE_CODE", "597055555541")
    monkeypatch.setenv("TBK_CHILD_COMMERCE_CODE", "597055555542")
    monkeypatch.setenv("TBK_API_KEY_SECRET", "secret")

    captured = {}

    def fake_request_json(method, url, headers, payload, allow_retries=True):
        captured["method"] = method
        captured["url"] = url
        captured["headers"] = headers
        captured["payload"] = payload
        return {
            "buy_order": payload["buy_order"],
            "details": [
                {
                    "buy_order": payload["details"][0]["buy_order"],
                    "response_code": 0,
                    "status": "AUTHORIZED",
                    "installments_number": payload["details"][0].get("installments_number"),
                }
            ],
        }

    monkeypatch.setattr(svc, "_request_json", fake_request_json)

    result = svc.authorize_payment(
        username="maqgo-user",
        tbk_user="tbk-user",
        buy_order="BUY12345",
        amount=25000,
        installments_number=3,
    )

    assert captured["method"] == "POST"
    assert captured["payload"]["details"][0]["installments_number"] == 3
    assert result["_maqgo_transbank_request"]["details"][0]["installments_number"] == 3


def test_route_authorize_creates_missing_payment_and_passes_installments(monkeypatch):
    import routes.oneclick as oneclick

    fake_db = _FakeDb()
    monkeypatch.setattr(oneclick, "db", fake_db)

    captured = {}

    def fake_provider_authorize(**kwargs):
        captured.update(kwargs)
        return {
            "buy_order": kwargs["buy_order"],
            "details": [
                {
                    "buy_order": kwargs["buy_order"],
                    "response_code": 0,
                    "status": "AUTHORIZED",
                    "installments_number": kwargs.get("installments_number"),
                }
            ],
        }

    async def fake_evidence(*args, **kwargs):
        return None

    async def fake_validation_event(**kwargs):
        return None

    monkeypatch.setattr(oneclick, "provider_oneclick_authorize", fake_provider_authorize)
    monkeypatch.setattr(oneclick, "evidence_record_authorize", fake_evidence)
    monkeypatch.setattr(oneclick, "_record_validation_event", fake_validation_event)

    async def _run():
        return await oneclick.authorize_payment(
            _request(),
            oneclick.AuthorizePaymentRequest(
                username="maqgo-user",
                tbk_user="tbk-user",
                buy_order="BUY99999",
                amount=18000,
                installments_number=6,
            ),
            current_user={"id": "user_1", "role": "provider", "roles": ["provider"]},
        )

    result = asyncio.run(_run())

    assert captured["installments_number"] == 6
    inserted = fake_db.payments_oneclick.docs[0]
    assert inserted["buy_order"] == "BUY99999"
    assert inserted["status"] == "AUTHORIZED"
    assert inserted["tbk_user"] == "tbk-user"
    assert result["details"][0]["installments_number"] == 6
