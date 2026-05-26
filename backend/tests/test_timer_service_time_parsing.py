import sys
import types
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch


class FakeUpdateResult:
    def __init__(self, modified_count: int):
        self.modified_count = modified_count


def _matches(doc: dict, query: dict) -> bool:
    for k, v in query.items():
        if k == "$or":
            if not any(_matches(doc, sub) for sub in v):
                return False
            continue
        if k == "$and":
            if not all(_matches(doc, sub) for sub in v):
                return False
            continue
        if isinstance(v, dict):
            for op, op_val in v.items():
                if op == "$in":
                    if doc.get(k) not in op_val:
                        return False
                elif op == "$ne":
                    if doc.get(k) == op_val:
                        return False
                elif op == "$exists":
                    exists = k in doc
                    if bool(op_val) != exists:
                        return False
                else:
                    raise AssertionError(f"Unsupported query operator for key={k}: {v}")
            continue
        if doc.get(k) != v:
            return False
    return True


class FakeCursor:
    def __init__(self, docs):
        self._docs = list(docs)
        self._i = 0

    def sort(self, spec):
        items = []
        if isinstance(spec, (list, tuple)):
            items = list(spec)
        else:
            items = [(spec, 1)]
        def _k(doc):
            out = []
            for field, direction in items:
                val = doc.get(field)
                out.append(val)
            return tuple(out)
        reverse = False
        if items and items[0][1] in (-1, "desc", "DESC"):
            reverse = True
        self._docs.sort(key=_k, reverse=reverse)
        return self

    async def to_list(self, n):
        return self._docs[:n]

    def __aiter__(self):
        self._i = 0
        return self

    async def __anext__(self):
        if self._i >= len(self._docs):
            raise StopAsyncIteration
        val = self._docs[self._i]
        self._i += 1
        return val


class FakeCollection:
    def __init__(self, initial_docs=None):
        self.docs = list(initial_docs or [])

    def find(self, query, projection=None):
        return FakeCursor([d for d in self.docs if _matches(d, query)])

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if _matches(d, query):
                return dict(d)
        return None

    async def update_one(self, query, update):
        for idx, d in enumerate(self.docs):
            if _matches(d, query):
                new_doc = dict(d)
                if "$set" in update:
                    for sk, sv in update["$set"].items():
                        new_doc[sk] = sv
                if "$push" in update:
                    for pk, pv in update["$push"].items():
                        cur = list(new_doc.get(pk, [])) if isinstance(new_doc.get(pk), list) else []
                        cur.append(pv)
                        new_doc[pk] = cur
                self.docs[idx] = new_doc
                return FakeUpdateResult(1)
        return FakeUpdateResult(0)


class FakeDB:
    def __init__(self, service_requests_docs=None, users_docs=None):
        self.service_requests = FakeCollection(service_requests_docs)
        self.users = FakeCollection(users_docs)
        self.services = FakeCollection([])


