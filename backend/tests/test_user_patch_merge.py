import asyncio
import pathlib
import sys
from types import SimpleNamespace

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


def test_patch_user_merges_nested_onboarding_dicts(monkeypatch):
    import routes.users as users

    original_doc = {
        "id": "user_test_provider",
        "phone": "+56994336579",
        "providerData": {
            "businessName": "Maquinarias Tomas",
            "address": "Federico Lathrop 12517",
        },
        "machineData": {
            "machineryType": "camion_aljibe",
            "brand": "Mercedes",
            "model": "Atego",
            "licensePlate": "BBBB-22",
        },
    }

    class _FakeUsersCollection:
        def __init__(self):
            self.doc = dict(original_doc)
            self.last_set = None

        async def find_one(self, query, projection=None):
            assert query == {"id": "user_test_provider"}
            doc = dict(self.doc)
            if projection and projection.get("password") == 0:
                doc.pop("password", None)
            return doc

        async def update_one(self, query, update):
            assert query == {"id": "user_test_provider"}
            self.last_set = update["$set"]
            self.doc.update(self.last_set)
            return SimpleNamespace(matched_count=1)

    class _FakeDB:
        def __init__(self):
            self.users = _FakeUsersCollection()

    fake_db = _FakeDB()
    monkeypatch.setattr(users, "db", fake_db)

    result = asyncio.run(
        users.patch_user(
            "user_test_provider",
            body={
                "providerData": {"bankData": {"bank": "Banco Estado"}},
                "machineData": {"licensePlate": "KLKL-66"},
            },
            _={},
        )
    )

    assert fake_db.users.last_set["providerData"] == {
        "businessName": "Maquinarias Tomas",
        "address": "Federico Lathrop 12517",
        "bankData": {"bank": "Banco Estado"},
    }
    assert fake_db.users.last_set["machineData"] == {
        "machineryType": "camion_aljibe",
        "brand": "Mercedes",
        "model": "Atego",
        "licensePlate": "KLKL-66",
    }
    assert fake_db.users.last_set["machineryType"] == "camion_aljibe"
    assert result["machineData"]["brand"] == "Mercedes"
    assert result["machineData"]["model"] == "Atego"
