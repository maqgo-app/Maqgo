#!/usr/bin/env python3
"""MAQGO QA DEMO: Infraestructura de aislamiento + cleanup determinístico.

SOLO PARA TESTS LOCALES. NUNCA EJECUTAR CONTRA PRODUCTION.
"""
import asyncio
import os
import re
import sys
import unittest
from typing import Any, Dict, List

DEMO_USER_IDS = [
    "demo-client-001",
    "demo-1",
    "demo-2",
    "demo-3",
    "demo-operator-001",
    "demo-admin-001",
]
DEMO_USER_EMAIL_REGEX = r"@demo\.cl$"
DEMO_MACHINE_ID_PREFIX = "demo-machine-"
DEMO_SR_ID_PREFIX = "demo-sr-"
DEMO_BOOKING_ID_PREFIX = "demo-booking-"
DEMO_INVITATION_CODES = {"DEMO01"}
REAL_ADMIN_EMAIL = "admin@maqgo.cl"


def _db_collections_snapshot(db) -> Dict[str, Dict[str, Any]]:
    demo_users_set = set(DEMO_USER_IDS)
    snap: Dict[str, Dict[str, Any]] = {}
    snap["users"] = {
        "count": db.users.count_documents(
            {
                "$and": [
                    {"id": {"$not": {"$regex": r"^demo-"}}},
                    {"email": {"$not": {"$regex": DEMO_USER_EMAIL_REGEX}}},
                ]
            }
        ),
        "ids": [],
    }
    for u in db.users.find(
        {"id": {"$not": {"$regex": r"^demo-"}}}, {"_id": 0, "id": 1}
    ):
        uid = str(u.get("id", ""))
        if uid and uid not in demo_users_set:
            snap["users"]["ids"].append(uid)
    snap["users"]["ids"].sort()
    snap["machines"] = {
        "count": db.machines.count_documents(
            {"id": {"$not": {"$regex": r"^demo-machine-"}}}
        ),
        "ids": [],
    }
    for m in db.machines.find(
        {"id": {"$not": {"$regex": r"^demo-machine-"}}}, {"_id": 0, "id": 1}
    ):
        if m.get("id"):
            snap["machines"]["ids"].append(str(m["id"]))
    snap["machines"]["ids"].sort()
    snap["service_requests"] = {
        "count": db.service_requests.count_documents(
            {"id": {"$not": {"$regex": r"^demo-sr-"}}}
        ),
        "ids": [],
    }
    for s in db.service_requests.find(
        {"id": {"$not": {"$regex": r"^demo-sr-"}}}, {"_id": 0, "id": 1}
    ):
        if s.get("id"):
            snap["service_requests"]["ids"].append(str(s["id"]))
    snap["service_requests"]["ids"].sort()
    snap["bookings"] = {
        "count": db.payment_intents.count_documents(
            {"booking_id": {"$not": {"$regex": r"^demo-booking-"}}}
        ),
        "booking_ids": [],
    }
    for p in db.payment_intents.find(
        {"booking_id": {"$not": {"$regex": r"^demo-booking-"}}},
        {"_id": 0, "booking_id": 1},
    ):
        bid = str(p.get("booking_id") or "")
        if bid:
            snap["bookings"]["booking_ids"].append(bid)
    snap["bookings"]["booking_ids"].sort()
    return snap


def _real_data_equals(before: Dict, after: Dict) -> bool:
    for coll in ["users", "machines", "service_requests", "bookings"]:
        if before[coll]["count"] != after[coll]["count"]:
            return False
        key = "ids" if coll != "bookings" else "booking_ids"
        if before[coll][key] != after[coll][key]:
            return False
    return True


def _demo_filter_users() -> Dict[str, Any]:
    return {
        "$and": [
            {
                "$or": [
                    {"id": {"$regex": r"^demo-"}},
                    {"email": {"$regex": DEMO_USER_EMAIL_REGEX}},
                ]
            },
            {"email": {"$ne": REAL_ADMIN_EMAIL}},
        ]
    }


