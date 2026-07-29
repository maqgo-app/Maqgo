import asyncio
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


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

    async def update_one(self, query, update):
        machine_id = query.get("id")
        current = dict(self.docs[machine_id])
        current.update(update.get("$set", {}))
        self.docs[machine_id] = current


class _FakeUsersCollection:
    def __init__(self):
        self.updates = []

    async def update_one(self, query, update):
        self.updates.append({"query": query, "update": update})


class _FakeDb:
    def __init__(self, machines):
        self.machines = _FakeMachinesCollection(machines)
        self.users = _FakeUsersCollection()


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
        ]
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
        ]
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
