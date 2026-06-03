import os
import sys
from dataclasses import dataclass

BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)


@dataclass
class _RedisEntry:
    value: str
    ttl: int


class FakeRedis:
    def __init__(self):
        self._store: dict[str, _RedisEntry] = {}

    def get(self, key: str):
        entry = self._store.get(key)
        return entry.value if entry else None

    def ttl(self, key: str):
        entry = self._store.get(key)
        return entry.ttl if entry else -1

    def setex(self, key: str, ttl: int, value: str):
        self._store[key] = _RedisEntry(value=str(value), ttl=int(ttl))
        return True

    def incr(self, key: str):
        current = int(self.get(key) or "0")
        next_val = current + 1
        ttl = self.ttl(key)
        if ttl <= 0:
            ttl = 0
        self._store[key] = _RedisEntry(value=str(next_val), ttl=int(ttl))
        return next_val

    def expire(self, key: str, ttl: int):
        entry = self._store.get(key)
        if not entry:
            return False
        self._store[key] = _RedisEntry(value=entry.value, ttl=int(ttl))
        return True

    def delete(self, *keys: str):
        for k in keys:
            self._store.pop(k, None)
        return True

    def pipeline(self):
        return _FakePipeline(self)


class _FakePipeline:
    def __init__(self, redis: FakeRedis):
        self._redis = redis
        self._ops = []

    def setex(self, key: str, ttl: int, value: str):
        self._ops.append(("setex", key, ttl, value))
        return self

    def incr(self, key: str):
        self._ops.append(("incr", key))
        return self

    def expire(self, key: str, ttl: int):
        self._ops.append(("expire", key, ttl))
        return self

    def execute(self):
        for op in self._ops:
            if op[0] == "setex":
                _, key, ttl, value = op
                self._redis.setex(key, ttl, value)
            elif op[0] == "incr":
                _, key = op
                self._redis.incr(key)
            elif op[0] == "expire":
                _, key, ttl = op
                self._redis.expire(key, ttl)
        self._ops = []
        return True


def test_send_otp_reuses_existing_for_5_minutes(monkeypatch):
    import importlib
    import services.otp_service as otp_service

    importlib.reload(otp_service)

    fake = FakeRedis()
    sms_calls = {"count": 0}

    def fake_get_redis():
        return fake

    def fake_send_sms(phone: str, message: str):
        sms_calls["count"] += 1
        return True, None

    monkeypatch.setattr(otp_service, "_get_redis", fake_get_redis)
    monkeypatch.setattr(otp_service, "send_sms", fake_send_sms)

    phone = "+56912345678"

    first = otp_service.send_otp(phone, channel="sms")
    assert first["success"] is True
    assert first["reused"] is False
    assert sms_calls["count"] == 1

    second = otp_service.send_otp(phone, channel="sms")
    assert second["success"] is True
    assert second["reused"] is True
    assert int(second.get("ttl_seconds") or 0) > 0
    assert sms_calls["count"] == 1

