import unittest


class _FakeInsertOneResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id


def _get_nested(doc, dotted_key):
    cur = doc
    for part in dotted_key.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def _matches(doc, query):
    for k, v in (query or {}).items():
        if k.startswith("$"):
            raise NotImplementedError(k)
        if "." in k:
            if _get_nested(doc, k) != v:
                return False
        else:
            if doc.get(k) != v:
                return False
    return True


class _FakeCollection:
    def __init__(self, initial=None):
        self.docs = list(initial or [])

    async def find_one(self, query=None, projection=None):
        for d in self.docs:
            if _matches(d, query):
                if projection is None:
                    return dict(d)
                if any(bool(v) for v in projection.values()):
                    out = {}
                    for k, inc in projection.items():
                        if not inc:
                            continue
                        if k in d:
                            out[k] = d[k]
                    return out
                out = dict(d)
                for k, exc in projection.items():
                    if exc == 0 and k in out:
                        out.pop(k, None)
                return out
        return None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))
        return _FakeInsertOneResult(doc.get("_id") or doc.get("id"))

    async def update_one(self, query, update, upsert=False):
        for d in self.docs:
            if _matches(d, query):
                if "$set" in update:
                    d.update(update["$set"])
                if "$inc" in update:
                    for k, delta in update["$inc"].items():
                        d[k] = int(d.get(k) or 0) + int(delta or 0)
                return
        if upsert:
            new_doc = dict(query)
            if "$set" in update:
                new_doc.update(update["$set"])
            if "$inc" in update:
                for k, delta in update["$inc"].items():
                    new_doc[k] = int(new_doc.get(k) or 0) + int(delta or 0)
            self.docs.append(new_doc)


class _FakeDB:
    def __init__(self):
        self.service_requests = _FakeCollection()
        self.payments = _FakeCollection()
        self.users = _FakeCollection()
        self.oneclick_inscriptions = _FakeCollection()
        self.oneclick_evidence = _FakeCollection()
        self.payment_intents = _FakeCollection()
        self.payment_ledger = _FakeCollection()
        self.payment_rollout = _FakeCollection()
        self.payment_rollout_counters = _FakeCollection()
        self.payment_dead_letters = _FakeCollection()

    def __getitem__(self, name):
        return getattr(self, name)


class PaymentServiceTransbankIdempotencyTest(unittest.IsolatedAsyncioTestCase):
    async def test_retry_same_booking_authorize_called_once_and_buy_order_stable(self):
        from services import payment_service as ps_mod
        from services.payment_service import PaymentService

        db = _FakeDB()
        booking_id = "booking_123"
        sr_id = "sr_123"
        client_id = "c_123"
        amount = 10000.0

        await db.users.insert_one({"id": client_id, "email": "idem@maqgo.cl", "cardLastFour": "1234"})
        await db.oneclick_inscriptions.insert_one(
            {"email": "idem@maqgo.cl", "username": "u", "tbk_user": "tbk"}
        )
        await db.service_requests.insert_one(
            {
                "id": sr_id,
                "bookingId": booking_id,
                "clientId": client_id,
                "paymentStatus": "charging",
                "totalAmount": amount,
            }
        )

        calls = {"n": 0, "buy_orders": []}

        def fake_authorize(*, username, tbk_user, buy_order, amount):
            calls["n"] += 1
            calls["buy_orders"].append(buy_order)
            return {
                "buy_order": buy_order,
                "details": [
                    {
                        "commerce_code": "child",
                        "buy_order": buy_order,
                        "response_code": 0,
                        "status": "AUTHORIZED",
                        "authorization_code": "AUTH123",
                    }
                ],
            }

        old_authorize = ps_mod.provider_oneclick_authorize
        ps_mod.provider_oneclick_authorize = fake_authorize
        try:
            svc = PaymentService(db)
            r1 = await svc.charge_for_accept(sr_id, client_id, amount, booking_id=booking_id)
            r2 = await svc.charge_for_accept(sr_id, client_id, amount, booking_id=booking_id)
        finally:
            ps_mod.provider_oneclick_authorize = old_authorize

        self.assertEqual(calls["n"], 1)
        self.assertEqual(calls["buy_orders"], [booking_id])
        self.assertEqual(r1.get("status"), "charged")
        self.assertTrue(r2.get("short_circuit") or r2.get("skipped_authorize"))
        self.assertEqual(r2.get("status"), "charged")

        sr = await db.service_requests.find_one({"id": sr_id}, {"_id": 0, "paymentStatus": 1, "paymentId": 1})
        self.assertEqual(sr.get("paymentStatus"), "charged")
        self.assertTrue(sr.get("paymentId"))

        p = await db.payments.find_one({"id": sr.get("paymentId")})
        self.assertEqual(p.get("status"), "charged")
        self.assertEqual(p.get("tbkBuyOrder"), booking_id)
        self.assertEqual(p.get("bookingId"), booking_id)
        self.assertEqual(p.get("response_code"), 0)
        self.assertEqual(p.get("authorization_code"), "AUTH123")
