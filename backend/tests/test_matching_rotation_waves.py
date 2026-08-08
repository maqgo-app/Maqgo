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
    async def test_send_rotation_wave_one_sends_all_top_five_as_first_wave(self):
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
        self.assertEqual(sr.get("offeredProviderIds"), ["p1", "p2", "p3", "p4", "p5"])
        self.assertEqual(sr.get("matchingWaveSizes"), {"1": 5, "2": 0, "3": 0})
        self.assertFalse(sr.get("matchingWave2Applied"))
        self.assertFalse(sr.get("matchingWave3Applied"))

    async def test_send_rotation_wave_one_with_three_providers_sends_all_three(self):
        from services.matching_service import send_rotation_wave_one

        db = FakeDB(
            service_requests_docs=[
                {
                    "id": "sr-wave-init-3",
                    "status": "matching",
                    "matchingAttempts": [],
                    "events": [],
                }
            ]
        )
        providers = [{"id": f"p{i}", "name": f"Proveedor {i}", "rating": 5.0, "_distance_km": i} for i in range(1, 4)]

        async def fake_notify(*args, **kwargs):
            return None

        with patch("services.matching_service._notify_provider_offer", fake_notify):
            result = await send_rotation_wave_one(db, "sr-wave-init-3", providers)

        self.assertEqual(result.get("status"), "offer_sent")
        sr = await db.service_requests.find_one({"id": "sr-wave-init-3"})
        self.assertIsNotNone(sr)
        self.assertEqual(sr.get("offeredProviderIds"), ["p1", "p2", "p3"])
        self.assertEqual(sr.get("matchingWaveSizes"), {"1": 3, "2": 0, "3": 0})

    async def test_apply_matching_rotation_waves_adds_batch_2_and_batch_3_after_first_5(self):
        from services.matching_service import apply_matching_rotation_waves

        now = datetime.now(timezone.utc).replace(microsecond=0)
        db = FakeDB(
            service_requests_docs=[
                {
                    "id": "sr-wave-apply",
                    "status": "offer_sent",
                    "matchingRotationMode": True,
                    "matchingCandidateIds": [f"p{i}" for i in range(1, 13)],
                    "matchingRotationStage": 1,
                    "matchingRotationStartedAt": (now - timedelta(minutes=45)).isoformat(),
                    "matchingRotationWave2At": (now - timedelta(minutes=30)).isoformat(),
                    "matchingRotationWave3At": (now - timedelta(minutes=15)).isoformat(),
                    "matchingWave2Applied": False,
                    "matchingWave3Applied": False,
                    "offeredProviderIds": [f"p{i}" for i in range(1, 6)],
                    "matchingAttempts": [
                        {"providerId": f"p{i}", "status": "pending"}
                        for i in range(1, 6)
                    ],
                    "events": [],
                    "attemptCount": 5,
                    "offerExpiresAt": (now + timedelta(minutes=15)).isoformat(),
                    "matchingWaveSizes": {"1": 5, "2": 5, "3": 2},
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
        self.assertEqual(sr.get("offeredProviderIds"), [f"p{i}" for i in range(1, 13)])
        self.assertEqual(
            [attempt.get("providerId") for attempt in sr.get("matchingAttempts") or []],
            [f"p{i}" for i in range(1, 13)],
        )
        self.assertEqual(sr.get("attemptCount"), 12)
        wave_events = [ev for ev in (sr.get("events") or []) if ev.get("type") == "matching_rotation_wave_added"]
        self.assertEqual([ev.get("providerIds") for ev in wave_events], [
            [f"p{i}" for i in range(6, 11)],
            [f"p{i}" for i in range(11, 13)],
        ])
        self.assertEqual([pid for pid, _, _ in notified], [f"p{i}" for i in range(6, 13)])


if __name__ == "__main__":
    unittest.main()
