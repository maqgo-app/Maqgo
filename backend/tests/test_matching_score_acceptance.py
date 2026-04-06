"""Aceptación en ranking: penaliza no-respuesta (matchingOffersExpired), no rechazos."""
import sys
import os
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.matching_score import acceptance_rate_from_provider  # noqa: E402


class TestMatchingScoreAcceptance(unittest.TestCase):
    def test_neutral_without_history(self):
        self.assertEqual(acceptance_rate_from_provider({}), 0.5)

    def test_rejections_do_not_affect_ranking(self):
        # Muchos rechazos no entran al denominador; con 0 expiradas → 100% si hay aceptaciones
        r = acceptance_rate_from_provider(
            {"acceptedServices": 2, "rejectedServices": 100, "matchingOffersExpired": 0}
        )
        self.assertEqual(r, 1.0)
        r2 = acceptance_rate_from_provider({"acceptedServices": 0, "rejectedServices": 50})
        self.assertEqual(r2, 0.5)

    def test_no_response_affects_rate(self):
        r = acceptance_rate_from_provider({"acceptedServices": 1, "matchingOffersExpired": 1})
        self.assertEqual(r, 0.5)

    def test_only_accepts_perfect(self):
        r = acceptance_rate_from_provider({"acceptedServices": 5, "matchingOffersExpired": 0})
        self.assertEqual(r, 1.0)


if __name__ == "__main__":
    unittest.main()
