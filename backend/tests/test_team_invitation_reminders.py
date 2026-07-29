import asyncio
import pathlib
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from services.timer_service import TimerService
from routes import operators


class _FakeCursor:
    def __init__(self, docs):
        self._docs = list(docs)

    def sort(self, _args):
        return self

    def __aiter__(self):
        self._iter = iter(self._docs)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration as exc:
            raise StopAsyncIteration from exc


class _FakeInvitationsCollection:
    def __init__(self, docs):
        self.docs = list(docs)
        self.updates = []

    def find(self, *_args, **_kwargs):
        return _FakeCursor(self.docs)

    async def update_one(self, query, update):
        self.updates.append({"query": query, "update": update})


class _FakeDb:
    def __init__(self, invitations):
        self.invitations = _FakeInvitationsCollection(invitations)


def test_team_invitation_reminder_triggers_24h_wave(monkeypatch):
    now = datetime.now(timezone.utc)
    fake_db = _FakeDb(
        [
            {
                "token": "TOK24H",
                "status": "pending",
                "invite_type": "operator",
                "owner_name": "Empresa Demo",
                "operator_phone": "+56911111111",
                "created_at": now - timedelta(hours=25),
                "expires_at": now + timedelta(days=3),
                "reminder_waves_sent": ["initial"],
            }
        ]
    )
    monkeypatch.setattr(
        operators,
        "_send_invitation_sms",
        lambda **kwargs: {"sms_sent": True, "sms_error": None, "phone": kwargs.get("phone")},
    )

    reminded = asyncio.run(TimerService(fake_db).check_pending_team_invitation_reminders())

    assert reminded == 1
    assert len(fake_db.invitations.updates) == 1
    update = fake_db.invitations.updates[0]["update"]
    assert update["$set"]["last_reminder_wave"] == "24h"
    assert update["$addToSet"]["reminder_waves_sent"] == "24h"
    assert update["$inc"]["resend_count"] == 1


def test_team_invitation_reminder_triggers_72h_wave(monkeypatch):
    now = datetime.now(timezone.utc)
    fake_db = _FakeDb(
        [
            {
                "token": "TOK72H",
                "status": "pending",
                "invite_type": "operator",
                "owner_name": "Empresa Demo",
                "operator_phone": "+56911111111",
                "created_at": now - timedelta(hours=80),
                "expires_at": now + timedelta(days=3),
                "reminder_waves_sent": ["initial", "24h"],
            }
        ]
    )
    monkeypatch.setattr(
        operators,
        "_send_invitation_sms",
        lambda **kwargs: {"sms_sent": True, "sms_error": None, "phone": kwargs.get("phone")},
    )

    reminded = asyncio.run(TimerService(fake_db).check_pending_team_invitation_reminders())

    assert reminded == 1
    assert len(fake_db.invitations.updates) == 1
    update = fake_db.invitations.updates[0]["update"]
    assert update["$set"]["last_reminder_wave"] == "72h"
    assert update["$addToSet"]["reminder_waves_sent"] == "72h"


def test_team_invitation_reminder_respects_wave4_threshold(monkeypatch):
    now = datetime.now(timezone.utc)
    fake_db = _FakeDb(
        [
            {
                "token": "TOKW4",
                "status": "pending",
                "invite_type": "operator",
                "owner_name": "Empresa Demo",
                "operator_phone": "+56911111111",
                "created_at": now - timedelta(hours=120),
                "expires_at": now + timedelta(days=3),
                "reminder_waves_sent": ["initial", "24h", "72h"],
            }
        ]
    )
    monkeypatch.setattr(
        operators,
        "_send_invitation_sms",
        lambda **kwargs: {"sms_sent": True, "sms_error": None, "phone": kwargs.get("phone")},
    )
    monkeypatch.setenv("MAQGO_TEAM_INVITE_WAVE4_HOURS", "96")

    reminded = asyncio.run(TimerService(fake_db).check_pending_team_invitation_reminders())

    assert reminded == 1
    assert len(fake_db.invitations.updates) == 1
    update = fake_db.invitations.updates[0]["update"]
    assert update["$set"]["last_reminder_wave"] == "wave4"
    assert update["$addToSet"]["reminder_waves_sent"] == "wave4"
    monkeypatch.delenv("MAQGO_TEAM_INVITE_WAVE4_HOURS", raising=False)