class TestTimerServiceTimeHotfix(unittest.IsolatedAsyncioTestCase):
    def _install_fake_modules(self):
        pricing_rules = types.ModuleType("pricing.business_rules")
        pricing_rules.CONFIRMED_NO_ARRIVAL_TIMEOUT_MINUTES = 120
        sys.modules["pricing.business_rules"] = pricing_rules

        refund_mod = types.ModuleType("services.refund_request_service")

        class RefundRequestService:
            def __init__(self, db):
                self.db = db

            async def create_request(self, **kwargs):
                return None

        refund_mod.RefundRequestService = RefundRequestService
        sys.modules["services.refund_request_service"] = refund_mod

        comm_mod = types.ModuleType("communications")

        def send_whatsapp(**kwargs):
            return {"success": True, "disabled": True}

        comm_mod.send_whatsapp = send_whatsapp
        sys.modules["communications"] = comm_mod

        push_mod = types.ModuleType("services.webpush_service")

        async def notify_service_event(db, user_id, service_id, kind, payload):
            return {"sent": 0, "skipped": 1}

        push_mod.notify_service_event = notify_service_event
        sys.modules["services.webpush_service"] = push_mod

    async def asyncSetUp(self):
        self._install_fake_modules()

    def test_parse_datetime_formats(self):
        from services.timer_service import _parse_offer_expires_at_utc

        dt_z = _parse_offer_expires_at_utc("2026-05-20T10:00:00Z")
        self.assertIsNotNone(dt_z)
        self.assertEqual(dt_z.tzinfo, timezone.utc)

        dt_off = _parse_offer_expires_at_utc("2026-05-20T10:00:00+00:00")
        self.assertIsNotNone(dt_off)
        self.assertEqual(dt_off.tzinfo, timezone.utc)
        self.assertEqual(dt_z, dt_off)

        dt_real = _parse_offer_expires_at_utc(datetime(2026, 5, 20, 10, 0, 0, tzinfo=timezone.utc))
        self.assertEqual(dt_real, dt_z)

        dt_naive = _parse_offer_expires_at_utc(datetime(2026, 5, 20, 10, 0, 0))
        self.assertEqual(dt_naive, dt_z)

        with self.assertLogs("services.timer_service", level="WARNING") as cm:
            bad = _parse_offer_expires_at_utc("not-a-date")
        self.assertIsNone(bad)
        self.assertTrue(any("no parseable" in line for line in cm.output))

    async def test_check_confirmed_no_arrival_timeout_mixed_formats(self):
        from services.timer_service import TimerService

        now = datetime.now(timezone.utc).replace(microsecond=0)
        past = now - timedelta(hours=3)
        past_iso = past.isoformat()
        past_z = past_iso.replace("+00:00", "Z")

        db = FakeDB(
            service_requests_docs=[
                {"id": "a", "status": "confirmed", "confirmedAt": past_z, "totalAmount": 0},
                {"id": "b", "status": "confirmed", "confirmedAt": past_iso, "totalAmount": 0},
                {"id": "c", "status": "confirmed", "confirmedAt": past, "totalAmount": 0},
                {"id": "d", "status": "confirmed", "confirmedAt": past.replace(tzinfo=None), "totalAmount": 0},
                {"id": "e", "status": "confirmed", "confirmedAt": "not-a-date", "totalAmount": 0},
            ]
        )

        svc = TimerService(db)
        cancelled = await svc.check_confirmed_no_arrival_timeout()
        self.assertEqual(cancelled, 4)
        statuses = {d["id"]: d.get("status") for d in db.service_requests.docs}
        self.assertEqual(statuses["a"], "cancelled_no_arrival")
        self.assertEqual(statuses["b"], "cancelled_no_arrival")
        self.assertEqual(statuses["c"], "cancelled_no_arrival")
        self.assertEqual(statuses["d"], "cancelled_no_arrival")
        self.assertEqual(statuses["e"], "confirmed")

    async def test_check_auto_start_post_arrival_mixed_formats(self):
        from services.timer_service import TimerService

        now = datetime.now(timezone.utc).replace(microsecond=0)
        past = now - timedelta(hours=2)
        past_iso = past.isoformat()
        past_z = past_iso.replace("+00:00", "Z")

        db = FakeDB(
            service_requests_docs=[
                {"id": "a", "status": "confirmed", "arrivalDetectedAt": past_z},
                {"id": "b", "status": "confirmed", "arrivalDetectedAt": past_iso},
                {"id": "c", "status": "confirmed", "arrivalDetectedAt": past},
                {"id": "d", "status": "confirmed", "arrivalDetectedAt": past.replace(tzinfo=None)},
                {"id": "e", "status": "confirmed", "arrivalDetectedAt": "not-a-date"},
            ]
        )

        svc = TimerService(db)
        updated = await svc.check_auto_start_post_arrival()
        self.assertEqual(updated, 4)
        statuses = {d["id"]: d.get("status") for d in db.service_requests.docs}
        self.assertEqual(statuses["a"], "in_progress")
        self.assertEqual(statuses["b"], "in_progress")
        self.assertEqual(statuses["c"], "in_progress")
        self.assertEqual(statuses["d"], "in_progress")
        self.assertEqual(statuses["e"], "confirmed")

    async def test_check_last_30_services_mixed_formats(self):
        from services.timer_service import TimerService

        now = datetime.now(timezone.utc).replace(microsecond=0)
        soon = now + timedelta(minutes=10)
        soon_iso = soon.isoformat()
        soon_z = soon_iso.replace("+00:00", "Z")

        late = now + timedelta(hours=3)

        db = FakeDB(
            service_requests_docs=[
                {"id": "a", "status": "in_progress", "endTime": soon_z},
                {"id": "b", "status": "in_progress", "endTime": soon_iso},
                {"id": "c", "status": "in_progress", "endTime": soon},
                {"id": "d", "status": "in_progress", "endTime": soon.replace(tzinfo=None)},
                {"id": "e", "status": "in_progress", "endTime": "not-a-date"},
                {"id": "f", "status": "in_progress", "endTime": late.isoformat()},
            ]
        )

        svc = TimerService(db)
        updated = await svc.check_last_30_services()
        self.assertEqual(updated, 4)
        statuses = {d["id"]: d.get("status") for d in db.service_requests.docs}
        self.assertEqual(statuses["a"], "last_30")
        self.assertEqual(statuses["b"], "last_30")
        self.assertEqual(statuses["c"], "last_30")
        self.assertEqual(statuses["d"], "last_30")
        self.assertEqual(statuses["e"], "in_progress")
        self.assertEqual(statuses["f"], "in_progress")

    async def test_check_finished_services_mixed_formats(self):
        from services.timer_service import TimerService

        now = datetime.now(timezone.utc).replace(microsecond=0)
        past = now - timedelta(minutes=10)
        past_iso = past.isoformat()
        past_z = past_iso.replace("+00:00", "Z")

        future = now + timedelta(hours=2)

        db = FakeDB(
            service_requests_docs=[
                {"id": "a", "status": "in_progress", "providerId": "p1", "clientId": "c1", "endTime": past_z, "totalAmount": 0},
                {"id": "b", "status": "last_30", "providerId": "p1", "clientId": "c1", "endTime": past_iso, "totalAmount": 0},
                {"id": "c", "status": "in_progress", "providerId": "p1", "clientId": "c1", "endTime": past, "totalAmount": 0},
                {"id": "d", "status": "in_progress", "providerId": "p1", "clientId": "c1", "endTime": past.replace(tzinfo=None), "totalAmount": 0},
                {"id": "e", "status": "in_progress", "providerId": "p1", "clientId": "c1", "endTime": "not-a-date", "totalAmount": 0},
                {"id": "f", "status": "in_progress", "providerId": "p1", "clientId": "c1", "endTime": future.isoformat(), "totalAmount": 0},
            ],
            users_docs=[{"id": "p1", "location": {"lat": -33.0, "lng": -70.0}}, {"id": "c1", "phone": "+56911111111"}],
        )

        svc = TimerService(db)
        finished = await svc.check_finished_services()
        self.assertEqual(finished, 4)
        statuses = {d["id"]: d.get("status") for d in db.service_requests.docs}
        self.assertEqual(statuses["a"], "finished")
        self.assertEqual(statuses["b"], "finished")
        self.assertEqual(statuses["c"], "finished")
        self.assertEqual(statuses["d"], "finished")
        self.assertEqual(statuses["e"], "in_progress")
        self.assertEqual(statuses["f"], "in_progress")

    async def test_provider_release_when_no_other_active(self):
        from services.timer_service import TimerService

        now = datetime.now(timezone.utc).replace(microsecond=0)
        past = (now - timedelta(minutes=5)).isoformat()

        db = FakeDB(
            service_requests_docs=[
                {"id": "s1", "status": "in_progress", "providerId": "p1", "clientId": "c1", "endTime": past, "totalAmount": 0},
            ],
            users_docs=[
                {"id": "p1", "location": {"lat": -33.0, "lng": -70.0}, "isAvailable": False},
                {"id": "c1", "phone": "+56911111111"},
            ],
        )
        svc = TimerService(db)
        finished = await svc.check_finished_services()
        self.assertEqual(finished, 1)
        provider = await db.users.find_one({"id": "p1"})
        self.assertIsNotNone(provider)
        self.assertEqual(provider.get("isAvailable"), True)

    async def test_provider_release_skipped_when_other_active_exists(self):
        from services.timer_service import TimerService

        now = datetime.now(timezone.utc).replace(microsecond=0)
        past = (now - timedelta(minutes=5)).isoformat()
        future = (now + timedelta(hours=2)).isoformat()

        for active_status in ("confirmed", "in_progress"):
            with self.subTest(active_status=active_status):
                db = FakeDB(
                    service_requests_docs=[
                        {"id": "s1", "status": "in_progress", "providerId": "p1", "clientId": "c1", "endTime": past, "totalAmount": 0},
                        {
                            "id": "s2",
                            "status": active_status,
                            "providerId": "p1",
                            "clientId": "c2",
                            "endTime": (future if active_status == "in_progress" else past),
                            "totalAmount": 0,
                        },
                    ],
                    users_docs=[
                        {"id": "p1", "location": {"lat": -33.0, "lng": -70.0}, "isAvailable": False},
                        {"id": "c1", "phone": "+56911111111"},
                        {"id": "c2", "phone": "+56922222222"},
                    ],
                )
                svc = TimerService(db)
                finished = await svc.check_finished_services()
                self.assertEqual(finished, 1)
                provider = await db.users.find_one({"id": "p1"})
                self.assertIsNotNone(provider)
                self.assertEqual(provider.get("isAvailable"), False)

    async def test_backlog_last_30_processes_more_than_100(self):
        from services.timer_service import TimerService

        now = datetime.now(timezone.utc).replace(microsecond=0)
        soon = (now + timedelta(minutes=5)).isoformat()
        docs = [{"id": f"s{i}", "status": "in_progress", "endTime": soon} for i in range(150)]
        db = FakeDB(service_requests_docs=docs)
        svc = TimerService(db)
        updated = await svc.check_last_30_services()
        self.assertEqual(updated, 150)
        self.assertTrue(all(d.get("status") == "last_30" for d in db.service_requests.docs))

    async def test_backlog_finished_processes_more_than_100(self):
        from services.timer_service import TimerService

        now = datetime.now(timezone.utc).replace(microsecond=0)
        past = (now - timedelta(minutes=5)).isoformat()
        docs = [
            {
                "id": f"s{i}",
                "status": "in_progress",
                "providerId": None,
                "clientId": "c1",
                "endTime": past,
                "totalAmount": 0,
            }
            for i in range(150)
        ]
        db = FakeDB(
            service_requests_docs=docs,
            users_docs=[{"id": "c1", "phone": "+56911111111"}],
        )
        svc = TimerService(db)
        finished = await svc.check_finished_services()
        self.assertEqual(finished, 150)
        self.assertTrue(all(d.get("status") == "finished" for d in db.service_requests.docs))

    async def test_backlog_expired_offers_processes_more_than_100(self):
        from services.timer_service import TimerService

        now = datetime.now(timezone.utc).replace(microsecond=0)
        past = (now - timedelta(minutes=5)).isoformat()
        docs = [
            {
                "id": f"s{i}",
                "status": "offer_sent",
                "currentOfferId": f"offer-{i}",
                "offerExpiresAt": past,
                "matchingRotationMode": False,
            }
            for i in range(150)
        ]
        db = FakeDB(service_requests_docs=docs)
        svc = TimerService(db)

        calls = []

        async def _handle_offer_expired(db_arg, sid, offer_id):
            calls.append((sid, offer_id))

        async def _handle_parallel_offers_expired(db_arg, sid):
            raise AssertionError("should not be called")

        async def _handle_rotation_round_expired(db_arg, sid):
            raise AssertionError("should not be called")

        with patch("services.matching_service.handle_offer_expired", _handle_offer_expired), patch(
            "services.matching_service.handle_parallel_offers_expired", _handle_parallel_offers_expired
        ), patch("services.matching_service.handle_rotation_round_expired", _handle_rotation_round_expired):
            expired = await svc.check_expired_offers()

        self.assertEqual(expired, 150)
        self.assertEqual(len(calls), 150)


if __name__ == "__main__":
    unittest.main()
