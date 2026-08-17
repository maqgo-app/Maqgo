import asyncio
import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


class AwaitableDict(dict):
    def __await__(self):
        async def _res():
            return self
        return _res().__await__()


class AwaitableResult:
    def __init__(self, matched_count=0, modified_count=None):
        self.matched_count = matched_count
        self.modified_count = matched_count if modified_count is None else modified_count
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
        if other is None:
            return True
        return False

    def get(self, key, *a, **kw):
        if a:
            return a[0]
        return None

    def __await__(self):
        async def _res():
            return None
        return _res().__await__()


class _FakeUsersCollection:
    def __init__(self, docs):
        self.by_id = {doc["id"]: doc for doc in docs}

    def find_one(self, query, projection=None, *a, **kw):
        uid = query.get("id")
        doc = self.by_id.get(uid)
        if not doc:
            return _AwaitableNone.instance()
        return AwaitableDict(doc)

    def update_one(self, query, update, *a, **kw):
        uid = query.get("id")
        doc = self.by_id.get(uid)
        if doc:
            doc.update(update.get("$set", {}))
        return AwaitableResult(matched_count=1)


class _FakeMachinesCollection:
    def __init__(self, docs):
        self.by_id = {doc["id"]: doc for doc in docs}
        self.inserted = []

    def find_one(self, query, projection=None, *a, **kw):
        mid = query.get("id")
        if mid is None and query.get("provider_id") and query.get("licensePlate") and query.get("machineryType"):
            for d in self.by_id.values():
                if d.get("provider_id") == query.get("provider_id") and d.get("licensePlate") == query.get("licensePlate") and d.get("machineryType") == query.get("machineryType") and d.get("status") != "deleted":
                    return AwaitableDict(d)
            return _AwaitableNone.instance()
        doc = self.by_id.get(mid)
        if not doc:
            return _AwaitableNone.instance()
        return AwaitableDict(doc)

    def find(self, query=None, projection=None, *a, **kw):
        class _Cur:
            def __init__(self, docs):
                self._d = docs
            async def to_list(self, n):
                return self._d
            def __aiter__(self):
                self._i = 0
                return self
            async def __anext__(self):
                if self._i >= len(self._d):
                    raise StopAsyncIteration
                doc = self._d[self._i]
                self._i += 1
                return doc
        out = []
        q = query or {}
        pid = q.get("provider_id")
        status_ne = q.get("status", {}).get("$ne") if isinstance(q.get("status"), dict) else None
        for d in self.by_id.values():
            if pid is not None and d.get("provider_id") != pid:
                continue
            if status_ne is not None and d.get("status") == status_ne:
                continue
            ops_match = True
            op_id_q = q.get("operators.id")
            if op_id_q:
                ops = d.get("operators") if isinstance(d.get("operators"), list) else []
                ops_match = any(str(op.get("id")) == str(op_id_q) for op in ops if isinstance(op, dict))
            if not ops_match:
                continue
            out.append(AwaitableDict(d))
        return _Cur(out)

    def insert_one(self, doc, *a, **kw):
        self.by_id[doc["id"]] = doc
        self.inserted.append(doc)
        return AwaitableResult(matched_count=1)

    def update_one(self, query, update, *a, **kw):
        mid = query.get("id")
        doc = self.by_id.get(mid)
        if doc:
            set_doc = update.get("$set", {})
            doc.update(set_doc)
            unset_doc = update.get("$unset", {})
            for k in unset_doc:
                if k in doc:
                    del doc[k]
        return AwaitableResult(matched_count=1)

    def update_many(self, query, update, *a, **kw):
        return AwaitableResult(matched_count=0)

    def create_index(self, *a, **kw):
        async def _n(): return None
        return _n()

    def sort(self, *a, **kw):
        return self

    def to_list(self, n):
        async def _l(): return list(self.by_id.values())
        return _l()


def _build_db(users_docs=None, machines_docs=None):
    users = _FakeUsersCollection(users_docs or [])
    machines = _FakeMachinesCollection(machines_docs or [])

    class _FakeGenericCollection(dict):
        def insert_one(self, doc, *a, **kw): return AwaitableResult(matched_count=1)
        def find_one(self, query, projection=None, *a, **kw): return _AwaitableNone.instance()
        def update_one(self, query, update, array_filters=None, upsert=False, *a, **kw): return AwaitableResult(matched_count=1)
        def update_many(self, query, update, array_filters=None, upsert=False, *a, **kw): return AwaitableResult(matched_count=0)
        def find(self, *a, **kw):
            class _C:
                def sort(self, *a, **kw): return self
                async def to_list(self, n): return []
                def __aiter__(self):
                    async def _empty(): return
                    return _empty()
            return _C()
        def count_documents(self, query=None, *a, **kw):
            async def _z(): return 0
            return _z()
        def create_index(self, *a, **kw):
            async def _n(): return None
            return _n()

    class _Db(_FakeGenericCollection):
        def __getitem__(self, key):
            return getattr(self, key, _FakeGenericCollection())
        def __setitem__(self, key, value):
            setattr(self, key, value)
    db = _Db()
    db.users = users
    db.machines = machines
    return db, users, machines


