import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch


class FakeUpdateResult:
    def __init__(self, matched_count: int, modified_count: int):
        self.matched_count = matched_count
        self.modified_count = modified_count


def _matches(doc: dict, query: dict) -> bool:
    for key, value in (query or {}).items():
        if isinstance(value, dict):
            for op, op_val in value.items():
                if op == "$in":
                    if doc.get(key) not in op_val:
                        return False
                else:
                    raise AssertionError(f"Unsupported operator {op} for key {key}")
            continue
        if doc.get(key) != value:
            return False
    return True


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = list(docs or [])

    async def find_one(self, query, projection=None):
        for doc in self.docs:
            if _matches(doc, query):
                return dict(doc)
        return None

    async def update_one(self, query, update):
        for idx, doc in enumerate(self.docs):
            if not _matches(doc, query):
                continue
            new_doc = dict(doc)
            if "$set" in update:
                for key, value in update["$set"].items():
                    new_doc[key] = value
            if "$push" in update:
                for key, value in update["$push"].items():
                    current = list(new_doc.get(key) or [])
                    if isinstance(value, dict) and "$each" in value:
                        current.extend(list(value.get("$each") or []))
                    else:
                        current.append(value)
                    new_doc[key] = current
            if "$inc" in update:
                for key, value in update["$inc"].items():
                    new_doc[key] = int(new_doc.get(key) or 0) + int(value or 0)
            self.docs[idx] = new_doc
            return FakeUpdateResult(1, 1)
        return FakeUpdateResult(0, 0)


class FakeDB:
    def __init__(self, service_requests_docs=None):
        self.service_requests = FakeCollection(service_requests_docs)


class TestMatchingRotationWaves(unittest.IsolatedAsyncioTestCase):
    async def test_send_rotation_wave_one_initializes_wave3_as_pending(self):
        from services.matching_service import send_rotation_wave_one

        db = FakeDB(
            service_requests_docs=[
                {
                    "id": "sr-wave-init",
                    "status": "matching",
                    "matchingAttempts": [],
                    "events": [],
                }
            ]
        )
        providers = [{"id": f"p{i}", "name": f"Proveedor {i}", "rating": 5.0, "_distance_km": i} for i in range(1, 6)]

        async def fake_notify(*args, **kwargs):
            return None

        with patch("services.matching_service._notify_provider_offer", fake_notify):
            result = await send_rotation_wave_one(db, "sr-wave-init", providers)

        self.assertEqual(result.get("status"), "offer_sent")
        sr = await db.service_requests.find_one({"id": "sr-wave-init"})
        self.assertIsNotNone(sr)
        self.assertEqual(sr.get("matchingRotationStage"), 1)
        self.assertEqual(sr.get("offeredProviderIds"), ["p1", "p2", "p3"])
        self.assertFalse(sr.get("matchingWave2Applied"))
        self.assertFalse(sr.get("matchingWave3Applied"))

    async def test_apply_matching_rotation_waves_adds_fourth_then_fifth_provider(self):
        from services.matching_service import apply_matching_rotation_waves

        now = datetime.now(timezone.utc).replace(microsecond=0)
        db = FakeDB(
            service_requests_docs=[
                {
                    "id": "sr-wave-apply",
                    "status": "offer_sent",
                    "matchingRotationMode": True,
                    "matchingCandidateIds": ["p1", "p2", "p3", "p4", "p5"],
                    "matchingRotationStage": 1,
                    "matchingRotationStartedAt": (now - timedelta(minutes=30)).isoformat(),
                    "matchingRotationWave2At": (now - timedelta(minutes=20)).isoformat(),
                    "matchingRotationWave3At": (now - timedelta(minutes=10)).isoformat(),
                    "matchingWave2Applied": False,
                    "matchingWave3Applied": False,
                    "offeredProviderIds": ["p1", "p2", "p3"],
                    "matchingAttempts": [
                        {"providerId": "p1", "status": "pending"},
                        {"providerId": "p2", "status": "pending"},
                        {"providerId": "p3", "status": "pending"},
                    ],
                    "events": [],
                    "attemptCount": 3,
                    "offerExpiresAt": (now + timedelta(minutes=15)).isoformat(),
                }
            ]
        )

        async def identity_filter(db_arg, provider_ids):
            return list(provider_ids or [])

        notified = []

        async def fake_notify(db_arg, provider_id, service_request_id, kind, occurred_at):
            notified.append((provider_id, service_request_id, kind))
            return None

        with patch("services.matching_service.filter_valid_providers_for_wave", identity_filter), patch(
            "services.matching_service._notify_provider_offer", fake_notify
        ):
            await apply_matching_rotation_waves(db, "sr-wave-apply")

        sr = await db.service_requests.find_one({"id": "sr-wave-apply"})
        self.assertIsNotNone(sr)
        self.assertEqual(sr.get("matchingRotationStage"), 3)
        self.assertTrue(sr.get("matchingWave2Applied"))
        self.assertTrue(sr.get("matchingWave3Applied"))
        self.assertEqual(sr.get("offeredProviderIds"), ["p1", "p2", "p3", "p4", "p5"])
        self.assertEqual([attempt.get("providerId") for attempt in sr.get("matchingAttempts") or []], ["p1", "p2", "p3", "p4", "p5"])
        self.assertEqual(sr.get("attemptCount"), 5)
        self.assertEqual([event.get("providerIds") for event in sr.get("events") or [] if event.get("type") == "matching_rotation_wave_added"], [["p4"], ["p5"]])
        self.assertEqual([pid for pid, _, _ in notified], ["p4", "p5"])


if __name__ == "__main__":
    unittest.main()
