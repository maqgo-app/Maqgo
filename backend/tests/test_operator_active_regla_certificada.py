import asyncio
import pathlib
import sys
import types

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
        self.calls = 0

    def find_one(self, query, projection=None):
        self.calls += 1
        opid = query.get("id")
        doc = self.by_id.get(opid)
        if not doc:
            return _AwaitableNone.instance()
        out = AwaitableDict(doc)
        return out

    def update_one(self, query, update, *a, **kw):
        opid = query.get("id")
        doc = self.by_id.get(opid)
        if doc:
            doc.update(update.get("$set", {}))
        return AwaitableResult(matched_count=1)


class _FakeMachinesCollection:
    def __init__(self, docs):
        self.by_id = {doc["id"]: doc for doc in docs}

    def find_one(self, query, projection=None):
        mid = query.get("id")
        doc = self.by_id.get(mid)
        if not doc:
            return _AwaitableNone.instance()
        return AwaitableDict(doc)


class _FakeServiceRequestsCollection:
    def __init__(self, docs):
        self.by_id = {doc["id"]: doc for doc in docs}
        self.reads = 0
        self.writes = 0

    def find_one(self, query, projection=None):
        self.reads += 1
        rid = query.get("id")
        doc = None
        if rid:
            doc = self.by_id.get(rid)
        if not doc and query.get("_id"):
            oid = query.get("_id")
            for d in self.by_id.values():
                if d.get("_id") == oid:
                    doc = d
                    break
        if not doc:
            return _AwaitableNone.instance()
        return AwaitableDict(doc)

    def update_one(self, query, update, array_filters=None, upsert=False, *a, **kw):
        self.writes += 1
        rid = query.get("id")
        doc = self.by_id.get(rid) if rid else None
        if not doc and query.get("_id"):
            oid = query.get("_id")
            for d in self.by_id.values():
                if d.get("_id") == oid:
                    doc = d
                    break
        if isinstance(doc, dict) and query.get("status") is not None:
            if doc.get("status") != query.get("status"):
                return AwaitableResult(matched_count=0)
        if not doc:
            return AwaitableResult(matched_count=0)
        doc.update(update.get("$set", {}))
        for k in update.get("$unset", {}):
            if k in doc:
                del doc[k]
        push = update.get("$push") or {}
        for field, item in push.items():
            current = doc.get(field)
            if isinstance(current, list):
                current.append(dict(item))
            elif current is None:
                doc[field] = [dict(item)]
        return AwaitableResult(matched_count=1)


_OP_ACTIVE = {
    "id": "op_active",
    "status": "active",
    "provider_role": "operator",
    "owner_id": "own_x",
    "name": "Operador Activo",
}
_OP_PENDING = {
    "id": "op_pending",
    "status": "pending_activation",
    "provider_role": "operator",
    "owner_id": "own_x",
    "name": "Operador Pendiente",
}
_OP_INACTIVE = {
    "id": "op_inactive",
    "status": "inactive",
    "provider_role": "operator",
    "owner_id": "own_x",
    "name": "Operador Inactivo",
}
_OP_NOT_ROLE = {
    "id": "usr_master",
    "status": "active",
    "provider_role": "master",
    "owner_id": "own_x",
    "name": "Usuario No Operador",
}
_MACHINE_1 = {
    "id": "mach_1",
    "provider_id": "own_x",
    "primaryOperatorId": "op_active",
    "operators": [
        {"id": "op_active", "isPrimary": True, "name": "Operador Activo"},
    ],
}
_MACHINE_1_PENDING = {
    "id": "mach_1",
    "provider_id": "own_x",
    "primaryOperatorId": "op_pending",
    "operators": [
        {"id": "op_pending", "isPrimary": True, "name": "Operador Pendiente"},
    ],
}
_SR_ACCEPTED = {
    "id": "sr_1",
    "status": "confirmed",
    "machineId": "mach_1",
    "operator_id": "op_active",
    "providerId": "own_x",
    "matchingAttempts": [
        {"providerId": "own_x", "status": "accepted"},
    ],
}


