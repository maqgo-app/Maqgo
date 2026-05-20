import unittest
from datetime import datetime, timezone

from services.matching_service import location_confidence_from_provider


NOW = datetime(2026, 1, 2, 12, 0, 0, tzinfo=timezone.utc)


class TestLocationConfidenceFromProvider(unittest.TestCase):
    def test_missing_location_is_low(self):
        self.assertEqual(location_confidence_from_provider({}, now=NOW), "low")

    def test_missing_updated_at_is_low(self):
        self.assertEqual(
            location_confidence_from_provider({"location": {"lat": -33.45, "lng": -70.66}}, now=NOW),
            "low",
        )

    def test_under_two_hours_is_high(self):
        self.assertEqual(
            location_confidence_from_provider(
                {"location": {"lat": -33.45, "lng": -70.66, "updatedAt": "2026-01-02T10:30:00+00:00"}},
                now=NOW,
            ),
            "high",
        )

    def test_between_two_and_twenty_four_hours_is_medium(self):
        self.assertEqual(
            location_confidence_from_provider(
                {"location": {"lat": -33.45, "lng": -70.66, "updatedAt": "2026-01-02T03:00:00+00:00"}},
                now=NOW,
            ),
            "medium",
        )

    def test_over_twenty_four_hours_is_low(self):
        self.assertEqual(
            location_confidence_from_provider(
                {"location": {"lat": -33.45, "lng": -70.66, "updatedAt": "2026-01-01T11:59:00+00:00"}},
                now=NOW,
            ),
            "low",
        )


if __name__ == "__main__":
    unittest.main()