def cleanup_demo(db) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    demo_sr_q = {
        "$or": [
            {"id": {"$regex": r"^demo-sr-"}},
            {"clientId": {"$in": list(DEMO_USER_IDS)}},
            {"providerId": {"$in": ["demo-1", "demo-2", "demo-3"]}},
            {"booking_id": {"$regex": r"^demo-booking-"}},
            {"bookingId": {"$regex": r"^demo-booking-"}},
        ]
    }
    demo_sr_ids: List[str] = []
    for r in db.service_requests.find(
        demo_sr_q, {"_id": 0, "id": 1, "booking_id": 1, "bookingId": 1}
    ):
        if r.get("id"):
            demo_sr_ids.append(str(r["id"]))
    demo_booking_ids: List[str] = []
    for r in db.service_requests.find(
        {"id": {"$in": demo_sr_ids}}, {"_id": 0, "booking_id": 1, "bookingId": 1}
    ):
        for key in ("booking_id", "bookingId"):
            v = str(r.get(key) or "").strip()
            if v and v not in demo_booking_ids:
                demo_booking_ids.append(v)
    counts["payments"] = db.payments.delete_many(
        {
            "$or": [
                {"booking_id": {"$in": demo_booking_ids}},
                {"bookingId": {"$in": demo_booking_ids}},
                {"service_request_id": {"$in": demo_sr_ids}},
                {"user_id": {"$in": list(DEMO_USER_IDS)}},
            ]
        }
    ).deleted_count
    pi_ids: List[str] = []
    for p in db.payment_intents.find(
        {"booking_id": {"$in": demo_booking_ids}}, {"_id": 0, "id": 1}
    ):
        if p.get("id"):
            pi_ids.append(str(p["id"]))
    counts["payment_intents"] = db.payment_intents.delete_many(
        {"booking_id": {"$in": demo_booking_ids}}
    ).deleted_count
    counts["refund_requests"] = 0
    if "refund_requests" in db.list_collection_names():
        counts["refund_requests"] = db.refund_requests.delete_many(
            {
                "$or": [
                    {"booking_id": {"$in": demo_booking_ids}},
                    {"service_request_id": {"$in": demo_sr_ids}},
                    {"payment_id": {"$in": pi_ids}},
                ]
            }
        ).deleted_count
    counts["notification_items"] = 0
    counts["notifications"] = 0
    if "notification_items" in db.list_collection_names():
        counts["notification_items"] = db.notification_items.delete_many(
            {
                "$or": [
                    {"user_id": {"$in": list(DEMO_USER_IDS)}},
                    {"booking_id": {"$in": demo_booking_ids}},
                    {"service_request_id": {"$in": demo_sr_ids}},
                ]
            }
        ).deleted_count
        if "notifications" in db.list_collection_names():
            counts["notifications"] = db.notifications.delete_many(
                {
                    "$or": [
                        {"user_id": {"$in": list(DEMO_USER_IDS)}},
                        {"booking_id": {"$in": demo_booking_ids}},
                        {"sr_id": {"$in": demo_sr_ids}},
                        {"service_request_id": {"$in": demo_sr_ids}},
                    ]
                }
            ).deleted_count
    user_demo_filter = _demo_filter_users()
    demo_user_ids_final: List[str] = []
    for u in db.users.find(user_demo_filter, {"_id": 0, "id": 1}):
        if u.get("id"):
            demo_user_ids_final.append(str(u["id"]))
    counts["sessions"] = 0
    counts["trusted_devices"] = 0
    counts["verification_codes"] = 0
    counts["password_reset_requests"] = 0
    counts["support_tickets"] = 0
    if "sessions" in db.list_collection_names():
        counts["sessions"] = db.sessions.delete_many(
            {"userId": {"$in": demo_user_ids_final}}
        ).deleted_count
    if "trusted_devices" in db.list_collection_names():
        counts["trusted_devices"] = db.trusted_devices.delete_many(
            {"userId": {"$in": demo_user_ids_final}}
        ).deleted_count
    if "verification_codes" in db.list_collection_names():
        counts["verification_codes"] = db.verification_codes.delete_many(
            {
                "$or": [
                    {"userId": {"$in": demo_user_ids_final}},
                    {"email": {"$regex": DEMO_USER_EMAIL_REGEX}},
                ]
            }
        ).deleted_count
    if "password_reset_requests" in db.list_collection_names():
        counts["password_reset_requests"] = db.password_reset_requests.delete_many(
            {"userId": {"$in": demo_user_ids_final}}
        ).deleted_count
    if "support_tickets" in db.list_collection_names():
        counts["support_tickets"] = db.support_tickets.delete_many(
            {
                "$or": [
                    {"user_id": {"$in": demo_user_ids_final}},
                    {"email": {"$regex": DEMO_USER_EMAIL_REGEX}},
                ]
            }
        ).deleted_count
    counts["service_requests"] = (
        db.service_requests.delete_many({"id": {"$in": demo_sr_ids}}).deleted_count
        if demo_sr_ids
        else 0
    )
    counts["machines"] = db.machines.delete_many(
        {
            "$or": [
                {"id": {"$regex": r"^demo-machine-"}},
                {"provider_id": {"$in": ["demo-1", "demo-2", "demo-3"]}},
            ]
        }
    ).deleted_count
    counts["invitations"] = db.invitations.delete_many(
        {
            "$or": [
                {"code": {"$in": list(DEMO_INVITATION_CODES)}},
                {"owner_id": {"$in": ["demo-1", "demo-2", "demo-3"]}},
            ]
        }
    ).deleted_count
    op_q = {
        "$or": [
            {"id": "demo-operator-001"},
            {"owner_id": {"$in": ["demo-1", "demo-2", "demo-3"]}},
            {
                "$and": [
                    {"email": {"$regex": DEMO_USER_EMAIL_REGEX}},
                    {"provider_role": "operator"},
                ]
            },
        ]
    }
    demo_operator_ids: List[str] = []
    for u in db.users.find(op_q, {"_id": 0, "id": 1}):
        if u.get("id"):
            demo_operator_ids.append(str(u["id"]))
    counts["demo_operators"] = (
        db.users.delete_many({"id": {"$in": demo_operator_ids}}).deleted_count
        if demo_operator_ids
        else 0
    )
    remaining_demo_user_ids: List[str] = [
        x for x in DEMO_USER_IDS if x != "demo-operator-001"
    ]
    for x in demo_user_ids_final:
        if x != "demo-operator-001" and x not in remaining_demo_user_ids:
            remaining_demo_user_ids.append(x)
    counts["demo_users"] = db.users.delete_many(
        {"id": {"$in": remaining_demo_user_ids}}
    ).deleted_count
    return counts