OP_ACTIVE = {
    "id": "op_i_active",
    "name": "Operador Activo",
    "phone": "+56911111111",
    "status": "active",
    "provider_role": "operator",
    "owner_id": "own_1",
    "rut": "12345678-5",
}

OP_PENDING = {
    "id": "op_i_pending",
    "name": "Operador Pendiente",
    "phone": "+56922222222",
    "status": "pending_activation",
    "provider_role": "operator",
    "owner_id": "own_1",
    "rut": "11111111-1",
}

OP_INACTIVE = {
    "id": "op_i_inactive",
    "name": "Operador Inactivo",
    "phone": "+56933333333",
    "status": "inactive",
    "provider_role": "operator",
    "owner_id": "own_1",
    "rut": "22222222-2",
}

MACH_OP_ACTIVE = {
    "id": "mach_i_active",
    "provider_id": "own_1",
    "machineryType": "retroexcavadora",
    "licensePlate": "ABCD12",
    "published": True,
    "available": True,
    "status": "active",
    "operators": [
        {"id": "op_i_active", "name": "Operador Activo", "phone": "+56911111111", "rut": "12345678-5", "isPrimary": True}
    ],
    "pricePerHour": 50000,
    "transportCost": 20000,
    "location": {"lat": -33.4489, "lng": -70.6693},
}

MACH_OP_PENDING_PUB = {
    "id": "mach_i_pending_pub",
    "provider_id": "own_1",
    "machineryType": "camion_tolva",
    "licensePlate": "WXYZ99",
    "published": True,
    "available": True,
    "status": "active",
    "operators": [
        {"id": "op_i_pending", "name": "Operador Pendiente", "phone": "+56922222222", "rut": "11111111-1", "isPrimary": True}
    ],
    "pricePerService": 80000,
    "transportCost": 0,
}

MACH_OP_INACTIVE_PUB = {
    "id": "mach_i_inactive_pub",
    "provider_id": "own_1",
    "machineryType": "excavadora",
    "licensePlate": "PQRS45",
    "published": True,
    "available": True,
    "status": "active",
    "operators": [
        {"id": "op_i_inactive", "name": "Operador Inactivo", "phone": "+56933333333", "rut": "22222222-2", "isPrimary": True}
    ],
    "pricePerHour": 120000,
    "transportCost": 30000,
    "location": {"lat": -33.4489, "lng": -70.6693},
}

MACH_NO_OPS_PUB = {
    "id": "mach_i_no_ops",
    "provider_id": "own_1",
    "machineryType": "bulldozer",
    "licensePlate": "MNOP77",
    "published": True,
    "available": True,
    "status": "active",
    "operators": [],
    "pricePerHour": 90000,
    "transportCost": 25000,
}


def test_I1_published_available_no_operators_create_raise_409_or_unpublish():
    from services.machines_service import create_machine

    db, *_ = _build_db(users_docs=[OP_ACTIVE])

    payload = {
        "machineryType": "bulldozer",
        "licensePlate": "MNOP88",
        "published": True,
        "available": True,
        "operators": [],
        "pricePerHour": 90000,
        "transportCost": 25000,
    }

    async def _run():
        try:
            doc = await create_machine(db, "own_1", payload)
            return ("OK", doc)
        except ValueError as e:
            return ("VALUE_ERR", str(e))

    mode, data = asyncio.run(_run())
    if mode == "VALUE_ERR":
        assert data == "Cada máquina debe tener al menos un operador real asignado"
    else:
        doc = data
        assert doc.get("published") is False
        assert doc.get("available") is False


def test_I2_create_with_pending_published_raise_operator_not_active():
    from services.machines_service import create_machine

    db, *_ = _build_db(users_docs=[OP_PENDING])

    payload = {
        "machineryType": "camion_tolva",
        "licensePlate": "WXYZ90",
        "published": True,
        "available": True,
        "operators": [
            {"id": "op_i_pending", "name": "Operador Pendiente", "phone": "+56922222222", "rut": "11111111-1", "isPrimary": True}
        ],
        "pricePerService": 80000,
    }

    async def _run():
        try:
            doc = await create_machine(db, "own_1", payload)
            return ("OK", doc)
        except ValueError as e:
            return ("VALUE_ERR", str(e))

    mode, data = asyncio.run(_run())
    assert mode == "VALUE_ERR"
    assert data == "MACHINE_OPERATOR_NOT_ACTIVE"


def test_I3_create_with_inactive_published_raise_operator_not_active():
    from services.machines_service import create_machine

    db, *_ = _build_db(users_docs=[OP_INACTIVE])

    payload = {
        "machineryType": "excavadora",
        "licensePlate": "PQRS66",
        "published": True,
        "available": True,
        "operators": [
            {"id": "op_i_inactive", "name": "Operador Inactivo", "phone": "+56933333333", "rut": "22222222-2", "isPrimary": True}
        ],
        "pricePerHour": 120000,
        "transportCost": 30000,
    }

    async def _run():
        try:
            doc = await create_machine(db, "own_1", payload)
            return ("OK", doc)
        except ValueError as e:
            return ("VALUE_ERR", str(e))

    mode, data = asyncio.run(_run())
    assert mode == "VALUE_ERR"
    assert data == "MACHINE_OPERATOR_NOT_ACTIVE"


