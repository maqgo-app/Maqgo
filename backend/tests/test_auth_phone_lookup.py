import asyncio
import os
import re
import sys

BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from routes import auth


class _FakeCursor:
    def __init__(self, rows):
        self._rows = list(rows)

    async def to_list(self, length):
        if length is None:
            return list(self._rows)
        return list(self._rows[:length])


class _FakeUsersCollection:
    def __init__(self, rows):
        self._rows = list(rows)

    def find(self, query, projection=None):
        phone_regex = str(((query or {}).get("phone") or {}).get("$regex") or "")
        matcher = re.compile(phone_regex)
        rows = [row for row in self._rows if matcher.search(str(row.get("phone") or ""))]
        if projection:
            include = {k for k, v in projection.items() if v}
            if include:
                projected = []
                for row in rows:
                    projected.append({k: row.get(k) for k in include if k != "_id"})
                rows = projected
        return _FakeCursor(rows)


class _FakeDB:
    def __init__(self, rows):
        self.users = _FakeUsersCollection(rows)


def test_is_active_user_doc_normalizes_status():
    assert auth._is_active_user_doc({"status": "ACTIVE"}) is True
    assert auth._is_active_user_doc({"status": " active "}) is True
    assert auth._is_active_user_doc({"status": "inactive"}) is False
    assert auth._is_active_user_doc({"status": "active", "deleted": True}) is False


def test_find_best_user_by_phone9_prefers_active_even_after_many_inactive(monkeypatch):
    phone = "+56994336579"
    rows = [
        {
            "id": f"inactive-{i}",
            "phone": phone,
            "status": "inactive",
            "deleted": False,
            "roles": ["client"],
            "createdAt": f"2026-01-{(i % 28) + 1:02d}T00:00:00+00:00",
        }
        for i in range(25)
    ]
    rows.append(
        {
            "id": "active-user",
            "phone": "994336579",
            "status": "ACTIVE",
            "deleted": False,
            "roles": ["client"],
            "createdAt": "2026-06-08T00:00:00+00:00",
        }
    )
    monkeypatch.setattr(auth, "db", _FakeDB(rows))

    user = asyncio.run(auth._find_best_user_by_phone9("994336579", raw_phone=phone, projection={"_id": 0}))

    assert user is not None
    assert user["id"] == "active-user"


def test_find_best_user_by_phone9_falls_back_to_inactive_when_only_match(monkeypatch):
    rows = [
        {
            "id": "inactive-only",
            "phone": "+56994336579",
            "status": "inactive",
            "deleted": False,
            "roles": ["client"],
            "createdAt": "2026-06-08T00:00:00+00:00",
        }
    ]
    monkeypatch.setattr(auth, "db", _FakeDB(rows))

    user = asyncio.run(auth._find_best_user_by_phone9("994336579", raw_phone="+56994336579", projection={"_id": 0}))

    assert user is not None
    assert user["id"] == "inactive-only"
