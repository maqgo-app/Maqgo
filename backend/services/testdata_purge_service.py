from __future__ import annotations

from typing import Any, Dict


def _as_int(value: Any) -> int:
    try:
        return int(value)
    except Exception:
        return 0


async def _count_or_delete(collection: Any, filter_doc: dict, *, dry_run: bool) -> int:
    if dry_run:
        return _as_int(await collection.count_documents(filter_doc))
    result = await collection.delete_many(filter_doc)
    return _as_int(getattr(result, "deleted_count", 0) or 0)


async def purge_user_testdata(
    db: Any,
    user_id: str,
    *,
    dry_run: bool = True,
) -> Dict[str, Any]:
    user_id = (user_id or "").strip()
    if not user_id:
        return {"ok": False, "detail": "missing_user_id"}

    services_filter = {
        "$or": [
            {"provider_id": user_id},
            {"providerId": user_id},
            {"client_id": user_id},
            {"clientId": user_id},
            {"operator_id": user_id},
            {"operatorId": user_id},
        ]
    }
    services = await db.services.find(services_filter, {"_id": 0, "id": 1}).to_list(20000)
    service_ids: list[str] = [str(x.get("id")).strip() for x in (services or []) if str(x.get("id") or "").strip()]

    service_requests_filter = {
        "$or": [
            {"clientId": user_id},
            {"providerId": user_id},
            {"offeredProviderIds": user_id},
            {"matchingAttempts.providerId": user_id},
            {"events.byUserId": user_id},
            {"confirmedDepartureLocation.confirmedByUserId": user_id},
            {"etaConfirmedByUserId": user_id},
            {"providerIntentByUserId": user_id},
            {"acceptedByUserId": user_id},
        ]
    }
    sreqs = await db.service_requests.find(service_requests_filter, {"_id": 0, "id": 1}).to_list(20000)
    service_request_ids: list[str] = [str(x.get("id")).strip() for x in (sreqs or []) if str(x.get("id") or "").strip()]

    message_filter: dict = {"sender_id": user_id}
    if service_ids:
        message_filter = {"$or": [{"sender_id": user_id}, {"service_id": {"$in": service_ids}}]}

    result: Dict[str, Any] = {
        "ok": True,
        "dry_run": bool(dry_run),
        "user_id": user_id,
        "service_ids": len(service_ids),
        "service_request_ids": len(service_request_ids),
        "deleted": {},
    }

    result["deleted"]["messages"] = await _count_or_delete(db.messages, message_filter, dry_run=dry_run)
    result["deleted"]["invoice_attempts"] = await _count_or_delete(
        db.invoice_attempts, {"providerId": user_id}, dry_run=dry_run
    )
    result["deleted"]["invoices"] = await _count_or_delete(
        db.invoices, {"$or": [{"providerId": user_id}, {"clientId": user_id}]}, dry_run=dry_run
    )
    result["deleted"]["payments_oneclick"] = await _count_or_delete(
        db.payments_oneclick, {"user_id": user_id}, dry_run=dry_run
    )

    payments_filter: dict = {"clientId": user_id}
    if service_request_ids:
        payments_filter = {"$or": [{"clientId": user_id}, {"serviceRequestId": {"$in": service_request_ids}}]}
    result["deleted"]["payments"] = await _count_or_delete(db.payments, payments_filter, dry_run=dry_run)

    result["deleted"]["services"] = await _count_or_delete(db.services, services_filter, dry_run=dry_run)
    result["deleted"]["service_requests"] = await _count_or_delete(db.service_requests, service_requests_filter, dry_run=dry_run)
    result["deleted"]["machines"] = await _count_or_delete(
        db.machines, {"$or": [{"provider_id": user_id}, {"providerId": user_id}]}, dry_run=dry_run
    )
    result["deleted"]["users"] = await _count_or_delete(db.users, {"id": user_id}, dry_run=dry_run)

    return result
