import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from services.testdata_purge_service import purge_user_testdata


class _Cursor:
    def __init__(self, items):
        self._items = items

    async def to_list(self, _limit):
        return list(self._items)


def _mk_collection(*, count: int = 0, deleted: int = 0):
    col = SimpleNamespace()
    col.count_documents = AsyncMock(return_value=count)
    col.delete_many = AsyncMock(return_value=SimpleNamespace(deleted_count=deleted))
    col.find = lambda *_args, **_kwargs: _Cursor([])
    return col


def test_purge_user_testdata_dry_run_counts_and_uses_service_ids_for_messages():
    db = SimpleNamespace()
    db.services = _mk_collection(count=3)
    db.service_requests = _mk_collection(count=4)
    db.messages = _mk_collection(count=5)
    db.invoices = _mk_collection(count=6)
    db.invoice_attempts = _mk_collection(count=7)
    db.payments = _mk_collection(count=8)
    db.payments_oneclick = _mk_collection(count=9)
    db.machines = _mk_collection(count=10)
    db.users = _mk_collection(count=1)

    db.services.find = lambda *_args, **_kwargs: _Cursor([{"id": "svc1"}, {"id": "svc2"}])
    db.service_requests.find = lambda *_args, **_kwargs: _Cursor([{"id": "sr1"}])

    out = asyncio.run(purge_user_testdata(db, "u1", dry_run=True))

    assert out["ok"] is True
    assert out["dry_run"] is True
    assert out["service_ids"] == 2
    assert out["service_request_ids"] == 1

    (msg_filter,) = db.messages.count_documents.call_args.args
    assert msg_filter == {"$or": [{"sender_id": "u1"}, {"service_id": {"$in": ["svc1", "svc2"]}}]}

    assert db.messages.delete_many.call_count == 0
    assert db.users.delete_many.call_count == 0


def test_purge_user_testdata_hard_delete_deletes_across_collections():
    db = SimpleNamespace()
    db.services = _mk_collection(deleted=3)
    db.service_requests = _mk_collection(deleted=4)
    db.messages = _mk_collection(deleted=5)
    db.invoices = _mk_collection(deleted=6)
    db.invoice_attempts = _mk_collection(deleted=7)
    db.payments = _mk_collection(deleted=8)
    db.payments_oneclick = _mk_collection(deleted=9)
    db.machines = _mk_collection(deleted=10)
    db.users = _mk_collection(deleted=1)

    db.services.find = lambda *_args, **_kwargs: _Cursor([])
    db.service_requests.find = lambda *_args, **_kwargs: _Cursor([])

    out = asyncio.run(purge_user_testdata(db, "u1", dry_run=False))

    assert out["ok"] is True
    assert out["dry_run"] is False
    assert out["deleted"]["users"] == 1
    assert out["deleted"]["machines"] == 10
    assert out["deleted"]["payments_oneclick"] == 9
    assert db.users.delete_many.call_count == 1
