import unittest


class TestOfficialCancellationPolicy(unittest.TestCase):
    def test_scheduled_cancellation_percent_tiers(self):
        from pricing.business_rules import scheduled_cancellation_percent

        self.assertEqual(scheduled_cancellation_percent(hours_until_start=49), 0.0)
        self.assertEqual(scheduled_cancellation_percent(hours_until_start=48), 0.10)
        self.assertEqual(scheduled_cancellation_percent(hours_until_start=24.01), 0.10)
        self.assertEqual(scheduled_cancellation_percent(hours_until_start=24), 0.20)
        self.assertEqual(scheduled_cancellation_percent(hours_until_start=0), 0.20)

    def test_cancellation_fee_from_percent(self):
        from pricing.business_rules import cancellation_fee_from_percent

        self.assertEqual(cancellation_fee_from_percent(100_000, 0.0)["fee_amount"], 0)
        self.assertEqual(cancellation_fee_from_percent(100_000, 0.10)["fee_amount"], 10_000)
        self.assertEqual(cancellation_fee_from_percent(100_000, 0.20)["fee_amount"], 20_000)
        self.assertEqual(cancellation_fee_from_percent(100_000, 1.0)["fee_amount"], 100_000)
