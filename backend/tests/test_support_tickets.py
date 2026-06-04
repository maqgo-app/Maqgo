from fastapi.testclient import TestClient


def test_support_ticket_create_smoke(monkeypatch):
    import routes.support_tickets as st

    class _FakeCollection:
        async def insert_one(self, doc):
            return {"ok": True, "id": doc.get("id")}

    class _FakeDB:
        support_tickets = _FakeCollection()

    monkeypatch.setattr(st, "db", _FakeDB())

    from server import app

    client = TestClient(app)

    res = client.post(
        "/api/support/tickets",
        json={
            "reason": "otp_not_received",
            "phone9": "912345678",
            "requested_role": "provider",
            "notes": "No me llega el código",
        },
    )

    assert res.status_code == 200, res.text
    data = res.json()
    assert data.get("success") is True
    assert isinstance(data.get("ticket_id"), str) and len(data["ticket_id"]) > 10
