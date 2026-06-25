from typing import Any, Dict, List, Optional, TypedDict

from security.provider_permissions_builder import build_provider_permissions


class AccessContext(TypedDict, total=False):
    user_id: str
    active_role: str
    roles: List[str]
    provider_role: Optional[str]
    owner_id: Optional[str]
    scopes: Dict[str, Any]
    permissions: Dict[str, bool]
    capabilities: List[str]
    grants: Dict[str, Any]
    catalog_version: str


def normalize_provider_role_for_api(user: dict, roles: List[str]) -> Optional[str]:
    if "provider" not in roles:
        return None

    pr = user.get("provider_role")
    if pr in (None, "owner"):
        return "super_master"

    if pr in {"super_master", "master", "operator"}:
        return pr

    return None


def build_access_context(user: dict, roles: List[str], active_role: str) -> AccessContext:
    ctx: AccessContext = {
        "user_id": str(user.get("id") or ""),
        "active_role": str(active_role or ""),
        "roles": list(roles or []),
        "capabilities": [],
        "grants": {},
        "catalog_version": "v1",
    }

    pr = normalize_provider_role_for_api(user, roles)
    ctx["provider_role"] = pr

    owner_id = user.get("owner_id")
    if pr == "super_master":
        owner_id = None
    ctx["owner_id"] = owner_id

    scopes: Dict[str, Any] = {}
    if pr:
        scopes["owner_id"] = owner_id or user.get("id")
        scopes["provider_role"] = pr
    ctx["scopes"] = scopes

    permissions: Dict[str, bool] = {}
    if pr:
        permissions = build_provider_permissions(user, pr)
    ctx["permissions"] = permissions

    return ctx

