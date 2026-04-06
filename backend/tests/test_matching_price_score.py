"""Influencia suave de precio vs referencia (matching_score)."""
import unittest

from services.matching_score import (
    W_REFERENCE_PRICE_SOFT,
    calculate_price_score,
    compute_provider_score,
    reference_price_for_machinery,
)


class TestCalculatePriceScore(unittest.TestCase):
    def test_at_reference(self):
        self.assertAlmostEqual(calculate_price_score(80000, 80000), 1.0)

    def test_clamped_high_ratio(self):
        # ref/price = 2 → clamped to 1.1
        self.assertAlmostEqual(calculate_price_score(40000, 80000), 1.1)

    def test_clamped_low_ratio(self):
        # ref/price = 0.5 → clamped to 0.6
        self.assertAlmostEqual(calculate_price_score(160000, 80000), 0.6)

    def test_missing_returns_default(self):
        self.assertEqual(calculate_price_score(0, 80000), 0.8)
        self.assertEqual(calculate_price_score(80000, 0), 0.8)


class TestReferencePriceForMachinery(unittest.TestCase):
    def test_known_hourly(self):
        r = reference_price_for_machinery("retroexcavadora")
        self.assertEqual(r, 80000)

    def test_known_service(self):
        r = reference_price_for_machinery("camion_tolva")
        self.assertEqual(r, 240000)

    def test_unknown_returns_none(self):
        self.assertIsNone(reference_price_for_machinery("tipo_inexistente_xyz"))


class TestComputeProviderScoreSoftTerm(unittest.TestCase):
    def test_soft_term_adds_bounded(self):
        ctx = {
            "min_price": 50000,
            "max_price": 150000,
            "min_distance": 1,
            "max_distance": 10,
        }
        provider = {
            "price": 100000.0,
            "distance_km": 5.0,
            "responsiveness_rate": 0.5,
            "acceptance_rate": 0.5,
        }
        base = compute_provider_score(provider, ctx, reference_price=None)
        with_ref = compute_provider_score(provider, ctx, reference_price=80000.0)
        self.assertGreater(with_ref, base)
        self.assertLessEqual(with_ref - base, W_REFERENCE_PRICE_SOFT * 1.1 + 1e-9)


if __name__ == "__main__":
    unittest.main()
