import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


def test_builder_super_master_has_bank_and_masters():
    from security.provider_permissions_builder import build_provider_permissions

    user = {
        "id": "u1",
        "role": "provider",
        "provider_role": "super_master",
        "owner_id": None,
    }

    perms = build_provider_permissions(user, "super_master")
    assert perms["can_view_bank_data"] is True
    assert perms["can_manage_masters"] is True
    assert perms["can_view_finances"] is True
    assert perms["can_accept_requests"] is True


def test_builder_master_permissions_driven_by_master_permissions_dict():
    from security.provider_permissions_builder import build_provider_permissions

    user = {
        "id": "m1",
        "role": "provider",
        "provider_role": "master",
        "owner_id": "o1",
        "master_permissions": {
            "can_view_finance": True,
            "can_create_work": True,
            "can_manage_operators": False,
        },
    }

    perms = build_provider_permissions(user, "master")
    assert perms["can_view_finances"] is True
    assert perms["can_accept_requests"] is True
    assert perms["can_manage_operators"] is False
    assert perms["can_manage_masters"] is False
    assert perms["can_view_bank_data"] is False

