import asyncio
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


class AwaitableDict(dict):
    def __await__(self):
        async def _res():
            return self
        return _res().__await__()


class _AwaitableNone:
    _singleton = None

    @classmethod
    def instance(cls):
        if cls._singleton is None:
            cls._singleton = cls()
        return cls._singleton

    def __bool__(self):
        return False

    def __len__(self):
        return 0

    def __eq__(self, other):
        return other is None

    def get(self, key, *a, **kw):
        if a:
            return a[0]
        return None

    def __await__(self):
        async def _res():
            return None
        return _res().__await__()


class AwaitableResult:
    def __init__(self, matched_count=0, modified_count=None):
        self.matched_count = matched_count
        self.modified_count = matched_count if modified_count is None else modified_count

    def __await__(self):
        async def _res():
            return self
        return _res().__await__()


class _FakeCursor:
    def __init__(self, docs):
        self._docs = list(docs)

    async def to_list(self, _limit):
        return list(self._docs)


class _FakeMachinesCollection:
    def __init__(self, machines):
        self.docs = {doc["id"]: dict(doc) for doc in machines}

    def find(self, query, projection=None):
        provider_id = query.get("provider_id")
        docs = [
            dict(doc)
            for doc in self.docs.values()
            if doc.get("provider_id") == provider_id and doc.get("status") != "deleted"
        ]
        return _FakeCursor(docs)

    def update_one(self, query, update):
        machine_id = query.get("id")
        current = dict(self.docs[machine_id])
        current.update(update.get("$set", {}))
        self.docs[machine_id] = current
        return AwaitableResult(matched_count=1)


class _FakeUsersCollection:
    def __init__(self, docs=None):
        self.updates = []
        self.by_id = {}
        for d in docs or []:
            if isinstance(d, dict) and d.get("id"):
                self.by_id[d["id"]] = dict(d)

    def find_one(self, query, projection=None, *a, **kw):
        uid = query.get("id")
        doc = self.by_id.get(uid)
        if not doc:
            return _AwaitableNone.instance()
        return AwaitableDict(doc)

    def update_one(self, query, update, *a, **kw):
        self.updates.append({"query": query, "update": update})
        return AwaitableResult(matched_count=1)


class _FakeDb:
    def __init__(self, machines, users=None):
        self.machines = _FakeMachinesCollection(machines)
        self.users = _FakeUsersCollection(users or [])


def test_inactivating_operator_reassigns_machine_primary(monkeypatch):
    import routes.users as users

    fake_db = _FakeDb(
        [
            {
                "id": "mach_1",
                "provider_id": "owner_1",
                "status": "active",
                "published": True,
                "available": True,
                "primaryOperatorId": "op_1",
                "operators": [
                    {"id": "op_1", "name": "Ana", "phone": "+56911111111", "isPrimary": True},
                    {"id": "op_2", "name": "Luis", "phone": "+56922222222", "isPrimary": False},
                ],
            }
        ],
        users=[
            {
                "id": "op_1",
                "name": "Ana",
                "phone": "+56911111111",
                "status": "active",
                "provider_role": "operator",
                "owner_id": "owner_1",
            },
            {
                "id": "op_2",
                "name": "Luis",
                "phone": "+56922222222",
                "status": "active",
                "provider_role": "operator",
                "owner_id": "owner_1",
            },
        ],
    )
    monkeypatch.setattr(users, "db", fake_db)

    asyncio.run(
        users._apply_member_inactive_state(
            {
                "id": "op_1",
                "owner_id": "owner_1",
                "provider_role": "operator",
                "status": "active",
            },
            actor_id="admin_1",
        )
    )

    machine = fake_db.machines.docs["mach_1"]
    assert [op["id"] for op in machine["operators"]] == ["op_2"]
    assert machine["primaryOperatorId"] == "op_2"
    assert machine["status"] == "active"
    assert machine["available"] is True
    assert machine["published"] is True


def test_inactivating_last_operator_drafts_machine(monkeypatch):
    import routes.users as users

    fake_db = _FakeDb(
        [
            {
                "id": "mach_2",
                "provider_id": "owner_1",
                "status": "active",
                "published": True,
                "available": True,
                "primaryOperatorId": "op_1",
                "operators": [
                    {"id": "op_1", "name": "Ana", "phone": "+56911111111", "isPrimary": True},
                ],
            }
        ],
        users=[
            {
                "id": "op_1",
                "name": "Ana",
                "phone": "+56911111111",
                "status": "active",
                "provider_role": "operator",
                "owner_id": "owner_1",
            },
        ],
    )
    monkeypatch.setattr(users, "db", fake_db)

    asyncio.run(
        users._apply_member_inactive_state(
            {
                "id": "op_1",
                "owner_id": "owner_1",
                "provider_role": "operator",
                "status": "active",
            },
            actor_id="admin_1",
        )
    )

    machine = fake_db.machines.docs["mach_2"]
    assert machine["operators"] == []
    assert machine["primaryOperatorId"] == ""
    assert machine["status"] == "draft"
    assert machine["available"] is False
    assert machine["published"] is False
    assert machine["deactivatedByLifecycle"] == "operator_inactive"