def _demo_remaining_count(db) -> Dict[str, int]:
    result: Dict[str, int] = {}
    result["demo_users"] = db.users.count_documents(_demo_filter_users())
    m1 = db.machines.count_documents(
        {"provider_id": {"$in": ["demo-1", "demo-2", "demo-3"]}}
    )
    m2 = db.machines.count_documents({"id": {"$regex": r"^demo-machine-"}})
    result["demo_machines"] = m1 + m2
    s1 = db.service_requests.count_documents(
        {"clientId": {"$in": list(DEMO_USER_IDS)}}
    )
    s2 = db.service_requests.count_documents({"id": {"$regex": r"^demo-sr-"}})
    result["demo_service_requests"] = s1 + s2
    result["demo_payment_intents"] = (
        db.payment_intents.count_documents(
            {"booking_id": {"$regex": r"^demo-booking-"}}
        )
        if "payment_intents" in db.list_collection_names()
        else 0
    )
    result["demo_invitations"] = db.invitations.count_documents(
        {"code": {"$in": list(DEMO_INVITATION_CODES)}}
    )
    admin = db.users.find_one({"email": REAL_ADMIN_EMAIL}, {"_id": 0, "id": 1})
    result["admin_real_present"] = 1 if admin else 0
    return result


class _DualAwaitable:
    def __init__(self, **attrs):
        for k, v in attrs.items():
            setattr(self, k, v)

    def __await__(self):
        return self._await_it().__await__()

    async def _await_it(self):
        return self


class _DualDict(dict):
    def __await__(self):
        return self._await_it().__await__()

    async def _await_it(self):
        return self


class _AwaitableNone:
    def __await__(self):
        return self._await_it().__await__()

    async def _await_it(self):
        return None

    def __bool__(self):
        return False

    def __eq__(self, other):
        return other is None

    def __repr__(self):
        return "None"


class _HybridCursor(list):
    async def to_list(self, length=None):
        if length is None or length <= 0:
            return list(self)
        return list(self[:length])


