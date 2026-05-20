import unittest
from datetime import datetime, timezone, timedelta

from services.matching_service import _provider_dispatch_location


class TestProviderDispatchLocationFreshness(unittest.TestCase):
    def test_machine_gps_online_wins(self):
        now = datetime.now(timezone.utc)
        provider = {
            "machineData": {
                "location": {"lat": -33.45, "lng": -70.66},
                "locationSource": "gps",
                "locationUpdatedAt": now - timedelta(seconds=60),
            },
            "location": {"lat": -33.0, "lng": -70.0},
            "providerData": {"addressLat": -32.0, "addressLng": -71.0},
        }
        out = _provider_dispatch_location(provider)
        self.assertEqual(out["source"], "gps")
        self.assertEqual(out["freshness"], "gps_online")
        self.assertAlmostEqual(out["lat"], -33.45)

    def test_machine_gps_stale_falls_back_to_depot(self):
        now = datetime.now(timezone.utc)
        provider = {
            "machineData": {
                "location": {"lat": -33.45, "lng": -70.66},
                "locationSource": "gps",
                "locationUpdatedAt": now - timedelta(hours=8),
            },
            "providerData": {"addressLat": -32.0, "addressLng": -71.0},
        }
        out = _provider_dispatch_location(provider)
        self.assertEqual(out["source"], "depot")
        self.assertEqual(out["freshness"], "depot")
        self.assertAlmostEqual(out["lat"], -32.0)

    def test_provider_gps_stale_falls_back_to_depot(self):
        now = datetime.now(timezone.utc)
        provider = {
            "location": {"lat": -33.45, "lng": -70.66},
            "locationSource": "gps",
            "locationUpdatedAt": now - timedelta(hours=8),
            "providerData": {"addressLat": -32.0, "addressLng": -71.0},
        }
        out = _provider_dispatch_location(provider)
        self.assertEqual(out["source"], "depot")
        self.assertEqual(out["freshness"], "depot")

    def test_provider_gps_stale_kept_when_no_depot(self):
        now = datetime.now(timezone.utc)
        provider = {
            "location": {"lat": -33.45, "lng": -70.66},
            "locationSource": "gps",
            "locationUpdatedAt": now - timedelta(hours=8),
        }
        out = _provider_dispatch_location(provider)
        self.assertEqual(out["source"], "gps")
        self.assertEqual(out["freshness"], "gps_stale")

    def test_manual_location_without_timestamp_is_last_known(self):
        provider = {
            "location": {"lat": -33.45, "lng": -70.66},
            "locationSource": "manual",
        }
        out = _provider_dispatch_location(provider)
        self.assertEqual(out["source"], "manual")
        self.assertEqual(out["freshness"], "last_known")


if __name__ == "__main__":
    unittest.main()

