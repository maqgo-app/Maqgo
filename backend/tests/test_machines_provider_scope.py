import pytest

from security.policy import AccessPolicy


def _effective_provider_id(current_user: dict, requested: str | None, *, is_admin: bool) -> str | None:
    if is_admin:
        return (requested or current_user.get("owner_id") or current_user.get("id") or "").strip() or None
    return AccessPolicy.company_owner_id(current_user)


@pytest.mark.parametrize(
    "user,requested,expected",
    [
        ({"id": "ownerA", "provider_role": "super_master"}, None, "ownerA"),
        ({"id": "ownerA", "provider_role": "owner"}, None, "ownerA"),
        ({"id": "ownerA", "provider_role": None}, None, "ownerA"),
        ({"id": "master1", "provider_role": "master", "owner_id": "ownerA"}, None, "ownerA"),
        ({"id": "master1", "provider_role": "master", "owner_id": "ownerA"}, "master1", "ownerA"),
        ({"id": "op1", "provider_role": "operator", "owner_id": "ownerA"}, None, "ownerA"),
    ],
)
def test_non_admin_provider_scope_is_canonical_company(user, requested, expected):
    assert _effective_provider_id(user, requested, is_admin=False) == expected


def test_admin_can_override_provider_scope_with_query():
    admin = {"id": "admin1", "role": "admin", "roles": ["admin"]}
    assert _effective_provider_id(admin, "ownerA", is_admin=True) == "ownerA"
    assert _effective_provider_id(admin, None, is_admin=True) == "admin1"

