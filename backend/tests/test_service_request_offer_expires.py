import unittest
import os
import sys


sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class _FakeServiceRequests:
    def __init__(self, doc: dict):
        self._doc = dict(doc)

    async def find_one(self, *_args, **_kwargs):
        return dict(self._doc)


class _FakeDB:
    def __init__(self, doc: dict):
        self.service_requests = _FakeServiceRequests(doc)


class TestOfferExpiresParsing(unittest.IsolatedAsyncioTestCase):
    async def test_invalid_offer_expires_does_not_crash(self):
        import routes.service_requests as sr

        sr.db = _FakeDB(
            {
                "id": "req-1",
                "clientId": "c1",
                "status": "offer_sent",
                "offerExpiresAt": "not-a-date",
            }
        )

        async def _noop_attach(*_a, **_k):
            return None

        sr._attach_client_matching_view = lambda _req: None
        sr._attach_approx_provider_location = _noop_attach

        fn = getattr(sr.get_service_request, "__wrapped__", sr.get_service_request)
        out = await fn(request=None, request_id="req-1", current_user={"role": "client", "id": "c1"})
        assert out.get("id") == "req-1"
        assert out.get("status") == "offer_sent"
        assert "remainingSeconds" not in out

    async def test_valid_offer_expires_sets_remaining_seconds(self):
        import routes.service_requests as sr

        sr.db = _FakeDB(
            {
                "id": "req-2",
                "clientId": "c1",
                "status": "offer_sent",
                "offerExpiresAt": "2999-01-01T00:00:00Z",
            }
        )

        async def _noop_attach(*_a, **_k):
            return None

        sr._attach_client_matching_view = lambda _req: None
        sr._attach_approx_provider_location = _noop_attach

        fn = getattr(sr.get_service_request, "__wrapped__", sr.get_service_request)
        out = await fn(request=None, request_id="req-2", current_user={"role": "client", "id": "c1"})
        assert isinstance(out.get("remainingSeconds"), int)
        assert out["remainingSeconds"] > 0
