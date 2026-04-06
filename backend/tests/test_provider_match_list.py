"""Ranking lista visible /providers/match."""
import unittest

from services.provider_match_list import (
    MIN_SCORE_AFTER_PENALTY,
    calculate_match_score,
    company_key_from_row,
    enforce_diversity_ranked,
    get_price_bucket,
    get_response_penalty,
)


class TestCalculateMatchScore(unittest.TestCase):
    def test_in_range(self):
        row = {
            "distance": 5.0,
            "accepted_services": 5,
            "rejected_services": 5,
            "response_time_avg": 30,
            "price_per_hour": 80000,
        }
        s = calculate_match_score(row, reference_price=80000.0, max_distance=10.0)
        self.assertGreater(s, 0)
        self.assertLessEqual(s, 1.1)

    def test_slow_response_reduces_score(self):
        base_row = {
            "distance": 5.0,
            "accepted_services": 5,
            "rejected_services": 5,
            "response_time_avg": 10,
            "price_per_hour": 80000,
        }
        slow_row = {**base_row, "response_time_avg": 100}
        s_fast = calculate_match_score(base_row, reference_price=80000.0, max_distance=10.0)
        s_slow = calculate_match_score(slow_row, reference_price=80000.0, max_distance=10.0)
        self.assertGreater(s_fast, s_slow)

    def test_final_score_respects_floor(self):
        row = {
            "distance": 0.1,
            "accepted_services": 0,
            "rejected_services": 0,
            "response_time_avg": 120,
            "price_per_hour": 80000,
        }
        s = calculate_match_score(row, reference_price=80000.0, max_distance=10.0)
        self.assertGreaterEqual(s, MIN_SCORE_AFTER_PENALTY)


class TestGetResponsePenalty(unittest.TestCase):
    def test_no_time_no_penalty(self):
        self.assertEqual(get_response_penalty({"response_time_avg": None}), 1.0)

    def test_very_slow(self):
        self.assertEqual(get_response_penalty({"response_time_avg": 100}), 0.8)


class TestEnforceDiversity(unittest.TestCase):
    def test_fills_up_to_limit(self):
        ranked = [
            {"id": "1", "name": "A", "price_per_hour": 80000},
            {"id": "2", "name": "B", "price_per_hour": 80000},
            {"id": "3", "name": "C", "price_per_hour": 80000},
            {"id": "4", "name": "D", "price_per_hour": 82000},
            {"id": "5", "name": "E", "price_per_hour": 240000},
            {"id": "6", "name": "F", "price_per_hour": 250000},
        ]
        out = enforce_diversity_ranked(ranked, limit=5, reference_price=80000.0)
        self.assertEqual(len(out), 5)
        ids = {p["id"] for p in out}
        self.assertEqual(len(ids), 5)

    def test_fallback_when_buckets_full(self):
        ranked = [
            {"id": "1", "name": "A", "price_per_hour": 50000},
            {"id": "2", "name": "B", "price_per_hour": 51000},
            {"id": "3", "name": "C", "price_per_hour": 52000},
        ]
        out = enforce_diversity_ranked(ranked, limit=3, reference_price=50000.0)
        self.assertEqual(len(out), 3)

    def test_get_price_bucket_relative(self):
        self.assertEqual(get_price_bucket(80000, 80000.0), 5)
        self.assertEqual(get_price_bucket(40000, 80000.0), 2)
        self.assertEqual(get_price_bucket(0, 80000.0), 0)

    def test_company_key_prefers_company_id(self):
        self.assertEqual(
            company_key_from_row({"companyId": "acme-1", "name": "Foo"}),
            "acme-1",
        )
        self.assertEqual(company_key_from_row({"name": "  Acme SpA  "}), "acme spa")


if __name__ == "__main__":
    unittest.main()
