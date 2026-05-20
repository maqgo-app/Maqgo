import unittest

from services.location_resolver import resolve_machine_location


def _get_path(doc, key):
    cur = doc
    for part in key.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def _matches(doc, query):
    for key, expected in (query or {}).items():
        actual = _get_path(doc, key)
        if isinstance(expected, dict):
            if "$ne" in expected and actual == expected["$ne"]:
                return False
            if "$in" in expected and actual not in expected["$in"]:
                return False
        elif actual != expected:
            return False
    return True


class FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, _limit):
        return [dict(doc) for doc in self.docs]


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = list(docs or [])

    async def find_one(self, query, _projection=None):
        for doc in self.docs:
            if _matches(doc, query):
                return dict(doc)
        return None

    def find(self, query, _projection=None):
        return FakeCursor([dict(doc) for doc in self.docs if _matches(doc, query)])


class FakeDb:
    def __init__(self, *, machines=None, users=None, service_requests=None):
        self.machines = FakeCollection(machines)
        self.users = FakeCollection(users)
        self.service_requests = FakeCollection(service_requests)


class TestResolveMachineLocation(unittest.IsolatedAsyncioTestCase):
    async def test_prefers_oem_gps_over_provider_address(self):
        db = FakeDb(
            machines=[
                {
                    "id": "mach-1",
                    "provider_id": "prov-1",
                    "status": "active",
                    "oemGps": {"lat": -33.1, "lng": -70.1, "updatedAt": "2026-01-01T00:00:00Z"},
                }
            ],
            users=[
                {
                    "id": "prov-1",
                    "providerData": {"addressLat": -33.9, "addressLng": -70.9},
                }
            ],
        )

        loc = await resolve_machine_location(db, machine_id="mach-1")

        self.assertTrue(loc["found"])
        self.assertEqual(loc["source"], "oem_gps")
        self.assertEqual(loc["lat"], -33.1)
        self.assertEqual(loc["lng"], -70.1)

    async def test_uses_machine_physical_gps_when_no_oem(self):
        db = FakeDb(
            machines=[
                {
                    "id": "mach-2",
                    "provider_id": "prov-1",
                    "status": "active",
                    "location": {"lat": -33.2, "lng": -70.2},
                }
            ],
            users=[{"id": "prov-1"}],
        )

        loc = await resolve_machine_location(db, machine_id="mach-2")

        self.assertEqual(loc["source"], "machine_gps")
        self.assertEqual(loc["lat"], -33.2)
        self.assertEqual(loc["lng"], -70.2)

    async def test_uses_confirmed_departure_gps_before_provider_fallback(self):
        db = FakeDb(
            machines=[{"id": "mach-3", "provider_id": "prov-1", "status": "active"}],
            users=[{"id": "prov-1", "location": {"lat": -33.8, "lng": -70.8}}],
            service_requests=[
                {
                    "id": "sr-1",
                    "confirmedDepartureLocation": {
                        "lat": -33.3,
                        "lng": -70.3,
                        "source": "gps",
                        "confirmedAt": "2026-01-01T00:00:00Z",
                        "confirmedByUserId": "op-1",
                    },
                }
            ],
        )

        loc = await resolve_machine_location(db, machine_id="mach-3", service_request_id="sr-1")

        self.assertEqual(loc["source"], "operator_confirmed_departure")
        self.assertEqual(loc["freshness"], "event")
        self.assertEqual(loc["lat"], -33.3)
        self.assertEqual(loc["lng"], -70.3)

    async def test_uses_operator_location_when_machine_has_assigned_operator(self):
        db = FakeDb(
            machines=[
                {
                    "id": "mach-4",
                    "provider_id": "prov-1",
                    "status": "active",
                    "operators": [{"id": "op-1"}],
                }
            ],
            users=[
                {"id": "prov-1", "providerData": {"addressLat": -33.9, "addressLng": -70.9}},
                {
                    "id": "op-1",
                    "owner_id": "prov-1",
                    "provider_role": "operator",
                    "location": {"lat": -33.4, "lng": -70.4},
                    "locationUpdatedAt": "2026-01-01T00:00:00Z",
                },
            ],
        )

        loc = await resolve_machine_location(db, machine_id="mach-4")

        self.assertEqual(loc["source"], "operator_gps")
        self.assertEqual(loc["lat"], -33.4)
        self.assertEqual(loc["lng"], -70.4)

    async def test_falls_back_to_provider_address(self):
        db = FakeDb(
            machines=[{"id": "mach-5", "provider_id": "prov-1", "status": "active"}],
            users=[
                {
                    "id": "prov-1",
                    "providerData": {"addressLat": -33.5, "addressLng": -70.5},
                }
            ],
        )

        loc = await resolve_machine_location(db, machine_id="mach-5")

        self.assertEqual(loc["source"], "provider_address")
        self.assertEqual(loc["freshness"], "static")
        self.assertEqual(loc["lat"], -33.5)
        self.assertEqual(loc["lng"], -70.5)

    async def test_returns_unavailable_without_sources(self):
        db = FakeDb(machines=[], users=[], service_requests=[])

        loc = await resolve_machine_location(db, machine_id="missing", provider_id="missing")

        self.assertFalse(loc["found"])
        self.assertEqual(loc["source"], "unavailable")


if __name__ == "__main__":
    unittest.main()
