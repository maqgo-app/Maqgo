import unittest

from services.user_location_service import location_meta_from_user, normalize_user_location, update_user_location


class UpdateResult:
    def __init__(self, matched_count):
        self.matched_count = matched_count


class FakeUsers:
    def __init__(self, docs):
        self.docs = docs

    async def update_one(self, query, update):
        for doc in self.docs:
            if doc.get("id") == query.get("id"):
                doc.update(update.get("$set", {}))
                return UpdateResult(1)
        return UpdateResult(0)


class FakeDb:
    def __init__(self, docs):
        self.users = FakeUsers(docs)


class TestNormalizeUserLocation(unittest.TestCase):
    def test_normalizes_location_with_server_timestamp_and_source(self):
        loc = normalize_user_location(
            {"lat": "-33.45", "lng": "-70.66", "updatedAt": "client-value", "source": "client"},
            "availability",
            now_iso="2026-01-01T00:00:00+00:00",
        )

        self.assertEqual(loc["lat"], -33.45)
        self.assertEqual(loc["lng"], -70.66)
        self.assertEqual(loc["updatedAt"], "2026-01-01T00:00:00+00:00")
        self.assertEqual(loc["source"], "availability")

    def test_rejects_invalid_source(self):
        with self.assertRaises(ValueError):
            normalize_user_location({"lat": -33.45, "lng": -70.66}, "frontend")

    def test_rejects_missing_coordinates(self):
        with self.assertRaises(ValueError):
            normalize_user_location({"lat": -33.45}, "profile_update")


class TestLocationMeta(unittest.TestCase):
    def test_location_meta_from_user(self):
        meta = location_meta_from_user(
            {
                "location": {
                    "lat": -33.45,
                    "lng": -70.66,
                    "updatedAt": "2026-01-01T00:00:00+00:00",
                    "source": "profile_update",
                }
            }
        )

        self.assertEqual(meta["updatedAt"], "2026-01-01T00:00:00+00:00")
        self.assertEqual(meta["source"], "profile_update")
        self.assertFalse(meta["isStale"])

    def test_location_meta_without_location(self):
        meta = location_meta_from_user({})

        self.assertIsNone(meta["updatedAt"])
        self.assertIsNone(meta["source"])
        self.assertFalse(meta["isStale"])


class TestUpdateUserLocation(unittest.IsolatedAsyncioTestCase):
    async def test_update_user_location_writes_normalized_location(self):
        docs = [{"id": "u1"}]
        db = FakeDb(docs)

        loc = await update_user_location(db, "u1", {"lat": -33.45, "lng": -70.66}, "profile_update")

        self.assertEqual(docs[0]["location"], loc)
        self.assertEqual(docs[0]["location"]["source"], "profile_update")
        self.assertIn("updatedAt", docs[0]["location"])

    async def test_update_user_location_missing_user(self):
        db = FakeDb([])

        with self.assertRaises(LookupError):
            await update_user_location(db, "missing", {"lat": -33.45, "lng": -70.66}, "profile_update")


if __name__ == "__main__":
    unittest.main()
