import importlib
import asyncio
import pytest


class _FakeCollection:
    def __init__(self):
        self.docs = []

    async def find_one(self, filt, proj=None):
        for d in self.docs:
            ok = True
            for k, v in (filt or {}).items():
                if d.get(k) != v:
                    ok = False
                    break
            if ok:
                if proj:
                    out = {}
                    for k2, flag in proj.items():
                        if k2 == "_id":
                            continue
                        if flag:
                            out[k2] = d.get(k2)
                    return out
                return dict(d)
        return None

    async def update_one(self, filt, update, upsert=False):
        for d in self.docs:
            ok = True
            for k, v in (filt or {}).items():
                if d.get(k) != v:
                    ok = False
                    break
            if ok:
                d.update((update or {}).get("$set") or {})
                return
        if upsert:
            doc = dict((update or {}).get("$set") or {})
            self.docs.append(doc)


class _FakeDB:
    def __init__(self):
        self.admin_email_events = _FakeCollection()


def test_admin_emailer_dry_run_uses_env_recipients(monkeypatch):
    monkeypatch.setenv("MAQGO_ADMIN_INCIDENT_EMAILS", "a@maqgo.cl, b@maqgo.cl")
    monkeypatch.delenv("MAQGO_ADMIN_REPORT_EMAIL", raising=False)
    mod = importlib.import_module("services.admin_emailer")
    importlib.reload(mod)

    db = _FakeDB()
    res = asyncio.run(
        mod.send_admin_event_email(
            db=db,
            event_type="admin_incident",
            payload={"title": "X", "details": "Y", "severity": "high"},
            dry_run=True,
            force=True,
        )
    )
    assert res["ok"] is True
    assert res["dry_run"] is True
    assert res["to"] == ["a@maqgo.cl", "b@maqgo.cl"]
    assert "Incidente" in res["subject"]

def test_admin_emailer_logs_sent_and_dedupe(monkeypatch):
    monkeypatch.setenv("MAQGO_ADMIN_NOTICE_EMAILS", "tomas@maqgo.cl")
    mod = importlib.import_module("services.admin_emailer")
    importlib.reload(mod)

    calls = {"n": 0}

    async def fake_send_email(to_emails, subject, text, html=None):
        calls["n"] += 1
        return {"provider": "fake", "id": "1"}

    monkeypatch.setattr(mod, "_send_email", fake_send_email)

    db = _FakeDB()
    r1 = asyncio.run(
        mod.send_admin_event_email(
            db=db,
            event_type="admin_notice",
            payload={"title": "Hola", "message": "Mundo"},
            dry_run=False,
            force=False,
            retry_attempts=2,
        )
    )
    assert r1["ok"] is True
    assert r1["sent"] is True
    assert calls["n"] == 1
    assert len(db.admin_email_events.docs) == 1
    assert db.admin_email_events.docs[0]["status"] == "sent"

    r2 = asyncio.run(
        mod.send_admin_event_email(
            db=db,
            event_type="admin_notice",
            payload={"title": "Hola", "message": "Mundo"},
            dry_run=False,
            force=False,
            retry_attempts=2,
        )
    )
    assert r2["ok"] is True
    assert r2.get("skipped") is True
    assert calls["n"] == 1


def test_admin_emailer_retries(monkeypatch):
    monkeypatch.setenv("MAQGO_ADMIN_NOTICE_EMAILS", "tomas@maqgo.cl")
    mod = importlib.import_module("services.admin_emailer")
    importlib.reload(mod)

    calls = {"n": 0}

    async def fake_send_email(to_emails, subject, text, html=None):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("net")
        return {"provider": "fake", "id": "2"}

    monkeypatch.setattr(mod, "_send_email", fake_send_email)

    db = _FakeDB()
    r = asyncio.run(
        mod.send_admin_event_email(
            db=db,
            event_type="admin_notice",
            payload={"title": "Retry", "message": "Test"},
            dry_run=False,
            force=True,
            retry_attempts=2,
        )
    )
    assert r["ok"] is True
    assert r["sent"] is True
    assert calls["n"] == 2