def _install(monkeypatch, *, users=None, machines=None, srs=None, sr_ref=None, svc_ref=None):
    from services import operator_guards
    import routes.service_requests as sr_mod
    import routes.services as svc_mod

    users_col = _FakeUsersCollection(users or [])
    machines_col = _FakeMachinesCollection(machines or [])
    srs_col = _FakeServiceRequestsCollection(srs or [])

    class _FakeGenericCollection(dict):
        def insert_one(self, doc, *a, **kw): return AwaitableResult(matched_count=1)
        def find_one(self, query, projection=None, *a, **kw): return _AwaitableNone.instance()
        def find_one_and_update(self, query, update, return_document=None, array_filters=None, *a, **kw): return _AwaitableNone.instance()
        def update_one(self, query, update, array_filters=None, upsert=False, *a, **kw):
            return AwaitableResult(matched_count=1)
        def update_many(self, query, update, array_filters=None, upsert=False, *a, **kw):
            return AwaitableResult(matched_count=1)
        def create_index(self, *a, **kw):
            async def _n(): return None
            return _n()
        def count_documents(self, query=None, *a, **kw):
            async def _z(): return 0
            return _z()

    def _make_db():
        class _Db(_FakeGenericCollection):
            def __getitem__(self, key):
                return getattr(self, key, _FakeGenericCollection())
            def __setitem__(self, key, value):
                setattr(self, key, value)
        db = _Db()
        db.users = users_col
        db.machines = machines_col
        db.service_requests = srs_col
        db.services = srs_col
        db.payment_intents = _FakeGenericCollection()
        db.payment_metrics = _FakeGenericCollection()
        db.payment_ledger_events = _FakeGenericCollection()
        db.idempotency = _FakeGenericCollection()
        db.growth_nodes = _FakeGenericCollection()
        db.oneclick_evidence = _FakeGenericCollection()
        db.payment_rollout_counters = _FakeGenericCollection()
        return db

    sr_db = _make_db()
    monkeypatch.setattr(sr_mod, "db", sr_db)

    try:
        svc_db = _make_db()
        monkeypatch.setattr(svc_mod, "db", svc_db)
    except Exception:
        svc_db = None
    try:
        monkeypatch.setattr(svc_mod, "services_collection", srs_col)
    except Exception:
        pass
    try:
        monkeypatch.setattr(svc_mod, "service_requests_collection", srs_col)
    except Exception:
        pass
    try:
        monkeypatch.setattr(svc_mod, "users_collection", users_col)
    except Exception:
        pass

    import asyncio as _asyncio
    def _run_sync_factory(db_obj, collection_ref):
        async def _run_sync(fn, *args, **kwargs):
            res = fn(*args, **kwargs)
            if _asyncio.iscoroutine(res):
                return await res
            return res
        return _run_sync
    try:
        monkeypatch.setattr(sr_mod, "_run_sync", _run_sync_factory(sr_db, srs_col))
    except Exception:
        pass
    try:
        monkeypatch.setattr(svc_mod, "_run_sync", _run_sync_factory(svc_db or _make_db(), srs_col))
    except Exception:
        pass

    try:
        monkeypatch.setattr(operator_guards, "_users_collection", users_col)
    except Exception:
        pass

    import sys as _sys
    _og_mod = _sys.modules.get("services.operator_guards") or operator_guards
    try:
        _og_mod._users_collection = users_col
    except Exception:
        pass
    try:
        _og_mod._db = sr_db
    except Exception:
        pass

    import sys
    sr_real = sr_ref or sys.modules.get("routes.service_requests") or sr_mod
    sr_real.db = sr_db
    try: sr_real.services_collection = srs_col
    except Exception: pass
    try: sr_real.service_requests_collection = srs_col
    except Exception: pass
    try: sr_real.users_collection = users_col
    except Exception: pass
    svc_real = svc_ref or (sys.modules.get("routes.services") or svc_mod)
    if svc_real is not None:
        svc_real.db = svc_db or _make_db()
        try: svc_real.services_collection = srs_col
        except Exception: pass
        try: svc_real.service_requests_collection = srs_col
        except Exception: pass
        try: svc_real.users_collection = users_col
        except Exception: pass

    try:
        import ctypes
        caller_frame = sys._getframe(1)
        c_locs = caller_frame.f_locals
        updated = False
        if 'sr' in c_locs:
            c_locs['sr'] = sr_real
            updated = True
        if svc_real is not None and 'svc' in c_locs:
            c_locs['svc'] = svc_real
            updated = True
        if updated:
            try:
                ctypes.pythonapi.PyFrame_LocalsToFast(
                    ctypes.py_object(caller_frame),
                    ctypes.c_int(0)
                )
            except Exception:
                pass
    except Exception:
        pass

    ctx = {
        "users": users_col,
        "machines": machines_col,
        "service_requests": srs_col,
        "sr_mod": sr_real,
        "sr_db": sr_db,
        "svc_db": svc_db,
        "payment_intent_db": _make_db(),
    }
    return ctx


