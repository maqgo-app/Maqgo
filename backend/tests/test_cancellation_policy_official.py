import unittest
from datetime import datetime, timedelta, timezone


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

    def test_today_committed_time_prefers_first_eta(self):
        from pricing.business_rules import today_committed_time_utc

        base = datetime(2026, 7, 10, 12, 0, 0, tzinfo=timezone.utc)
        first = (base - timedelta(hours=1)).isoformat()
        latest = base.isoformat()
        out = today_committed_time_utc(
            eta_first_confirmed_at=first,
            eta_first_commit_minutes=30,
            eta_confirmed_at=latest,
            eta_commit_minutes=120,
            confirmed_at=None,
            accepted_at=None,
            created_at=None,
        )
        self.assertEqual(out, datetime.fromisoformat(first) + timedelta(minutes=30))

    def test_incident_protected_minutes_used_total_includes_active_elapsed(self):
        from pricing.business_rules import incident_protected_minutes_used_total

        now = datetime(2026, 7, 10, 12, 0, 0, tzinfo=timezone.utc)
        stats = {"protectedMinutesUsedTotal": 10}
        active = {
            "reportedAt": (now - timedelta(minutes=5)).isoformat(),
            "protectedWindowEnd": (now + timedelta(minutes=25)).isoformat(),
            "protectedWindowMinutes": 30,
        }
        total = incident_protected_minutes_used_total(
            incident_stats=stats,
            active_incident=active,
            now=now,
        )
        self.assertEqual(total, 15.0)
