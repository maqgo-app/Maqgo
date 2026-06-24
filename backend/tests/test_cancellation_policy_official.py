import unittest


class TestOfficialCancellationPolicy(unittest.TestCase):
    def test_calculate_client_cancellation_fee_tiers(self):
        from pricing.business_rules import calculate_client_cancellation_fee

        self.assertEqual(calculate_client_cancellation_fee(100_000, 0)["fee_amount"], 0)
        self.assertEqual(calculate_client_cancellation_fee(100_000, 60)["fee_amount"], 0)
        self.assertEqual(calculate_client_cancellation_fee(100_000, 60.01)["fee_amount"], 20_000)
        self.assertEqual(calculate_client_cancellation_fee(100_000, 120)["fee_amount"], 20_000)
        self.assertEqual(calculate_client_cancellation_fee(100_000, 120.01)["fee_amount"], 40_000)

    def test_calculate_client_cancellation_fee_percent(self):
        from pricing.business_rules import calculate_client_cancellation_fee

        self.assertEqual(calculate_client_cancellation_fee(1, 0)["fee_percent"], 0.0)
        self.assertEqual(calculate_client_cancellation_fee(1, 61)["fee_percent"], 0.20)
        self.assertEqual(calculate_client_cancellation_fee(1, 121)["fee_percent"], 0.40)