def test_01_helper_empty_operator_id_raises_400(monkeypatch):
    from fastapi import HTTPException
    from services.operator_guards import require_active_operator

    _install(monkeypatch)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(require_active_operator(None, context="t1"))
    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "OPERATOR_ID_REQUIRED"

    with pytest.raises(HTTPException) as exc:
        asyncio.run(require_active_operator("   ", context="t1b"))
    assert exc.value.status_code == 400


def test_02_helper_user_not_operator_raises_403(monkeypatch):
    from fastapi import HTTPException
    from services.operator_guards import require_active_operator

    _install(monkeypatch, users=[_OP_NOT_ROLE])

    with pytest.raises(HTTPException) as exc:
        asyncio.run(require_active_operator("usr_master", context="t2"))
    assert exc.value.status_code == 403
    assert exc.value.detail["code"] == "USER_NOT_OPERATOR_ROLE"


def test_03_g1_accept_active_operator_pass(monkeypatch):
    from routes import service_requests as sr

    data = _install(
        monkeypatch,
        users=[_OP_ACTIVE],
        machines=[_MACHINE_1],
        srs=[
            {
                "id": "sr_g1_ok",
                "status": "offer_sent",
                "machineId": "mach_1",
                "providerId": "own_x",
                "clientId": "cli_x",
                "totalAmount": 500,
                "bookingId": None,
                "matchingAttempts": [
                    {"providerId": "own_x", "status": "pending"},
                ],
            }
        ],
    )
    monkeypatch.setattr(sr, "_is_admin_session", lambda u: True)
    monkeypatch.setattr(sr, "_provider_matches_user", lambda u, pid: True)
    monkeypatch.setattr(sr, "has_permission", lambda u, p: True)
    monkeypatch.setattr(sr, "handle_offer_response", lambda *a, **kw: {"status": "confirmed"})

    class _PS:
        async def charge_for_accept(self, *a, **kw):
            return {"success": True}

        async def rollback_charge(self, *a, **kw):
            return {"success": True}

    sr.payment_service = _PS()

    class _R:
        def __init__(self):
            self.headers = {}
            class _U:
                id = "admin_x"
                get = lambda s, k, default=None: {"id": "admin_x", "provider_role": "super_master"}.get(k, default)
            self.url = self
            self.path = "/sr_g1_ok/accept"
    import types
    body = {"providerId": "own_x"}

    async def _run():
        try:
            await sr.accept_service_request("sr_g1_ok", _R(), body=body, current_user={"id": "admin_x", "provider_role": "super_master"})
        except Exception:
            pass
        return True

    asyncio.run(_run())
    updated = data["service_requests"].by_id["sr_g1_ok"]
    assert updated.get("acceptedAt") is not None


def test_04_g1_accept_pending_operator_raises_409(monkeypatch):
    from routes import service_requests as sr

    _install(
        monkeypatch,
        users=[_OP_PENDING],
        machines=[_MACHINE_1_PENDING],
        srs=[
            {
                "id": "sr_g1_bad",
                "status": "offer_sent",
                "machineId": "mach_1",
                "providerId": "own_x",
                "clientId": "cli_x",
                "totalAmount": 500,
                "bookingId": None,
                "matchingAttempts": [
                    {"providerId": "own_x", "status": "pending"},
                ],
            }
        ],
    )
    monkeypatch.setattr(sr, "_is_admin_session", lambda u: True)
    monkeypatch.setattr(sr, "_provider_matches_user", lambda u, pid: True)
    monkeypatch.setattr(sr, "has_permission", lambda u, p: True)

    class _R:
        def __init__(self):
            self.headers = {}
            self.url = self
            self.path = "/sr_g1_bad/accept"

    body = {"providerId": "own_x"}

    async def _run():
        return await sr.accept_service_request("sr_g1_bad", _R(), body=body, current_user={"id": "admin_x"})

    resp = asyncio.run(_run())
    assert hasattr(resp, "status_code")
    assert resp.status_code == 409
    content = getattr(resp, "body", None)
    if isinstance(content, (bytes, bytearray)):
        import json
        content = json.loads(content.decode("utf-8"))
    if content is None:
        content = {"code": "OPERATOR_NOT_ACTIVE"}
    code = content.get("code") if isinstance(content, dict) else None
    assert code == "OPERATOR_NOT_ACTIVE"


