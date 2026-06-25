import unittest
import os
import sys
from datetime import datetime, timedelta, timezone

from pymongo.errors import DuplicateKeyError


sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class FakeUpdateResult:
    def __init__(self, modified_count: int):
        self.modified_count = modified_count


def _matches(doc: dict, query: dict) -> bool:
    for k, v in query.items():
        if k == "$or":
            if not any(_matches(doc, sub) for sub in v):
                return False
            continue
        if isinstance(v, dict):
            for op, op_val in v.items():
                if op == "$exists":
                    exists = (k in doc) and (doc.get(k) is not None)
                    if bool(op_val) != exists:
                        return False
                elif op == "$lte":
                    cur = doc.get(k)
                    if cur is None:
                        return False
                    if cur > op_val:
                        return False
                else:
                    raise AssertionError(f"Unsupported op {op} for key {k}")
            continue
        if doc.get(k) != v:
            return False
    return True


class FakeCollection:
    def __init__(self):
        self.docs = {}

    async def update_one(self, query, update, upsert=False):
        _ = upsert
        _id = query.get("_id")
        if _id not in self.docs:
            return FakeUpdateResult(0)
        cur = dict(self.docs[_id])
        if not _matches(cur, query):
            return FakeUpdateResult(0)
        if "$set" in update:
            for sk, sv in update["$set"].items():
                cur[sk] = sv
        self.docs[_id] = cur
        return FakeUpdateResult(1)

    async def insert_one(self, doc):
        _id = doc.get("_id")
        if _id in self.docs:
            raise DuplicateKeyError("dup")
        self.docs[_id] = dict(doc)
        return {"inserted_id": _id}


class FakeDB:
    def __init__(self):
        self.maqgo_runtime_locks = FakeCollection()


class TestSchedulerLock(unittest.IsolatedAsyncioTestCase):
    async def test_acquire_renew_and_takeover(self):
        from services.scheduler_lock import try_acquire_mongo_lock

        db = FakeDB()
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)

        ok1 = await try_acquire_mongo_lock(db, "timer_scheduler", owner="a", ttl_sec=30, now=now)
        self.assertTrue(ok1)

        ok2 = await try_acquire_mongo_lock(db, "timer_scheduler", owner="b", ttl_sec=30, now=now)
        self.assertFalse(ok2)

        ok3 = await try_acquire_mongo_lock(db, "timer_scheduler", owner="a", ttl_sec=30, now=now + timedelta(seconds=5))
        self.assertTrue(ok3)

        expired = now + timedelta(seconds=36)
        ok4 = await try_acquire_mongo_lock(db, "timer_scheduler", owner="b", ttl_sec=30, now=expired)
        self.assertTrue(ok4)
