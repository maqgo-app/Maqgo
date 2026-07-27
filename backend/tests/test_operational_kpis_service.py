import unittest
from datetime import datetime, timedelta, timezone

from services.operational_kpis_service import build_operational_kpis_snapshot_from_docs
from services.operational_kpis_store import inc_metric, sum_metric


class FakeCursor:
    def __init__(self, docs):
        self._docs = list(docs or [])

    async def to_list(self, length):
        if length is None:
            return list(self._docs)
        return list(self._docs[:length])


class FakeCollection:
    def __init__(self):
        self.docs = {}

    async def create_index(self, *args, **kwargs):
        return None

    async def update_one(self, query, update, upsert=False):
        key = query.get("_id")
        doc = dict(self.docs.get(key) or {})
        if "$inc" in update:
            for field, delta in update["$inc"].items():
                doc[field] = int(doc.get(field) or 0) + int(delta or 0)
        if "$set" in update:
            for field, value in update["$set"].items():
                doc[field] = value
        if "$setOnInsert" in update and key not in self.docs:
            for field, value in update["$setOnInsert"].items():
                doc.setdefault(field, value)
        self.docs[key] = doc
        return None

    def find(self, query, projection=None):
        ids = set(((query or {}).get("_id") or {}).get("$in") or [])
        rows = []
        for key, doc in self.docs.items():
            if ids and key not in ids:
                continue
            if projection:
                row = {}
                for field, include in projection.items():
                    if not include:
                        continue
                    row[field] = doc.get(field)
                rows.append(row)
            else:
                rows.append(dict(doc))
        return FakeCursor(rows)


class FakeDB:
    def __init__(self):
        self.operational_kpi_counters_daily = FakeCollection()

    def __getitem__(self, name):
        return getattr(self, name)


class TestOperationalKpis(unittest.IsolatedAsyncioTestCase):
    def test_build_operational_kpis_snapshot_from_docs(self):
        start_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
        end_at = start_at + timedelta(days=7)
        service_requests = [
            {
                "id": "sr1",
                "createdAt": (start_at + timedelta(hours=1)).isoformat(),
                "confirmedAt": (start_at + timedelta(hours=1, minutes=10)).isoformat(),
                "providerId": "prov1",
                "status": "confirmed",
                "matchingAttempts": [
                    {"providerId": "prov1", "sentAt": (start_at + timedelta(hours=1, minutes=1)).isoformat(), "status": "accepted"},
                    {"providerId": "prov2", "sentAt": (start_at + timedelta(hours=1, minutes=2)).isoformat(), "status": "rejected"},
                ],
                "events": [
                    {"type": "matching_rotation_wave_added", "stage": 2, "at": (start_at + timedelta(hours=1, minutes=3)).isoformat()},
                    {"type": "no_arrival_alert_120", "at": (start_at + timedelta(hours=2)).isoformat()},
                    {"type": "no_arrival_alert_120", "at": (start_at + timedelta(hours=2, minutes=5)).isoformat()},
                ],
            },
            {
                "id": "sr2",
                "createdAt": (start_at + timedelta(hours=3)).isoformat(),
                "confirmedAt": (start_at + timedelta(hours=3, minutes=30)).isoformat(),
                "providerId": "prov3",
                "status": "in_progress",
                "matchingAttempts": [
                    {"providerId": "prov3", "sentAt": (start_at + timedelta(hours=3, minutes=1)).isoformat(), "status": "expired"},
                ],
                "events": [
                    {"type": "matching_rotation_wave_added", "stage": 3, "at": (start_at + timedelta(hours=3, minutes=5)).isoformat()},
                ],
            },
            {
                "id": "sr3",
                "createdAt": (start_at + timedelta(hours=5)).isoformat(),
                "status": "matching",
                "matchingAttempts": [
                    {"providerId": "prov4", "sentAt": (start_at + timedelta(hours=5, minutes=1)).isoformat(), "status": "pending"},
                ],
                "events": [],
            },
        ]

        snapshot = build_operational_kpis_snapshot_from_docs(
            service_requests=service_requests,
            notifications_seen=7,
            notifications_acknowledged=2,
            notifications_opened=9,
            start_at=start_at,
            end_at=end_at,
        )

        kpis = snapshot["kpis"]
        self.assertEqual(kpis["fill_rate"]["numerator"], 2)
        self.assertEqual(kpis["fill_rate"]["denominator"], 3)
        self.assertAlmostEqual(kpis["fill_rate"]["value"], 2 / 3, places=6)
        self.assertEqual(kpis["assignment_time"]["count"], 2)
        self.assertEqual(kpis["assignment_time"]["avg_seconds"], 1200.0)
        self.assertEqual(kpis["offers_sent"], 4)
        self.assertEqual(kpis["offers_rejected"], 1)
        self.assertEqual(kpis["offers_expired"], 1)
        self.assertEqual(kpis["wave2_triggered"], 1)
        self.assertEqual(kpis["wave3_triggered"], 1)
        self.assertEqual(kpis["duplicate_no_arrival"], 1)
        self.assertEqual(kpis["notifications_seen"], 7)
        self.assertEqual(kpis["notifications_opened"], 9)
        self.assertEqual(kpis["notifications_acknowledged"], 2)

    async def test_operational_kpi_store_sums_daily_open_counters(self):
        db = FakeDB()
        day1 = datetime(2026, 1, 10, 10, tzinfo=timezone.utc)
        day2 = datetime(2026, 1, 11, 12, tzinfo=timezone.utc)

        await inc_metric(db, "notifications_opened", when=day1)
        await inc_metric(db, "notifications_opened", when=day1, delta=2)
        await inc_metric(db, "notifications_opened", when=day2, delta=4)

        total = await sum_metric(
            db,
            "notifications_opened",
            start_at=day1 - timedelta(hours=1),
            end_at=day2 + timedelta(hours=1),
        )

        self.assertEqual(total, 7)


if __name__ == "__main__":
    unittest.main()