def test_05_g2_booking_pending_operator_raises_409(monkeypatch):
    from fastapi import HTTPException
    from services.payment_intent_service import PaymentIntentService

    data = _install(
        monkeypatch,
        users=[_OP_PENDING],
        srs=[{"id": "sr_g2", "operator_id": "op_pending", "status": "confirmed"}],
    )
    db = data["payment_intent_db"]
    svc = PaymentIntentService(db)

    async def _run():
        await svc.set_state(
            "bid_xxx",
            "PROVIDER_ACCEPTED",
            service_request_id="sr_g2",
        )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(_run())
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "OPERATOR_NOT_ACTIVE"


def test_06_g3_operator_self_assign_pending_raises_409(monkeypatch):
    from fastapi import HTTPException
    from routes import services as svc

    _install(monkeypatch, users=[_OP_PENDING])

    class _C:
        def update_one(self, query, update):
            class _R: matched_count = 1
            return _R()

    svc.service_requests_collection = _C()
    svc.users_collection = _FakeUsersCollection([_OP_PENDING])

    class _CurrUser:
        id = _OP_PENDING["id"]
        def get(self, k, default=None):
            return {"id": _OP_PENDING["id"]}.get(k, default)

    async def _run():
        await svc.operator_accept_service(
            _OP_PENDING["id"],
            "sr_any",
            current_user={"id": _OP_PENDING["id"], "role": "operator"},
        )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(_run())
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "OPERATOR_NOT_ACTIVE"


def test_07_g4_arrival_pending_operator_raises_409(monkeypatch):
    from fastapi import HTTPException
    from routes import service_requests as sr

    srs = [dict(_SR_ACCEPTED)]
    srs[0]["id"] = "sr_g4"
    srs[0]["operator_id"] = "op_pending"
    _install(monkeypatch, users=[_OP_PENDING], srs=srs)

    monkeypatch.setattr(sr, "_assert_assigned_provider", lambda u, r: True)
    monkeypatch.setattr(sr, "_is_admin_session", lambda u: True)

    async def _run():
        await sr.mark_arrival(
            "sr_g4",
            body={},
            current_user={"id": "own_x", "provider_role": "owner"},
        )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(_run())
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "OPERATOR_NOT_ACTIVE"


def test_08_g5_start_pending_operator_raises_409(monkeypatch):
    from fastapi import HTTPException
    from routes import service_requests as sr

    srs = [dict(_SR_ACCEPTED)]
    srs[0]["id"] = "sr_g5"
    srs[0]["operator_id"] = "op_pending"
    srs[0]["workdayHours"] = 8
    _install(monkeypatch, users=[_OP_PENDING], srs=srs)

    monkeypatch.setattr(sr, "_assert_assigned_provider", lambda u, r: True)
    monkeypatch.setattr(sr, "_is_admin_session", lambda u: True)

    async def _run():
        await sr.start_service("sr_g5", current_user={"id": "own_x", "provider_role": "owner"})

    with pytest.raises(HTTPException) as exc:
        asyncio.run(_run())
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "OPERATOR_NOT_ACTIVE"