class FakeColl(list):
    def insert_one(self, doc):
        self.append(doc)
        return _DualAwaitable(inserted_id=doc.get("id"))

    def update_one(self, *a, **kw):
        matched = 0
        modified = 0
        upserted_id = None
        if len(a) >= 2:
            q = a[0]
            mod = a[1]
            docs = self.find(q)
            matched = len(docs)
            if matched and isinstance(mod, dict) and "$set" in mod:
                for doc in docs:
                    for k, v in mod["$set"].items():
                        doc[k] = v
                    modified += 1
            if matched == 0 and kw.get("upsert", False):
                set_doc = mod.get("$set", {}) if isinstance(mod, dict) else {}
                new_doc = dict(set_doc)
                if len(a) >= 1 and isinstance(a[0], dict):
                    for k, v in a[0].items():
                        if not isinstance(v, dict):
                            new_doc[k] = v
                self.append(new_doc)
                upserted_id = new_doc.get("id")
                matched = 1
                modified = 1
        return _DualAwaitable(
            matched_count=matched,
            modified_count=modified,
            upserted_id=upserted_id,
        )

    def find(self, query=None, projection=None):
        q = query if isinstance(query, dict) else {}
        out: List[dict] = []
        for doc in self:
            ok = True
            for k, v in q.items():
                clause_ok = True
                if k == "$or":
                    clause_ok = any(self._match(doc, c) for c in v)
                elif k == "$and":
                    clause_ok = all(self._match(doc, c) for c in v)
                else:
                    clause_ok = self._match(doc, {k: v})
                ok = ok and clause_ok
                if not ok:
                    break
            if ok:
                projected = dict(doc)
                if (
                    isinstance(projection, dict)
                    and projection.get("_id") == 0
                ):
                    projected.pop("_id", None)
                    keep = [
                        kk
                        for kk in projection
                        if kk != "_id" and projection[kk]
                    ]
                    if keep:
                        projected = {
                            kk: projected[kk]
                            for kk in keep
                            if kk in projected
                        }
                out.append(projected)
        return _HybridCursor(out)

    def _match(self, doc, clause) -> bool:
        for k, v in clause.items():
            val = doc.get(k)
            if isinstance(v, dict):
                if "$regex" in v:
                    if val is None:
                        return False
                    try:
                        if not re.search(v["$regex"], str(val)):
                            return False
                    except Exception:
                        return False
                elif "$ne" in v:
                    if val == v["$ne"]:
                        return False
                elif "$not" in v:
                    cond = v["$not"]
                    if isinstance(cond, dict) and "$regex" in cond:
                        if val and re.search(cond["$regex"], str(val)):
                            return False
                elif "$in" in v:
                    if val not in v["$in"]:
                        return False
            else:
                if isinstance(val, str) and isinstance(v, str):
                    if val != v:
                        return False
                else:
                    if val != v:
                        return False
        return True

    def find_one(self, query, projection=None):
        r = self.find(query, projection)
        if not r:
            return _AwaitableNone()
        return _DualDict(r[0])

    def count_documents(self, query):
        return len(self.find(query))

    def delete_many(self, query):
        q = query if isinstance(query, dict) else {}
        remaining = []
        deleted = 0
        for doc in self:
            matches = True
            for k, v in q.items():
                clause_ok = True
                if k == "$or":
                    clause_ok = any(self._match(doc, c) for c in v)
                elif k == "$and":
                    clause_ok = all(self._match(doc, c) for c in v)
                else:
                    clause_ok = self._match(doc, {k: v})
                matches = matches and clause_ok
                if not matches:
                    break
            if matches:
                deleted += 1
            else:
                remaining.append(doc)
        super().__init__(remaining)
        return _DualAwaitable(deleted_count=deleted)


class InMemoryDB:
    def __init__(self):
        self.users = FakeColl()
        self.machines = FakeColl()
        self.service_requests = FakeColl()
        self.payment_intents = FakeColl()
        self.payments = FakeColl()
        self.refund_requests = FakeColl()
        self.notification_items = FakeColl()
        self.notifications = FakeColl()
        self.sessions = FakeColl()
        self.trusted_devices = FakeColl()
        self.verification_codes = FakeColl()
        self.password_reset_requests = FakeColl()
        self.support_tickets = FakeColl()
        self.invitations = FakeColl()

    def list_collection_names(self):
        return [
            "users",
            "machines",
            "service_requests",
            "payment_intents",
            "payments",
            "refund_requests",
            "notification_items",
            "notifications",
            "sessions",
            "trusted_devices",
            "verification_codes",
            "password_reset_requests",
            "support_tickets",
            "invitations",
        ]