def test_I4_create_with_active_published_OK_success():
    from services.machines_service import create_machine

    db, *_ = _build_db(users_docs=[OP_ACTIVE])

    payload = {
        "machineryType": "retroexcavadora",
        "licensePlate": "ABCD13",
        "published": True,
        "available": True,
        "operators": [
            {"id": "op_i_active", "name": "Operador Activo", "phone": "+56911111111", "rut": "12345678-5", "isPrimary": True}
        ],
        "pricePerHour": 50000,
        "transportCost": 20000,
    }

    async def _run():
        try:
            doc = await create_machine(db, "own_1", payload)
            return ("OK", doc)
        except ValueError as e:
            return ("VALUE_ERR", str(e))

    mode, data = asyncio.run(_run())
    assert mode == "OK", f"esperaba OK pero fue VALUE_ERR={data}"
    doc = data
    assert doc.get("published") is True
    assert doc.get("available") is True
    assert doc.get("status") in {"active", "operativa"}


def test_I5_update_machine_from_active_to_pending_triggers_unpublish_or_reject():
    from services.machines_service import update_machine

    existing = dict(MACH_OP_ACTIVE)
    existing["id"] = "mach_i_upt"
    existing["licensePlate"] = "ABCD14"

    db, *_ = _build_db(users_docs=[OP_ACTIVE, OP_PENDING], machines_docs=[existing])

    payload = {
        "published": True,
        "available": True,
        "operators": [
            {"id": "op_i_pending", "name": "Operador Pendiente", "phone": "+56922222222", "rut": "11111111-1", "isPrimary": True}
        ],
    }

    async def _run():
        try:
            doc = await update_machine(db, "mach_i_upt", payload)
            return ("OK", doc)
        except ValueError as e:
            return ("VALUE_ERR", str(e))

    mode, data = asyncio.run(_run())
    assert mode == "VALUE_ERR"
    assert data == "MACHINE_OPERATOR_NOT_ACTIVE"


def test_I6_sync_snapshot_across_machines_operator_goes_inactive_unpublishes_machine():
    from services.machines_service import sync_operator_snapshot_across_machines

    mach = dict(MACH_OP_ACTIVE)
    mach["id"] = "mach_i_sync"
    mach["licensePlate"] = "ABCD15"

    db, users, machines = _build_db(
        users_docs=[OP_ACTIVE],
        machines_docs=[mach]
    )

    async def _step1_sync():
        upd = await sync_operator_snapshot_across_machines(
            db, provider_id="own_1", operator_user=OP_ACTIVE
        )
        return upd

    before_count = asyncio.run(_step1_sync())
    assert before_count >= 0

    op_now_inactive = dict(OP_ACTIVE)
    op_now_inactive["status"] = "inactive"
    users.by_id["op_i_active"] = op_now_inactive

    async def _step2_sync_inactive():
        upd = await sync_operator_snapshot_across_machines(
            db, provider_id="own_1", operator_user=op_now_inactive
        )
        return upd, machines.by_id.get("mach_i_sync")

    _after_upd, doc = asyncio.run(_step2_sync_inactive())
    assert doc.get("published") is False
    assert doc.get("available") is False
    assert doc.get("status") == "draft"
    ops = doc.get("operators") if isinstance(doc.get("operators"), list) else []
    any_active = any(str(op.get("id")) == "op_i_active" and op.get("status") == "inactive" for op in ops if isinstance(op, dict))
    assert any_active


def test_I7_draft_unpublished_states_always_allowed_even_pending_operator():
    from services.machines_service import enforce_machine_publishable_state

    db, *_ = _build_db(users_docs=[OP_PENDING])

    doc_draft = {
        "id": "mach_i_draft",
        "provider_id": "own_1",
        "published": False,
        "available": False,
        "status": "draft",
        "operators": [
            {"id": "op_i_pending", "name": "Operador Pendiente", "phone": "+56922222222", "rut": "11111111-1", "isPrimary": True}
        ],
    }

    async def _check():
        out = await enforce_machine_publishable_state(db, doc_draft, reject_on_violation=False)
        return out

    res = asyncio.run(_check())
    assert res.get("published") is False
    assert res.get("available") is False
    assert res.get("status") == "draft"

    doc_available_only = {
        "id": "mach_i_avail_only",
        "provider_id": "own_1",
        "published": False,
        "available": True,
        "status": "active",
        "operators": [
            {"id": "op_i_pending", "name": "Pendiente", "phone": "+56922222222", "rut": "11111111-1", "isPrimary": True}
        ],
    }

    async def _check2():
        out = await enforce_machine_publishable_state(db, doc_available_only, reject_on_violation=False)
        return out

    res2 = asyncio.run(_check2())
    assert res2.get("published") is False
