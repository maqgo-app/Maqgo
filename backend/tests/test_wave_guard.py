import unittest
from datetime import datetime, timezone, timedelta

from services.matching_service import apply_matching_rotation_waves, send_rotation_wave_one, validate_provider_for_wave


def _matches(doc, query):
    for key, expected in (query or {}).items():
        actual = doc.get(key)
        if isinstance(expected, dict):
            if "$in" in expected and actual not in expected["$in"]:
                return False
            if "$ne" in expected and actual == expected["$ne"]:
                return False
            if "$exists" in expected and (key in doc) != bool(expected["$exists"]):
                return False
        elif actual != expected:
            return False
    return True


class Result:
    def __init__(self, matched_count=1):
        self.matched_count = matched_count
        self.modified_count = matched_count


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = list(docs or [])

    async def find_one(self, query, _projection=None):
        for doc in self.docs:
            if _matches(doc, query):
                return dict(doc)
        return None

    async def update_one(self, query, update):
        for doc in self.docs:
            if _matches(doc, query):
                if "$set" in update:
                    doc.update(update["$set"])
                if "$push" in update:
                    for key, val in update["$push"].items():
                        arr = doc.setdefault(key, [])
                        if isinstance(val, dict) and "$each" in val:
                            arr.extend(val["$each"])
                        else:
                            arr.append(val)
                if "$inc" in update:
                    for key, val in update["$inc"].items():
                        doc[key] = doc.get(key, 0) + val
                if "$unset" in update:
                    for key in update["$unset"].keys():
                        doc.pop(key, None)
                return Result(1)
        return Result(0)


class FakeDb:
    def __init__(self, *, users=None, service_requests=None):
        self.users = FakeCollection(users)
        self.service_requests = FakeCollection(service_requests)


class TestValidateProviderForWave(unittest.IsolatedAsyncioTestCase):
    async def test_available_provider_without_active_service_is_valid(self):
        db = FakeDb(users=[{"id": "p1", "isAvailable": True}])

        self.assertTrue(await validate_provider_for_wave("p1", db))

    async def test_unavailable_provider_is_invalid(self):
        db = FakeDb(users=[{"id": "p1", "isAvailable": False}])

        self.assertFalse(await validate_provider_for_wave("p1", db))

    async def test_deleted_provider_is_invalid(self):
        db = FakeDb(users=[{"id": "p1", "isAvailable": True, "status": "deleted"}])

        self.assertFalse(await validate_provider_for_wave("p1", db))

    async def test_active_service_blocks_provider(self):
        db = FakeDb(
            users=[{"id": "p1", "isAvailable": True}],
            service_requests=[{"id": "sr-active", "providerId": "p1", "status": "confirmed"}],
        )

        self.assertFalse(await validate_provider_for_wave("p1", db))


class TestWaveGuardFiltering(unittest.IsolatedAsyncioTestCase):
    async def test_wave_one_filters_invalid_provider_and_preserves_candidate_ids(self):
        providers = [
            {"id": "p1", "name": "P1", "_distance_km": 1, "locationConfidence": "high"},
            {"id": "p2", "name": "P2", "_distance_km": 2, "locationConfidence": "low"},
            {"id": "p3", "name": "P3", "_distance_km": 3, "locationConfidence": "medium"},
        ]
        db = FakeDb(
            users=[
                {"id": "p1", "isAvailable": False},
                {"id": "p2", "isAvailable": True},
                {"id": "p3", "isAvailable": True},
            ],
            service_requests=[{"id": "sr1"}],
        )

        result = await send_rotation_wave_one(db, "sr1", providers)
        stored = db.service_requests.docs[0]

        self.assertEqual(stored["matchingCandidateIds"], ["p1", "p2", "p3"])
        self.assertEqual(stored["offeredProviderIds"], ["p2"])
        self.assertEqual(stored["matchingAttempts"][0]["providerId"], "p2")
        self.assertEqual(result["offer"]["providerIds"], ["p2"])
        self.assertEqual(result["offer"]["skippedProviderIds"], ["p1"])

    async def test_empty_wave_two_is_marked_applied_without_attempts(self):
        now = datetime.now(timezone.utc)
        db = FakeDb(
            users=[
                {"id": "p3", "isAvailable": False},
                {"id": "p4", "isAvailable": False},
            ],
            service_requests=[
                {
                    "id": "sr2",
                    "status": "offer_sent",
                    "matchingRotationMode": True,
                    "matchingCandidateIds": ["p1", "p2", "p3", "p4", "p5"],
                    "offeredProviderIds": ["p1", "p2"],
                    "matchingWave2Applied": False,
                    "matchingWave3Applied": False,
                    "matchingRotationStartedAt": (now - timedelta(minutes=3)).isoformat(),
                    "matchingRotationWave2At": (now - timedelta(minutes=1)).isoformat(),
                    "matchingRotationWave3At": (now + timedelta(minutes=1)).isoformat(),
                    "offerExpiresAt": (now + timedelta(minutes=30)).isoformat(),
                    "matchingAttempts": [],
                }
            ],
        )

        await apply_matching_rotation_waves(db, "sr2")
        stored = db.service_requests.docs[0]

        self.assertTrue(stored["matchingWave2Applied"])
        self.assertEqual(stored["matchingRotationStage"], 2)
        self.assertEqual(stored["offeredProviderIds"], ["p1", "p2"])
        self.assertEqual(stored["matchingAttempts"], [])


if __name__ == "__main__":
    unittest.main()
