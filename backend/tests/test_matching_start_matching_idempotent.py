import asyncio
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch


class FakeUpdateResult:
    def __init__(self, matched_count: int, modified_count: int):
        self.matched_count = matched_count
        self.modified_count = modified_count


def _elem_match(arr, cond):
    for item in arr or []:
        ok = True
        for k, v in (cond or {}).items():
            if item.get(k) != v:
                ok = False
                break
        if ok:
            return True
    return False


def _matches(doc: dict, query: dict) -> bool:
    for k, v in (query or {}).items():
        if k == "$and":
            if not all(_matches(doc, sub) for sub in v):
                return False
            continue
        if k == "$or":
            if not any(_matches(doc, sub) for sub in v):
                return False
            continue
        if isinstance(v, dict):
            for op, op_val in v.items():
                if op == "$exists":
                    exists = k in doc
                    if bool(op_val) != exists:
                        return False
                elif op == "$lte":
                    cur = doc.get(k)
                    if cur is None:
                        return False
                    if cur > op_val:
                        return False
                elif op == "$not":
                    if "$elemMatch" in op_val:
                        if _elem_match(doc.get(k), op_val["$elemMatch"]):
                            return False
                    else:
                        raise AssertionError(f"Unsupported $not payload: {op_val}")
                elif op == "$elemMatch":
                    if not _elem_match(doc.get(k), op_val):
                        return False
                else:
                    raise AssertionError(f"Unsupported op {op} for key {k}")
            continue
        if doc.get(k) != v:
            return False
    return True


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = list(docs or [])
        self._lock = asyncio.Lock()

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if _matches(d, query):
                return dict(d)
        return None

    async def update_one(self, query, update, array_filters=None):
        async with self._lock:
            for idx, d in enumerate(self.docs):
                if _matches(d, query):
                    new_doc = dict(d)
                    if "$set" in update:
                        for sk, sv in update["$set"].items():
                            new_doc[sk] = sv
                    if "$unset" in update:
                        for uk in update["$unset"].keys():
                            if uk in new_doc:
                                del new_doc[uk]
                    self.docs[idx] = new_doc
                    return FakeUpdateResult(1, 1)
            return FakeUpdateResult(0, 0)


class FakeDB:
    def __init__(self, service_requests_docs=None, users_docs=None):
        self.service_requests = FakeCollection(service_requests_docs)
        self.users = FakeCollection(users_docs)