class TestDemoCleanupDeterministic(unittest.TestCase):
    def _mk_fixture_db(self) -> InMemoryDB:
        db = InMemoryDB()
        db.users.insert_one(
            {
                "id": "real-admin-uuid",
                "email": REAL_ADMIN_EMAIL,
                "role": "admin",
                "status": "active",
            }
        )
        db.users.insert_one(
            {
                "id": "real-user-uuid1",
                "email": "real@gmail.com",
                "role": "client",
                "status": "active",
            }
        )
        db.users.insert_one(
            {
                "id": "real-prov-uuid1",
                "email": "provreal@empresa.cl",
                "role": "provider",
                "status": "active",
            }
        )
        db.machines.insert_one(
            {
                "id": "real-machine-uuid1",
                "provider_id": "real-prov-uuid1",
                "status": "active",
            }
        )
        db.service_requests.insert_one(
            {
                "id": "sr-real-uuid",
                "clientId": "real-user-uuid1",
                "providerId": "real-prov-uuid1",
                "booking_id": "book-real-uuid",
            }
        )
        db.payment_intents.insert_one(
            {"id": "pi_real01", "booking_id": "book-real-uuid"}
        )
        db.payments.insert_one(
            {"id": "pay_real01", "booking_id": "book-real-uuid"}
        )
        db.sessions.insert_one({"userId": "real-user-uuid1", "token": "tkn1"})
        db.trusted_devices.insert_one(
            {"userId": "real-user-uuid1", "device": "movil"}
        )
        db.verification_codes.insert_one(
            {"userId": "real-user-uuid1", "code": "1234"}
        )
        db.password_reset_requests.insert_one({"userId": "real-user-uuid1"})
        db.support_tickets.insert_one(
            {"user_id": "real-user-uuid1", "subject": "consulta"}
        )
        db.invitations.insert_one(
            {"code": "REALINV", "owner_id": "real-prov-uuid1"}
        )
        db.notification_items.insert_one(
            {"id": "n1", "user_id": "real-user-uuid1"}
        )
        db.refund_requests.insert_one(
            {"id": "r1", "booking_id": "book-real-uuid"}
        )
        for uid in DEMO_USER_IDS:
            if uid == "demo-admin-001":
                db.users.insert_one(
                    {
                        "id": uid,
                        "email": "demo_admin@demo.cl",
                        "role": "admin",
                        "status": "test",
                    }
                )
            elif uid == "demo-operator-001":
                db.users.insert_one(
                    {
                        "id": uid,
                        "email": "operator@demo.cl",
                        "role": "provider",
                        "provider_role": "operator",
                        "owner_id": "demo-1",
                        "status": "test",
                    }
                )
            elif uid.startswith("demo-") and uid != "demo-client-001":
                db.users.insert_one(
                    {
                        "id": uid,
                        "email": uid + "@demo.cl",
                        "role": "provider",
                        "status": "test",
                    }
                )
            else:
                db.users.insert_one(
                    {
                        "id": uid,
                        "email": "cliente@demo.cl",
                        "role": "client",
                        "status": "test",
                    }
                )
        db.invitations.insert_one({"code": "DEMO01", "owner_id": "demo-1"})
        db.machines.insert_one(
            {"id": "demo-machine-001", "provider_id": "demo-1", "status": "active"}
        )
        db.service_requests.insert_one(
            {
                "id": "demo-sr-001",
                "clientId": "demo-client-001",
                "providerId": "demo-1",
                "booking_id": "demo-booking-001",
            }
        )
        db.payment_intents.insert_one(
            {"id": "pi_demo1", "booking_id": "demo-booking-001"}
        )
        db.payments.insert_one(
            {"id": "pay_demo1", "booking_id": "demo-booking-001"}
        )
        db.notification_items.insert_one(
            {"id": "n2", "booking_id": "demo-booking-001"}
        )
        db.sessions.insert_one(
            {"userId": "demo-client-001", "token": "tokdemo"}
        )
        db.verification_codes.insert_one(
            {"userId": "demo-admin-001", "email": "demo_admin@demo.cl"}
        )
        db.support_tickets.insert_one(
            {"email": "cliente@demo.cl", "subject": "demo ticket"}
        )
        db.refund_requests.insert_one({"booking_id": "demo-booking-001"})
        return db

    def test_admin_real_untouched_and_protected(self):
        db = self._mk_fixture_db()
        before = db.users.find_one({"email": REAL_ADMIN_EMAIL})
        self.assertIsNotNone(before)
        before_snap = _db_collections_snapshot(db)
        counts = cleanup_demo(db)
        total = sum(counts.values())
        self.assertGreater(total, 0, "cleanup no eliminó nada")
        after_snap = _db_collections_snapshot(db)
        self.assertTrue(
            _real_data_equals(before_snap, after_snap),
            msg=f"real data changed before={before_snap} after={after_snap}",
        )
        remaining = _demo_remaining_count(db)
        for coll, c in remaining.items():
            if coll == "admin_real_present":
                self.assertEqual(c, 1, "admin real fue borrado!")
                continue
            self.assertEqual(
                c, 0, msg=f"demo en {coll}: {c} restantes. counts={counts}"
            )

    def test_cleanup_uses_only_deterministic_filters_no_timestamps(self):
        this_path = os.path.abspath(__file__)
        src = open(this_path).read()
        func_body = src.split("def cleanup_demo", 1)[1].split(
            "def _demo_remaining_count", 1
        )[0]
        self.assertNotIn("createdAt", func_body)
        a = "crea"
        b = "ted_after"
        c = "time"
        d = "delta"
        self.assertNotIn(a + b, func_body)
        self.assertNotIn(c + d, func_body)

    def test_operator_demo_deterministic_id_after_invite_with_operator_id(self):
        sys.path.insert(
            0,
            os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            ),
        )
        from routes.operators import _ensure_pending_team_user
        import routes.operators as ops

        async def _check():
            db_test = InMemoryDB()
            old_db = ops.db
            ops.db = db_test
            try:
                out_normal = await _ensure_pending_team_user(
                    owner_id="real-prov-uuid1",
                    provider_role="operator",
                    name="Operador Real Normal",
                    phone="+56911112222",
                    rut="11.111.111-1",
                    invitation_code="NORMINV",
                )
                self.assertNotEqual(str(out_normal["id"]), "demo-operator-001")
                self.assertFalse(str(out_normal["id"]).startswith("demo"))
                out_demo = await _ensure_pending_team_user(
                    owner_id="demo-1",
                    provider_role="operator",
                    name="Operador QA DEMO",
                    phone="+56900000000",
                    rut="00.000.000-K",
                    invitation_code="DEMO01",
                    email="operator@demo.cl",
                    operator_id="demo-operator-001",
                )
                self.assertEqual(out_demo["id"], "demo-operator-001")
                self.assertEqual(out_demo.get("email"), "operator@demo.cl")
                again = await _ensure_pending_team_user(
                    owner_id="demo-1",
                    provider_role="operator",
                    name="Operador QA DEMO",
                    phone="+56900000000",
                    rut="00.000.000-K",
                    invitation_code="DEMO02",
                    email="operator@demo.cl",
                    operator_id="demo-operator-001",
                )
                self.assertEqual(again["id"], "demo-operator-001")
                cnt = db_test.users.count_documents({"id": "demo-operator-001"})
                self.assertEqual(cnt, 1, "operador demo duplicado")
                db_test.users.insert_one(
                    {
                        "id": "demo-1",
                        "email": "demo-1@demo.cl",
                        "role": "provider",
                        "status": "test",
                    }
                )
                cleanup_demo(db_test)
                remaining = _demo_remaining_count(db_test)
                self.assertEqual(remaining.get("demo_users", 0), 0, f"demo_users after clean: {remaining}")
                op_found = db_test.users.find_one({"id": "demo-operator-001"})
                self.assertFalse(op_found, "demo operator no fue borrado por cleanup: " + repr(op_found))
            finally:
                ops.db = old_db

        asyncio.run(_check())


if __name__ == "__main__":
    unittest.main()
