"""
Políticas de acceso centralizadas (fuente única de verdad).

Objetivo:
- Evitar checks ad-hoc por endpoint.
- Forzar patrón actor (token) + target (path/body).
- Reducir riesgo de IDOR y bypass por omisión humana.
"""
from __future__ import annotations

from fastapi import HTTPException
from bson import ObjectId


class AccessPolicy:
    @staticmethod
    def is_admin(user: dict) -> bool:
        roles = user.get("roles") or []
        return user.get("role") == "admin" or (isinstance(roles, list) and "admin" in roles)

    @staticmethod
    def is_owner_like(user: dict) -> bool:
        provider_role = user.get("provider_role")
        return provider_role in {None, "owner", "super_master", "master"}

    @classmethod
    def assert_admin(cls, user: dict) -> None:
        if not cls.is_admin(user):
            raise HTTPException(status_code=403, detail="Acceso restringido")

    @classmethod
    def assert_self_or_admin(cls, actor: dict, target_user_id: str) -> None:
        if cls.is_admin(actor):
            return
        if actor.get("id") != target_user_id:
            raise HTTPException(status_code=403, detail="No autorizado")

    @classmethod
    def assert_owner_scope(cls, actor: dict, owner_id: str) -> None:
        if cls.is_admin(actor):
            return
        actor_company = cls.company_owner_id(actor)
        if not cls.is_owner_like(actor) or actor_company != owner_id:
            raise HTTPException(status_code=403, detail="No autorizado para este owner")

    @classmethod
    def company_owner_id(cls, user: dict) -> str | None:
        """
        Empresa canónica:
        - owner/super_master: su owner es él mismo
        - master/operator: owner_id
        - operator: owner_id
        """
        if not user:
            return None
        provider_role = user.get("provider_role")
        if provider_role in {None, "owner", "super_master"}:
            return user.get("id")
        return user.get("owner_id")

    @classmethod
    def assert_provider_scope_sync(cls, db, actor: dict, provider_id: str) -> None:
        """
        Autoriza acceso al scope de proveedor:
        - admin
        - el mismo usuario
        - miembros owner/master de la misma empresa
        """
        if cls.is_admin(actor):
            return
        actor_id = actor.get("id")
        if actor_id == provider_id:
            return

        actor_company = cls.company_owner_id(actor)
        if not actor_company:
            raise HTTPException(status_code=403, detail="No autorizado para proveedor")

        target = db.users.find_one({"id": provider_id}, {"id": 1, "owner_id": 1, "provider_role": 1})
        if not target:
            raise HTTPException(status_code=404, detail="Proveedor no encontrado")

        target_company = target.get("id") if cls.is_owner_like(target) else target.get("owner_id")
        if actor_company != target_company:
            raise HTTPException(status_code=403, detail="No autorizado para proveedor")

    @classmethod
    def can_access_service_sync(cls, db, actor: dict, service_id: str) -> bool:
        """
        Verifica pertenencia del actor en service_requests/services.
        `db` es una instancia sync (pymongo) del módulo llamador.
        """
        if cls.is_admin(actor):
            return True

        actor_id = actor.get("id")
        if not actor_id:
            return False

        req = db.service_requests.find_one(
            {"id": service_id},
            {"clientId": 1, "providerId": 1, "operator_id": 1},
        )
        if req and actor_id in {req.get("clientId"), req.get("providerId"), req.get("operator_id")}:
            return True

        svc_query = {"id": service_id}
        if ObjectId.is_valid(service_id):
            svc_query = {"$or": [{"id": service_id}, {"_id": ObjectId(service_id)}]}
        svc = db.services.find_one(
            svc_query,
            {"client_id": 1, "provider_id": 1, "operator_id": 1},
        )
        return bool(svc and actor_id in {svc.get("client_id"), svc.get("provider_id"), svc.get("operator_id")})