class TestStartMatchingIdempotent(unittest.IsolatedAsyncioTestCase):
    async def test_start_matching_twice_does_not_duplicate_offer(self):
        now = datetime.now(timezone.utc).replace(microsecond=0)
        db = FakeDB(
            service_requests_docs=[
                {
                    "id": "sr1",
                    "status": "matching",
                    "location": {"lat": -33.45, "lng": -70.66},
                    "machineryType": "excavadora",
                    "matchingAttempts": [],
                }
            ]
        )

        async def fake_get_available_providers(db_arg, machinery_type, request_location, excluded_ids):
            return [{"id": "p1", "name": "Proveedor", "rating": 5.0, "_distance_km": 1.2}]

        call_count = {"n": 0}

        async def fake_send_offer_to_provider(db_arg, service_request_id, provider_id):
            call_count["n"] += 1
            exp = now + timedelta(seconds=60)
            for i, d in enumerate(db_arg.service_requests.docs):
                if d.get("id") == service_request_id:
                    nd = dict(d)
                    nd["status"] = "offer_sent"
                    nd["currentOfferId"] = provider_id
                    nd["offeredProviderIds"] = [provider_id]
                    nd["offerSentAt"] = now.isoformat()
                    nd["offerExpiresAt"] = exp.isoformat()
                    nd["matchingAttempts"] = list(nd.get("matchingAttempts") or []) + [
                        {"providerId": provider_id, "sentAt": now.isoformat(), "expiresAt": exp.isoformat(), "status": "pending"}
                    ]
                    db_arg.service_requests.docs[i] = nd
                    break
            return {"providerId": provider_id, "sentAt": now.isoformat(), "expiresAt": exp.isoformat(), "timeoutSeconds": 60}

        from services.matching_service import start_matching

        with patch("services.matching_service.get_available_providers", fake_get_available_providers), patch(
            "services.matching_service.send_offer_to_provider", fake_send_offer_to_provider
        ):
            out1 = await start_matching(db, "sr1")
            out2 = await start_matching(db, "sr1")

        self.assertEqual(out1.get("status"), "offer_sent")
        self.assertEqual(out2.get("status"), "skipped")
        self.assertEqual(call_count["n"], 1)
        sr = await db.service_requests.find_one({"id": "sr1"})
        self.assertIsNotNone(sr)
        self.assertEqual(sr.get("status"), "offer_sent")
        self.assertEqual(len(sr.get("matchingAttempts") or []), 1)
        self.assertEqual(sr.get("offeredProviderIds"), ["p1"])
        self.assertTrue("matchingLock" not in sr)
        self.assertTrue("matchingLockAt" not in sr)

    async def test_lock_removed_when_no_providers(self):
        db = FakeDB(
            service_requests_docs=[
                {
                    "id": "sr2",
                    "status": "matching",
                    "location": {"lat": -33.45, "lng": -70.66},
                    "machineryType": "excavadora",
                    "matchingAttempts": [],
                }
            ]
        )

        async def fake_get_available_providers(db_arg, machinery_type, request_location, excluded_ids):
            return []

        from services.matching_service import start_matching

        with patch("services.matching_service.get_available_providers", fake_get_available_providers):
            out = await start_matching(db, "sr2")

        self.assertEqual(out.get("status"), "no_providers_available")
        sr = await db.service_requests.find_one({"id": "sr2"})
        self.assertIsNotNone(sr)
        self.assertEqual(sr.get("status"), "no_providers_available")
        self.assertTrue("matchingLock" not in sr)
        self.assertTrue("matchingLockAt" not in sr)

    async def test_lock_removed_on_exception(self):
        db = FakeDB(
            service_requests_docs=[
                {
                    "id": "sr3",
                    "status": "matching",
                    "location": {"lat": -33.45, "lng": -70.66},
                    "machineryType": "excavadora",
                    "matchingAttempts": [],
                }
            ]
        )

        async def boom(*args, **kwargs):
            raise RuntimeError("boom")

        from services.matching_service import start_matching

        with patch("services.matching_service.get_available_providers", boom):
            with self.assertRaises(RuntimeError):
                await start_matching(db, "sr3")

        sr = await db.service_requests.find_one({"id": "sr3"})
        self.assertIsNotNone(sr)
        self.assertEqual(sr.get("status"), "matching")
        self.assertTrue("matchingLock" not in sr)
        self.assertTrue("matchingLockAt" not in sr)

    async def test_concurrent_calls_only_one_executes(self):
        now = datetime.now(timezone.utc).replace(microsecond=0)
        db = FakeDB(
            service_requests_docs=[
                {
                    "id": "sr4",
                    "status": "matching",
                    "location": {"lat": -33.45, "lng": -70.66},
                    "machineryType": "excavadora",
                    "matchingAttempts": [],
                }
            ]
        )

        gate = asyncio.Event()

        async def fake_get_available_providers(db_arg, machinery_type, request_location, excluded_ids):
            await gate.wait()
            return [{"id": "p1", "name": "Proveedor", "rating": 5.0, "_distance_km": 1.2}]

        async def fake_send_offer_to_provider(db_arg, service_request_id, provider_id):
            exp = now + timedelta(seconds=60)
            for i, d in enumerate(db_arg.service_requests.docs):
                if d.get("id") == service_request_id:
                    nd = dict(d)
                    nd["status"] = "offer_sent"
                    nd["currentOfferId"] = provider_id
                    nd["offeredProviderIds"] = [provider_id]
                    nd["offerSentAt"] = now.isoformat()
                    nd["offerExpiresAt"] = exp.isoformat()
                    nd["matchingAttempts"] = list(nd.get("matchingAttempts") or []) + [
                        {"providerId": provider_id, "sentAt": now.isoformat(), "expiresAt": exp.isoformat(), "status": "pending"}
                    ]
                    db_arg.service_requests.docs[i] = nd
                    break
            return {"providerId": provider_id, "sentAt": now.isoformat(), "expiresAt": exp.isoformat(), "timeoutSeconds": 60}

        from services.matching_service import start_matching

        with patch("services.matching_service.get_available_providers", fake_get_available_providers), patch(
            "services.matching_service.send_offer_to_provider", fake_send_offer_to_provider
        ):
            t1 = asyncio.create_task(start_matching(db, "sr4"))
            await asyncio.sleep(0)
            t2 = asyncio.create_task(start_matching(db, "sr4"))
            await asyncio.sleep(0)
            out2 = await t2
            self.assertEqual(out2.get("status"), "skipped")
            gate.set()
            out1 = await t1
            self.assertEqual(out1.get("status"), "offer_sent")

        sr = await db.service_requests.find_one({"id": "sr4"})
        self.assertIsNotNone(sr)
        self.assertEqual(len(sr.get("matchingAttempts") or []), 1)
        self.assertTrue("matchingLock" not in sr)
        self.assertTrue("matchingLockAt" not in sr)


if __name__ == "__main__":
    unittest.main()