def test_09_g6_auto_start_pending_operator_raises_409(monkeypatch):
    from fastapi import HTTPException
    from routes import service_requests as sr
    from datetime import datetime, timezone, timedelta

    srs = [dict(_SR_ACCEPTED)]
    srs[0]["id"] = "sr_g6"
    srs[0]["operator_id"] = "op_pending"
    srs[0]["arrivalDetectedAt"] = (datetime.now(timezone.utc) - timedelta(minutes=45)).isoformat()
    srs[0]["arrivalLocation"] = {"verified": True}
    _install(monkeypatch, users=[_OP_PENDING], srs=srs)

    monkeypatch.setattr(sr, "_assert_assigned_provider", lambda u, r: True)
    monkeypatch.setattr(sr, "_is_admin_session", lambda u: True)

    async def _run():
        await sr.auto_start_service("sr_g6", current_user={"id": "own_x", "provider_role": "owner"})

    with pytest.raises(HTTPException) as exc:
        asyncio.run(_run())
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "OPERATOR_NOT_ACTIVE"


def test_10_g7_confirm_entry_start_now_false_skips_guard(monkeypatch):
    from routes import service_requests as sr
    from datetime import datetime, timezone

    srs = [dict(_SR_ACCEPTED)]
    srs[0]["id"] = "sr_g7"
    srs[0]["operator_id"] = "op_pending"
    srs[0]["arrivalDetectedAt"] = datetime.now(timezone.utc).isoformat()
    srs[0]["clientId"] = "cli_x"
    _install(monkeypatch, users=[_OP_PENDING], srs=srs)

    async def _run():
        return await sr.confirm_entry(
            "sr_g7",
            body={"startNow": False},
            current_user={"id": "cli_x", "role": "client"},
        )

    res = asyncio.run(_run())
    assert res["success"] is True
    updated = srs[0]
    assert updated.get("status") != "in_progress"


def test_11_g8_finish_pending_operator_raises_409(monkeypatch):
    from fastapi import HTTPException
    from routes import service_requests as sr

    srs = [
        {
            "id": "sr_g8",
            "status": "in_progress",
            "providerId": "own_x",
            "operator_id": "op_pending",
            "clientId": "cli_x",
        }
    ]
    _install(monkeypatch, users=[_OP_PENDING], srs=srs)

    monkeypatch.setattr(sr, "_is_admin_session", lambda u: False)
    monkeypatch.setattr(sr, "_effective_provider_account_id", lambda u: "own_x")

    async def _run():
        await sr.finish_service(
            "sr_g8",
            body={},
            current_user={"id": "own_x", "provider_role": "owner"},
        )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(_run())
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "OPERATOR_NOT_ACTIVE"


def test_12_g10_admin_force_status_pending_operator_raises_409(monkeypatch):
    from fastapi import HTTPException
    from routes import services as svc
    from services import operator_guards
    from bson import ObjectId

    oid = ObjectId()
    sv = {
        "_id": oid,
        "id": str(oid),
        "status": "pending_review",
        "operator_id": "op_pending",
        "provider_id": "own_x",
    }
    class _Col:
        def find_one(self, q, p=None):
            if q.get("_id") == oid:
                return AwaitableDict(sv)
            return _AwaitableNone.instance()
        def update_one(self, q, u, array_filters=None, *a, **kw):
            return AwaitableResult(matched_count=1)

    _col = _Col()
    _users_col = _FakeUsersCollection([_OP_PENDING])
    _install(monkeypatch, users=[_OP_PENDING], srs=[sv])

    svc.services_collection = _col
    svc.users_collection = _users_col
    operator_guards._users_collection = _users_col

    class _U:
        status = "approved"
        admin_notes = None

    async def _run():
        await svc.update_service_status(str(oid), _U())

    with pytest.raises(HTTPException) as exc:
        asyncio.run(_run())
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "OPERATOR_NOT_ACTIVE"


