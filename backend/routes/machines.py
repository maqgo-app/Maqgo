from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient

from auth_dependency import get_current_user
from db_config import get_db_name, get_mongo_url
from security.policy import AccessPolicy
from services.machines_service import (
    create_machine,
    delete_machine,
    list_provider_machines,
    serialize_machine,
    update_machine,
)


router = APIRouter(prefix="/machines", tags=["machines"])

client = AsyncIOMotorClient(get_mongo_url())
db = client[get_db_name()]


async def _assert_machine_access(machine_id: str, current_user: dict) -> dict:
    machine = await db.machines.find_one({"id": machine_id, "status": {"$ne": "deleted"}}, {"_id": 0})
    if not machine:
        raise HTTPException(status_code=404, detail="Maquinaria no encontrada")
    AccessPolicy.assert_owner_scope(current_user, machine.get("provider_id"))
    return machine


@router.get("")
async def get_machines(
    provider_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    if AccessPolicy.is_admin(current_user):
        provider_id = provider_id or current_user.get("owner_id") or current_user.get("id")
    else:
        provider_id = AccessPolicy.company_owner_id(current_user)
    if not provider_id:
        raise HTTPException(status_code=400, detail="provider_id requerido")
    AccessPolicy.assert_owner_scope(current_user, provider_id)
    machines = await list_provider_machines(db, provider_id)
    return {"machines": [serialize_machine(m) for m in machines]}


@router.post("")
async def post_machine(
    body: Dict[str, Any] = Body(...),
    current_user: dict = Depends(get_current_user),
):
    if AccessPolicy.is_admin(current_user):
        provider_id = body.get("provider_id") or current_user.get("owner_id") or current_user.get("id")
    else:
        provider_id = AccessPolicy.company_owner_id(current_user)
    if not provider_id:
        raise HTTPException(status_code=400, detail="provider_id requerido")
    AccessPolicy.assert_owner_scope(current_user, provider_id)
    try:
        machine = await create_machine(db, provider_id, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"ok": True, "machine": serialize_machine(machine)}


@router.patch("/{machine_id}")
async def patch_machine(
    machine_id: str,
    body: Dict[str, Any] = Body(...),
    current_user: dict = Depends(get_current_user),
):
    await _assert_machine_access(machine_id, current_user)
    machine = await update_machine(db, machine_id, body)
    if not machine:
        raise HTTPException(status_code=404, detail="Maquinaria no encontrada")
    return {"ok": True, "machine": serialize_machine(machine)}


@router.delete("/{machine_id}")
async def remove_machine(
    machine_id: str,
    current_user: dict = Depends(get_current_user),
):
    machine = await _assert_machine_access(machine_id, current_user)
    if not AccessPolicy.is_admin(current_user):
        provider_role = current_user.get("provider_role")
        normalized_role = "super_master" if provider_role in {None, "owner"} else provider_role
        if normalized_role != "super_master":
            raise HTTPException(status_code=403, detail="Solo el supermaster puede eliminar máquinas")
    machine = await delete_machine(db, machine_id)
    if not machine:
        raise HTTPException(status_code=404, detail="Maquinaria no encontrada")
    return {"ok": True}