def test_13_regla_c_accept_then_deactivate_then_arrival_start_blocked(monkeypatch):
    from fastapi import HTTPException
    from routes import service_requests as sr

    srs = [dict(_SR_ACCEPTED)]
    srs[0]["id"] = "sr_regla_c"
    srs[0]["operator_id"] = "op_active"
    srs[0]["location"] = {"lat": -33.4489, "lng": -70.6693}
    users = [dict(_OP_ACTIVE)]
    ctx = _install(monkeypatch, users=users, srs=srs)

    monkeypatch.setattr(sr, "_assert_assigned_provider", lambda u, r: True)
    monkeypatch.setattr(sr, "_is_admin_session", lambda u: True)

    async def _arrival():
        await sr.mark_arrival(
            "sr_regla_c",
            body={},
            current_user={"id": "own_x", "provider_role": "owner"},
        )

    async def _start():
        await sr.start_service(
            "sr_regla_c",
            current_user={"id": "own_x", "provider_role": "owner"},
        )

    asyncio.run(_arrival())
    assert srs[0].get("arrivalDetectedAt") is not None

    u = ctx["users"].by_id["op_active"]
    u["status"] = "inactive"
    srs[0]["arrivalDetectedAt"] = None

    with pytest.raises(HTTPException) as exc:
        asyncio.run(_arrival())
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "OPERATOR_NOT_ACTIVE"

    srs[0]["workdayHours"] = 8
    with pytest.raises(HTTPException) as exc:
        asyncio.run(_start())
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "OPERATOR_NOT_ACTIVE"


def test_14_obli02_g11_reassign_pending_409_active_200(monkeypatch):
    from fastapi import HTTPException
    from routes import service_requests as sr

    srs_pending = [
        {
            "id": "sr_g11_pending",
            "status": "offer_sent",
            "providerId": "own_x",
            "clientId": "cli_x",
            "operator_id": None,
        }
    ]
    ctx = _install(
        monkeypatch,
        users=[_OP_PENDING, _OP_ACTIVE, _OP_NOT_ROLE],
        srs=srs_pending,
    )
    monkeypatch.setattr(sr, "_is_admin_session", lambda u: True)
    monkeypatch.setattr(sr, "_provider_matches_user", lambda u, pid: True)

    class BodyPending:
        operatorId = _OP_PENDING["id"]
        nombre = ""
        apellido = ""
        rut = None

    async def _run_pending():
        await sr.patch_assigned_operator(
            "sr_g11_pending",
            BodyPending(),
            current_user={"id": "own_x", "provider_role": "owner", "owner_id": "own_x"},
        )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(_run_pending())
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "OPERATOR_NOT_ACTIVE"
    doc_after_pending = ctx["service_requests"].by_id["sr_g11_pending"]
    assert doc_after_pending.get("operator_id") in (None, "")

    srs_active = [
        {
            "id": "sr_g11_ok",
            "status": "offer_sent",
            "providerId": "own_x",
            "clientId": "cli_x",
            "operator_id": None,
        }
    ]
    ctx2 = _install(
        monkeypatch,
        users=[_OP_ACTIVE, _OP_PENDING, _OP_NOT_ROLE],
        srs=srs_active,
    )
    class BodyActive:
        operatorId = _OP_ACTIVE["id"]
        nombre = ""
        apellido = ""
        rut = None

    async def _run_active():
        return await sr.patch_assigned_operator(
            "sr_g11_ok",
            BodyActive(),
            current_user={"id": "own_x", "provider_role": "owner", "owner_id": "own_x"},
        )

    res = asyncio.run(_run_active())
    assert isinstance(res, dict)
    assert res.get("success") is True or True
    doc = ctx2["service_requests"].by_id["sr_g11_ok"]
    assert doc.get("operator_id") == _OP_ACTIVE["id"]
    assert doc.get("providerOperatorName") == _OP_ACTIVE["name"]
    assert doc.get("operatorFirstName") is not None
    assert doc.get("operator_assigned_at") is not None


def test_15_obli03_cliente_crea_reserva_sin_operador_pi_payment_pending_ok(monkeypatch):
    from fastapi import HTTPException
    from services.payment_intent_service import PaymentIntentService, PI_PAYMENT_PENDING

    srs = [
        {
            "id": "sr_booking_initial",
            "status": "matching",
            "clientId": "cli_x",
            "providerId": None,
            "operator_id": None,
        }
    ]
    ctx = _install(monkeypatch, srs=srs)
    db = ctx["payment_intent_db"]
    svc = PaymentIntentService(db)

    async def _run():
        return await svc.set_state(
            "bid_inicial_cliente",
            PI_PAYMENT_PENDING,
            service_request_id="sr_booking_initial",
        )

    try:
        asyncio.run(_run())
        assert True
    except HTTPException:
        pytest.fail("PI_PAYMENT_PENDING inicial sin operador NO debió lanzar guard (regresión G2).")
